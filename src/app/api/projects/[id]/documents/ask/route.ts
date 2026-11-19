import { NextRequest, NextResponse } from 'next/server'
import { generateEmbedding } from '@/lib/embeddings'
import { requireProjectOrg, authErrorResponse } from '@/lib/auth/apiAuth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const { createClient } = require('@supabase/supabase-js')

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const STOPWORDS = new Set([
  'what', 'which', 'should', 'that', 'this', 'have', 'with', 'from', 'does', 'their',
  'there', 'where', 'when', 'about', 'into', 'your', 'would', 'could', 'much', 'many',
  'need', 'needs', 'required', 'require', 'required', 'does', 'they', 'them', 'these',
  'those', 'being', 'been', 'will', 'shall', 'must', 'the', 'and', 'for', 'are', 'can',
]);

function extractKeywords(question: string): string[] {
  const words = question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 4 && !STOPWORDS.has(w))
  return Array.from(new Set(words)).slice(0, 8)
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const projectId = params.id

  // Confirm the signed-in caller's organisation actually owns this project
  // before letting them search its uploaded specs/drawings and spend
  // Anthropic credit answering questions about them.
  const auth = await requireProjectOrg(projectId)
  if (!auth.ok) return authErrorResponse(auth)

  const { question, documentIds } = await req.json()

  if (!question || !question.trim()) {
    return NextResponse.json({ error: 'Please enter a question' }, { status: 400 })
  }

  const supabase = createServiceClient()

  let queryEmbedding: number[]
  try {
    queryEmbedding = await generateEmbedding(question)
  } catch (e: any) {
    return NextResponse.json({ error: `Embedding generation failed: ${e?.message ?? 'unknown error'}` }, { status: 500 })
  }

  const { data: vectorChunks, error: matchError } = await supabase.rpc('match_document_chunks', {
    query_embedding: queryEmbedding,
    match_count: 12,
    filter_scope: 'project',
    filter_project: projectId,
    filter_document_ids: documentIds && documentIds.length > 0 ? documentIds : null,
  })

  if (matchError) {
    return NextResponse.json({ error: `Document search failed: ${matchError.message}` }, { status: 500 })
  }

  const keywords = extractKeywords(question)
  let keywordChunks: any[] = []
  if (keywords.length > 0) {
    const orFilter = keywords.map(k => `content.ilike.%${k}%`).join(',')
    let kwQuery = supabase
      .from('document_chunks')
      .select('id, content, metadata, documents!inner(project_id, scope)')
      .eq('documents.project_id', projectId)
      .eq('documents.scope', 'project')
      .or(orFilter)
      .limit(10)
    if (documentIds && documentIds.length > 0) {
      kwQuery = kwQuery.in('document_id', documentIds)
    }
    const { data: kwData } = await kwQuery
    keywordChunks = kwData ?? []
  }

  const byId = new Map<string, any>()
  for (const c of vectorChunks ?? []) byId.set(c.id, c)
  for (const c of keywordChunks) if (!byId.has(c.id)) byId.set(c.id, c)

  const chunks = Array.from(byId.values())

  if (chunks.length === 0) {
    return NextResponse.json({
      answer: 'No documents have been uploaded for this project yet, so there is nothing to check this against. Upload a spec or drawing first.',
      sources: [],
    })
  }

  const context = chunks
    .map((c: any, i: number) => `[Excerpt ${i + 1} - from "${c.metadata?.document_name ?? 'Unknown document'}"]\n${c.content}`)
    .join('\n\n---\n\n')

  const sourceNames: string[] = Array.from(new Set(chunks.map((c: any) => c.metadata?.document_name).filter(Boolean))) as string[]

  const systemPrompt = `You are answering questions about construction project documents (specifications, drawings, standards) for a project engineer. You are given excerpts retrieved from the uploaded documents below (a mix of semantic search and keyword search results - not every excerpt will be relevant, some may be from unrelated sections like a table of contents). Answer ONLY using what is stated in these excerpts.

RULES:
- If the excerpts contain the answer (a figure, a clause, a requirement), answer directly and say which document it came from.
- Ignore irrelevant excerpts (e.g. table of contents, revision history) rather than commenting on them.
- If the excerpts do not contain enough information to answer precisely (e.g. a quantity that would require reading dimensions off a drawing, or a takeoff calculation not actually stated in the text), say so plainly rather than guessing or estimating. Do not invent numbers.
- If asked to calculate something (e.g. total volume) and the necessary figures ARE stated across the excerpts, you may do the arithmetic and show the calculation.
- Be concise and direct - this is being used on site, not for a report.`

  const userPrompt = `DOCUMENT EXCERPTS:\n\n${context}\n\nQUESTION: ${question}`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 1200,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  })

  const data = await response.json()
  const answer = data.content?.[0]?.text ?? 'No answer returned - check the Anthropic API key has credits.'

  return NextResponse.json({ answer, sources: sourceNames })
}
