import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthedUser, authErrorResponse } from '@/lib/auth/apiAuth'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function generateEmbedding(text: string): Promise<number[] | null> {
  try {
    const res = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: 'voyage-large-2', input: text.slice(0, 8000) }),
    })
    const data = await res.json()
    return data?.data?.[0]?.embedding ?? null
  } catch { return null }
}

async function retrieveSimilarSWMS(embedding: number[]): Promise<string> {
  try {
    const { data: chunks } = await supabase.rpc('match_document_chunks', {
      query_embedding: embedding,
      match_count: 5,
      filter_scope: 'global',
      filter_project: null,
    })
    if (!chunks || chunks.length === 0) return ''
    return chunks.map((c: { content: string }) => c.content).join('\n\n---\n\n')
  } catch { return '' }
}

export async function POST(req: NextRequest) {
  // This endpoint only draws on the global SWMS library (not a specific
  // project's documents), so the only check needed is "is someone actually
  // signed in" - previously this ran for anyone, logged in or not, billing
  // every call straight to the Anthropic key above.
  const auth = await getAuthedUser()
  if (!auth.ok) return authErrorResponse(auth)

  const {
    workDescription, discipline, clientType, workLocation,
    additionalContext, principalContractor,
  } = await req.json()

  const queryText = `${workDescription} ${discipline} ${clientType} ${workLocation || ''} ${additionalContext || ''}`
  const embedding = await generateEmbedding(queryText)
  let ragContext = ''
  if (embedding) ragContext = await retrieveSimilarSWMS(embedding)

  const systemPrompt = `You are a senior NZ construction safety engineer with 20 years experience writing SWMS documents compliant with HSWA 2015.

${ragContext ? `REFERENCE EXAMPLES FROM SIMILAR NZ CONSTRUCTION SWMS:\n${ragContext}\n\n---` : ''}

Generate ONLY the following sections as a JSON object. The engineer has already filled in the header, personnel, training, drawings, resources, environment and stakeholder sections manually.

Return ONLY valid JSON with exactly these keys:

{
  "ppe": string[],
  // 6-10 specific PPE items with AS/NZS standards where applicable
  // e.g. "Safety Helmet with Chin Strap (AS/NZS 1801:1997)"

  "hazardous_substances": [
  // List substances that would realistically be present for this specific work
  // e.g. diesel, hydraulic oil, spray paint, concrete, grout, chemicals
    {
      "substance": string,
      "hazardous": boolean,
      "dangerous": boolean,
      "ppe_requirements": string,
      "hazards": string,
      "controls": string
    }
  ],

  "hazard_identification": {
  // Set true ONLY for hazards that genuinely apply to this specific work
    "work_location": boolean,
    "difficult_entry_exit": boolean,
    "oxygen_deficiency": boolean,
    "oxygen_excess": boolean,
    "engulfment": boolean,
    "toxic_gas": boolean,
    "explosive_gas": boolean,
    "difficult_rescue": boolean,
    "confined_space_permit": boolean,
    "hot_work_permit": boolean,
    "excavation_permit": boolean,
    "working_at_heights": boolean,
    "scaffolding": boolean,
    "elevated_work_platforms": boolean,
    "ladders": boolean,
    "fall_restraint": boolean,
    "fall_arrest": boolean,
    "falling_objects": boolean,
    "work_near_excavations": boolean,
    "work_at_heights_permit": boolean,
    "demolition_permit": boolean,
    "live_equipment": boolean,
    "plant_room_hazards": boolean,
    "live_rails": boolean,
    "moving_machinery": boolean,
    "pressurised_fluids": boolean,
    "pneumatics": boolean,
    "automated_controls": boolean,
    "radiation": boolean,
    "electrical_permit": boolean,
    "trip_hazards": boolean,
    "slippery_surfaces": boolean,
    "poor_lighting": boolean,
    "high_noise": boolean,
    "housekeeping": boolean,
    "moving_traffic": boolean,
    "extreme_temps": boolean,
    "remote_area": boolean,
    "dust_fibres": boolean,
    "suspended_loads": boolean,
    "isolation_plan": boolean,
    "air_pollution_dust": boolean,
    "air_pollution_fumes": boolean,
    "soil_erosion": boolean,
    "vegetation_removal": boolean,
    "water_pollution": boolean,
    "chemical_spills": boolean,
    "pesticides": boolean,
    "community_impact": boolean,
    "spills_drains": boolean,
    "near_waterbody": boolean,
    "gloves": boolean,
    "goggles": boolean,
    "face_shield": boolean,
    "dust_mask": boolean,
    "hearing_ppe": boolean,
    "harnesses": boolean,
    "hi_vis": boolean,
    "erosion_control": boolean,
    "reduced_speeds": boolean,
    "signage": boolean,
    "barricades": boolean,
    "ventilation": boolean,
    "personal_locks": boolean,
    "rescue_plans": boolean,
    "extra_lighting": boolean
  },

  "activities": [
  // Generate as many activities as the work genuinely requires
  // Simple jobs: 4-6, complex jobs: 10-15
    {
      "step_number": string,
      "activity_description": string,
      "hazards": [{ "description": string }],
      "initial_risk_rating": "low" | "medium" | "high" | "critical",
      "control_measures": string[],
      "residual_risk_rating": "low" | "medium" | "high" | "critical",
      "responsible_person": string,
      "legislative_reference": string
    }
  ],

  "emergency_response": string
  // Specific emergency response procedure for this work
}

Rules:
- Use real NZ legislation (HSWA 2015, Health and Safety at Work (General Risk and Workplace Management) Regulations 2016, relevant NZS/AS standards)
- Be specific to the work described - reference the actual work type
- Control measures MUST follow Hierarchy of Controls: Elimination → Substitution → Isolation → Engineering → Administrative → PPE
- Hazardous substances must be realistic for the work (e.g. diesel for plant, hydraulic oil, concrete, grout, spray paint etc)
- No markdown, no explanation, only the JSON object`

  const userPrompt = `Generate SWMS content for:
WORK: ${workDescription}
DISCIPLINE: ${discipline}
CLIENT: ${clientType}
LOCATION: ${workLocation || 'New Zealand'}
PRINCIPAL CONTRACTOR: ${principalContractor || 'TBC'}
CONTEXT: ${additionalContext || 'Standard NZ construction project'}

Return only the JSON object.`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 16000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  })

  const data = await response.json()
  return NextResponse.json(data)
}
