import Anthropic from '@anthropic-ai/sdk'
import { createServiceClient } from '../supabase/client'
import { generateEmbedding } from '../embeddings'
import type {
  GenerateITPRequest,
  GenerateSWMSRequest,
  GeneratedITPActivity,
  GeneratedSWMSActivity,
} from '@/types'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

// --- Retrieve similar past ITPs (RAG Layer 1) --------------------------------
async function retrieveSimilarITPs(
  queryEmbedding: number[],
  orgId: string,
  limit = 4
): Promise<string> {
  const supabase = createServiceClient()

  const { data, error } = await supabase.rpc('match_itps', {
    query_embedding: queryEmbedding,
    match_count: limit,
    filter_org_id: orgId,
  })

  if (error || !data?.length) return ''

  // Fetch the full activities for each matched ITP
  const itpIds = data.map((d: { id: string }) => d.id)
  const { data: activities } = await supabase
    .from('itp_activities')
    .select('*')
    .in('itp_id', itpIds)
    .order('sort_order')

  if (!activities?.length) return ''

  // Format as structured examples for the prompt
  const examples = data.map((itp: { id: string; title: string; discipline: string; similarity: number }) => {
    const itpActivities = activities.filter(a => a.itp_id === itp.id)
    const rows = itpActivities.map(a =>
      `  ${a.activity_number} | ${a.section_name} | ${a.description} | ${a.requirements_reference} | ${a.conformance_criteria} | ${a.method} | ${a.frequency} | ${a.hold_witness_type} | ${a.attendance_required?.join(',')} | ${a.records_checklists}`
    ).join('\n')
    return `--- Example ITP: "${itp.title}" (${itp.discipline}, similarity: ${(itp.similarity * 100).toFixed(0)}%) ---\nActNo|Section|Description|Reference|Criteria|Method|Frequency|Type|Attendance|Records\n${rows}`
  }).join('\n\n')

  return examples
}

// --- Retrieve relevant standard/spec chunks (RAG Layer 2) --------------------
async function retrieveRelevantChunks(
  queryEmbedding: number[],
  projectId: string,
  limit = 6
): Promise<string> {
  const supabase = createServiceClient()

  const { data, error } = await supabase.rpc('match_document_chunks', {
    query_embedding: queryEmbedding,
    match_count: limit,
    filter_project: projectId,
  })

  if (error || !data?.length) return ''

  return data.map((chunk: { content: string; metadata: Record<string, string>; similarity: number }) => {
    const source = chunk.metadata?.document_name ?? 'Standard'
    return `[${source}]\n${chunk.content}`
  }).join('\n\n---\n\n')
}

// --- Generate ITP --------------------------------------------------------------
export async function generateITPActivities(
  request: GenerateITPRequest,
  orgId: string
): Promise<GeneratedITPActivity[]> {
  const queryText = `${request.discipline} ${request.work_description} ${request.client_type}`

  // Get embeddings for similarity search
  const queryEmbedding = await generateEmbedding(queryText)

  // RAG: retrieve similar ITPs + relevant standard chunks in parallel
  const [similarITPs, relevantChunks] = await Promise.all([
    retrieveSimilarITPs(queryEmbedding, orgId),
    retrieveRelevantChunks(queryEmbedding, request.project_id),
  ])

  const systemPrompt = `You are a senior NZ construction quality engineer specialising in ITP (Inspection and Test Plan) development. You have deep knowledge of AS/NZS standards, Watercare ESS specifications, Auckland Transport requirements, and NZ construction quality systems.

Your task is to generate ITP activities that match the format and quality of real NZ construction ITPs.

CRITICAL RULES:
- Return ONLY a valid JSON array, no markdown, no explanation
- Use real AS/NZS standard references where applicable (e.g. "AS/NZS 2032:2006 Cl.4.3")
- Hold Points (H) are for critical quality gates requiring client sign-off before proceeding
- Witness Points (W) are for activities requiring notification but can proceed if client absent
- Review (R) is for documentation review only
- Surveillance (S) is ongoing monitoring
- Attendance: "GAJV" = contractor, "WSL" = engineer/client rep, "S/C" = subcontractor
- Adapt attendance to the client_type provided
- Activities must follow a logical construction sequence
- Include Preliminaries (docs/drawings), Materials, Installation, Testing, and Post-Construction sections

HOLD/WITNESS/SURVEILLANCE/RECORD CLASSIFICATION - READ CAREFULLY:
The test for Hold Point is procedural, not about consequence or irreversibility: can the crew physically/contractually proceed to the NEXT step without this being inspected and signed off first?
- Hold Point (H): work CANNOT proceed to the next step until the nominated party has inspected and given sign-off - it is a mandatory stop, full stop. Use this only where the activity itself is a genuine procedural gate that blocks the next step (e.g. the spec requires engineer sign-off before the next stage can begin).
- Witness Point (W): the client/engineer should be notified and may attend to inspect, but if they don't attend, work CAN still proceed to the next step on schedule. This is the default for most routine inspections - most ITP line items should be this.
- Surveillance (S): ongoing monitoring during routine work with no formal notification or attendance expected at all.
- Review (R): documentation, certificates, test reports, material approvals - paperwork, not a physical inspection gate.

Specific domain rules that override the general test above:
- Ongoing/in-progress dimensional or alignment checks done continuously AS work proceeds (the installer self-checking as they go) are Witness Point at most, NOT Hold Point - there is no single gate being passed.
- A FORMAL survey or level/alignment verification at a defined quality gate (not a continuous in-progress check) is a Hold Point - this includes as-built / record drawing verification, and formation or invert level checks immediately before an irreversible cover-up step.
- Concrete pours: BOTH the pre-pour inspection (reinforcement, formwork, levels, embeds checked before the pour proceeds) AND the post-pour inspection (finish, dimensions, curing sign-off before the next stage) are Hold Points - these are two separate, genuine stop-work gates either side of an irreversible pour.

Most real ITPs are NOT dominated by Hold Points - over-using H defeats its purpose and makes the document unusable on site. Do not default to Hold Point out of caution, and do not classify based on how serious the consequence of getting it wrong would be - classify strictly on whether the next step is procedurally blocked without sign-off (subject to the domain rules above). Check before finalising that Hold Points make up only a small minority of the total activities (typically 2-5 per ITP, or more where multiple concrete pours are involved).

RESPONSIBILITY FIELD:
"responsibility" must be one of these role categories, not a job title: Contractor, Subcontractor, Client, Designer, Engineer (or the project's actual company abbreviation for one of these, e.g. "GAJV" for the contractor, "WSL" for the engineer, if given in context). Never use job titles like "Site Supervisor", "Construction Manager", "Site Engineer", "Foreman", etc. - those are not valid values for this field.`

  const userPrompt = `Generate ITP activities for the following work:

WORK DESCRIPTION: ${request.work_description}
DISCIPLINE: ${request.discipline}
CLIENT: ${request.client_type}
ADDITIONAL CONTEXT: ${request.additional_context ?? 'None'}

${similarITPs ? `SIMILAR ITPs FROM YOUR LIBRARY (use these for format, section structure and language only - do NOT copy their "Type" column values; independently classify each activity's Hold/Witness/Surveillance/Record type using the rules in the system prompt, since earlier library entries may themselves be over-classified as Hold Point):\n${similarITPs}` : ''}

${relevantChunks ? `RELEVANT STANDARDS AND SPECIFICATIONS:\n${relevantChunks}` : ''}

Return a JSON array where each object has EXACTLY these keys:
{
  "section": "1.0 Preliminaries",
  "actNo": "1.1",
  "description": "activity name",
  "responsibility": "GAJV",
  "reference": "AS/NZS 2032:2006 Cl.4.3",
  "conformanceCriteria": "specific measurable criteria",
  "method": "Visual inspection / Test / Review",
  "frequency": "Each joint / Prior to installation / etc",
  "type": "W",
  "attendance": ["GAJV", "WSL"],
  "records": "Test records / Photos / Checklist"
}

Generate 8-14 activities covering: Preliminaries, Materials approval, Installation stages, Testing/commissioning, Post-construction. Remember: only a small minority (2-4) should be type "H" - the rest should be a realistic mix of "W", "S" and "R" based on what each specific activity actually warrants.`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const clean = text.replace(/```json|```/g, '').trim()

  try {
    return JSON.parse(clean) as GeneratedITPActivity[]
  } catch {
    throw new Error('Failed to parse Claude response as JSON')
  }
}

// --- Generate SWMS --------------------------------------------------------------
export async function generateSWMSActivities(
  request: GenerateSWMSRequest,
  orgId: string
): Promise<GeneratedSWMSActivity[]> {
  const supabase = createServiceClient()
  const queryText = `${request.discipline} ${request.work_description} safety hazard`
  const queryEmbedding = await generateEmbedding(queryText)

  // Retrieve similar SWMS from library
  const { data: similarSWMSData } = await supabase
    .from('swms')
    .select('id, title, discipline')
    .order('created_at', { ascending: false })
    .limit(3)

  let similarSWMSContext = ''
  if (similarSWMSData?.length) {
    const swmsIds = similarSWMSData.map(s => s.id)
    const { data: acts } = await supabase
      .from('swms_activities')
      .select('*')
      .in('swms_id', swmsIds)
      .order('sort_order')

    if (acts?.length) {
      similarSWMSContext = similarSWMSData.map(s => {
        const activities = acts.filter(a => a.swms_id === s.id)
        const rows = activities.map(a =>
          `  Step ${a.step_number}: ${a.activity_description} | Hazards: ${JSON.stringify(a.hazards)} | Controls: ${a.control_measures?.join('; ')} | Residual: ${a.residual_risk_rating}`
        ).join('\n')
        return `--- Example SWMS: "${s.title}" (${s.discipline}) ---\n${rows}`
      }).join('\n\n')
    }
  }

  // Retrieve relevant standard chunks
  const relevantChunks = await retrieveRelevantChunks(queryEmbedding, request.project_id)

  // If linked ITP, fetch its activities as context
  let itpContext = ''
  if (request.related_itp_id) {
    const { data: itpActs } = await supabase
      .from('itp_activities')
      .select('activity_number, description, hold_witness_type')
      .eq('itp_id', request.related_itp_id)
      .order('sort_order')

    if (itpActs?.length) {
      itpContext = `LINKED ITP ACTIVITIES (align SWMS steps to these):\n${itpActs.map(a => `${a.activity_number}: ${a.description} [${a.hold_witness_type}]`).join('\n')}`
    }
  }

  const systemPrompt = `You are a senior NZ construction Health & Safety professional specialising in SWMS (Safe Work Method Statement) development. You understand NZ Health and Safety at Work Act 2015, NZS standards, and construction site hazard management.

Return ONLY a valid JSON array. Each step must identify real construction hazards with appropriate NZ legislative references (HSWA 2015, WorkSafe NZ guidelines, relevant NZS standards).

Risk matrix: Likelihood x Consequence (each 1-5). Risk rating: 1-4=low, 5-9=medium, 10-16=high, 17-25=critical.`

  const userPrompt = `Generate SWMS activities for:

WORK DESCRIPTION: ${request.work_description}
DISCIPLINE: ${request.discipline}
CLIENT: ${request.client_type}

${similarSWMSContext ? `SIMILAR SWMS FROM LIBRARY:\n${similarSWMSContext}\n` : ''}
${itpContext ? `\n${itpContext}\n` : ''}
${relevantChunks ? `\nRELEVANT STANDARDS:\n${relevantChunks}` : ''}

Return JSON array, each object with EXACTLY:
{
  "stepNumber": "1",
  "activityDescription": "Excavation of trench",
  "hazards": ["Trench collapse", "Underground services strike"],
  "initialRisk": "high",
  "controlMeasures": [
    "Shore or batter trench to NZS 3604",
    "Pothole and mark all underground services prior to excavation",
    "Competent person to inspect daily"
  ],
  "residualRisk": "medium",
  "responsiblePerson": "Site Supervisor",
  "legislativeReference": "HSWA 2015 s36, WorkSafe Excavation Safety Guide"
}

Generate 6-12 steps covering the full work sequence. Each step must have genuine, specific control measures - not generic statements.`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const clean = text.replace(/```json|```/g, '').trim()

  try {
    return JSON.parse(clean) as GeneratedSWMSActivity[]
  } catch {
    throw new Error('Failed to parse Claude SWMS response as JSON')
  }
}

