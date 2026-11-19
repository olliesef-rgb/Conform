import { NextRequest, NextResponse } from 'next/server'
import { generateEmbedding } from '@/lib/embeddings'
import { getAuthedUser, requireProjectOrg, authErrorResponse, AuthSuccess } from '@/lib/auth/apiAuth'

const { createClient } = require('@supabase/supabase-js')

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function retrieveSimilarITPs(
  queryEmbedding: number[],
  orgId: string | null,
  limit = 4
): Promise<string> {
  if (!orgId) return ''
  const supabase = createServiceClient()

  const { data, error } = await supabase.rpc('match_itps', {
    query_embedding: queryEmbedding,
    match_count: limit,
    filter_org_id: orgId,
  })

  if (error || !data?.length) return ''

  const itpIds = data.map((d: { id: string }) => d.id)
  const { data: activities } = await supabase
    .from('itp_activities')
    .select('*')
    .in('itp_id', itpIds)
    .order('sort_order')

  if (!activities?.length) return ''

  const examples = data.map((itp: { id: string; title: string; discipline: string; similarity: number }) => {
    const itpActivities = activities.filter((a: any) => a.itp_id === itp.id)
    const rows = itpActivities.map((a: any) =>
      `  ${a.activity_number} | ${a.section_name} | ${a.description} | ${a.requirements_reference} | ${a.conformance_criteria} | ${a.method} | ${a.frequency} | ${a.hold_witness_type} | ${a.attendance_required?.join(',')} | ${a.records_checklists}`
    ).join('\n')
    return `--- Example ITP: "${itp.title}" (${itp.discipline}, similarity: ${(itp.similarity * 100).toFixed(0)}%) ---\nActNo|Section|Description|Reference|Criteria|Method|Frequency|Type|Attendance|Records\n${rows}`
  }).join('\n\n')

  return examples
}

async function retrieveRelevantChunks(
  queryEmbedding: number[],
  projectId: string | null,
  documentIds: string[] | null,
  limit = 6
): Promise<string> {
  if (!projectId) return ''
  const supabase = createServiceClient()

  const { data, error } = await supabase.rpc('match_document_chunks', {
    query_embedding: queryEmbedding,
    match_count: limit,
    filter_project: projectId,
    filter_document_ids: documentIds && documentIds.length > 0 ? documentIds : null,
  })

  if (error || !data?.length) return ''

  return data.map((chunk: { content: string; metadata: Record<string, string>; similarity: number }) => {
    const source = chunk.metadata?.document_name ?? 'Project document'
    return `[${source}]\n${chunk.content}`
  }).join('\n\n---\n\n')
}

export async function POST(req: NextRequest) {
  const { workDescription, discipline, clientType, additionalContext, projectId, documentIds } = await req.json()

  // Who is actually calling this? Everything below is scoped to THEIR
  // organisation - a client-supplied organisationId is never trusted.
  const auth = await getAuthedUser()
  if (!auth.ok) return authErrorResponse(auth)
  // tsconfig has "strict": false, so TS doesn't narrow `auth` after the
  // guard above - cast explicitly instead of relying on that narrowing.
  const organisationId = (auth as AuthSuccess).organisationId

  // If a projectId was supplied, confirm it actually belongs to this
  // organisation before pulling that project's specifications/drawings into
  // the prompt - otherwise any caller could pull another org's documents in
  // as "project context" just by passing their projectId.
  let safeProjectId: string | null = null
  if (projectId) {
    const projectAuth = await requireProjectOrg(projectId)
    if (!projectAuth.ok) return authErrorResponse(projectAuth)
    safeProjectId = projectId
  }

  const queryText = `${discipline} ${workDescription} ${clientType}`
  const queryEmbedding = await generateEmbedding(queryText)

  const [similarITPs, relevantChunks] = await Promise.all([
    retrieveSimilarITPs(queryEmbedding, organisationId),
    retrieveRelevantChunks(queryEmbedding, safeProjectId, documentIds ?? null),
  ])

  const systemPrompt = `You are a senior NZ construction quality engineer specialising in ITP (Inspection and Test Plan) development. You have deep knowledge of AS/NZS standards, Watercare ESS specifications, Auckland Transport requirements, and NZ construction quality systems.

Your task is to generate ITP activities that match the format and quality of real NZ construction ITPs.

CRITICAL RULES:
- Return ONLY a valid JSON array, no markdown, no explanation
- Use real AS/NZS standard references where applicable (e.g. "AS/NZS 2032:2006 Cl.4.3")
- Activities must follow a logical construction sequence
- Include Preliminaries (docs/drawings), Materials, Installation, Testing, and Post-Construction sections
- If project-specific specifications or drawings are provided below, their requirements are the authoritative contract requirements for THIS job and override general practice or library examples wherever they specifically address something (a stated hold point, test frequency, conformance criteria, standard reference, etc.)

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
- If a project specification explicitly designates something as a Hold Point (or explicitly says it is not), follow the specification over these general rules.

Most real ITPs are NOT dominated by Hold Points - over-using H defeats its purpose and makes the document unusable on site. Do not default to Hold Point out of caution, and do not classify based on how serious the consequence of getting it wrong would be - classify strictly on whether the next step is procedurally blocked without sign-off (subject to the domain rules above). Check before finalising that Hold Points make up only a small minority of the total activities (typically 2-5 per ITP, or more where multiple concrete pours are involved, or where the project specification mandates additional hold points).

RESPONSIBILITY FIELD:
"responsibility" must be EXACTLY one of these generic role categories, not a job title and not a specific company name or abbreviation: Contractor, Subcontractor, Client, Designer, Engineer. Never use job titles like "Site Supervisor", "Construction Manager", "Site Engineer", "Foreman", etc. - those are not valid values for this field. Never invent or guess a specific company name or abbreviation (e.g. do not write a contractor's actual business name) - always use the generic category word, since the person using this tool will vary and can relabel the generic category to their own company name themselves afterward if they want to.`

  const userPrompt = `Generate ITP activities for the following work:

WORK DESCRIPTION: ${workDescription}
DISCIPLINE: ${discipline}
CLIENT: ${clientType}
ADDITIONAL CONTEXT: ${additionalContext ?? 'None'}

${relevantChunks ? `RELEVANT PROJECT SPECIFICATIONS AND DRAWINGS (authoritative contract requirements for THIS job - these TAKE PRECEDENCE over the general library examples below for anything they specifically address):\n${relevantChunks}\n` : ''}
${similarITPs ? `SIMILAR ITPs FROM YOUR LIBRARY (general format/structure/language reference only, from other jobs - do NOT copy their "Type" column values, and defer to the project specifications above wherever they conflict; independently classify each activity's Hold/Witness/Surveillance/Record type using the rules above, since library entries may themselves be imperfectly classified):\n${similarITPs}\n` : ''}

Return a JSON array where each object has EXACTLY these keys:
{
  "section": "1.0 Preliminaries",
  "actNo": "1.1",
  "description": "activity name",
  "responsibility": "Contractor",
  "reference": "AS/NZS 2032:2006 Cl.4.3",
  "conformanceCriteria": "specific measurable criteria",
  "method": "Visual inspection / Test / Review",
  "frequency": "Each joint / Prior to installation / etc",
  "type": "W",
  "attendance": ["Contractor", "Engineer"],
  "records": "Test records / Photos / Checklist"
}

Generate 10-14 activities covering Preliminaries, Materials, Installation, Testing, Post-Construction. Remember: only a small minority (2-5) should be type "H" - the rest should be a realistic mix of "W", "S" and "R" based on what each specific activity actually warrants.`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 4000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    })
  })

  const data = await response.json()
  return NextResponse.json(data)
}
