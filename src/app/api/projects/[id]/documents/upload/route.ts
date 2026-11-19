import { NextRequest, NextResponse } from 'next/server'
import { generateEmbedding } from '@/lib/embeddings'
import { requireProjectOrg, getAuthedUser, authErrorResponse, AuthSuccess } from '@/lib/auth/apiAuth'

export const runtime = 'nodejs'

const { createClient } = require('@supabase/supabase-js')
const pdfParse = require('pdf-parse')

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function chunkText(text: string, size = 1800, overlap = 200): string[] {
  const chunks: string[] = []
  const cleaned = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  let start = 0
  while (start < cleaned.length) {
    let end = start + size
    if (end < cleaned.length) {
      const nl = cleaned.lastIndexOf('\n', end)
      if (nl > start + size / 2) end = nl
    }
    const chunk = cleaned.slice(start, end).trim()
    if (chunk.length > 50) chunks.push(chunk)
    start = end - overlap
  }
  return chunks
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const projectId = params.id

  const auth = await requireProjectOrg(projectId)
  if (!auth.ok) return authErrorResponse(auth)

  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('documents')
    .select('id, name, filename, document_type, page_count, created_at')
    .eq('project_id', projectId)
    .eq('scope', 'project')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ documents: data })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const projectId = params.id

  // Confirm the caller actually belongs to this project's organisation
  // before letting them upload into (and permanently index into the RAG
  // pipeline for) its document library.
  const auth = await requireProjectOrg(projectId)
  if (!auth.ok) return authErrorResponse(auth)
  // tsconfig has "strict": false, so TS doesn't narrow `auth` after the
  // guard above - cast explicitly instead of relying on that narrowing.
  const authed = auth as AuthSuccess

  const supabase = createServiceClient()

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const documentType = (formData.get('documentType') as string) || 'specification'
  const uploadedBy = (formData.get('uploadedBy') as string) || authed.userId

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  if (!file.name.toLowerCase().endsWith('.pdf')) {
    return NextResponse.json({ error: 'Only PDF files are supported right now' }, { status: 400 })
  }

  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  let parsed: { text: string; numpages: number }
  try {
    parsed = await pdfParse(buffer)
  } catch (e) {
    return NextResponse.json({ error: 'Failed to read PDF text' }, { status: 400 })
  }

  if (!parsed.text || parsed.text.trim().length < 50) {
    return NextResponse.json({
      error: 'No extractable text found in this PDF (it may be a scanned image) - text-based specs and drawings with text layers work best',
    }, { status: 400 })
  }

  const storagePath = `projects/${projectId}/${Date.now()}-${file.name}`
  const { error: uploadError } = await supabase.storage.from('documents').upload(storagePath, buffer, {
    contentType: 'application/pdf',
    upsert: true,
  })

  if (uploadError) {
    return NextResponse.json({ error: `Storage upload failed: ${uploadError.message}` }, { status: 500 })
  }

  // organisationId is derived from the authenticated caller, never from the
  // request body, so a document can never be filed under an org the caller
  // doesn't belong to.
  const { data: doc, error: docError } = await supabase
    .from('documents')
    .insert({
      organisation_id: authed.organisationId,
      project_id: projectId,
      name: file.name,
      filename: file.name,
      storage_path: storagePath,
      document_type: documentType,
      scope: 'project',
      parsed_text: parsed.text,
      page_count: parsed.numpages,
      uploaded_by: uploadedBy,
    })
    .select('id')
    .single()

  if (docError || !doc) {
    return NextResponse.json({ error: `Document record failed: ${docError?.message}` }, { status: 500 })
  }

  const chunks = chunkText(parsed.text)

  try {
    for (let i = 0; i < chunks.length; i++) {
      const embedding = await generateEmbedding(chunks[i])
      const { error: chunkError } = await supabase.from('document_chunks').insert({
        document_id: doc.id,
        chunk_index: i,
        content: chunks[i],
        embedding,
        metadata: {
          document_name: file.name,
          document_type: documentType,
        },
      })
      if (chunkError) throw new Error(`Chunk insert failed: ${chunkError.message}`)
    }
  } catch (e: any) {
    // Roll back the partially-indexed document so it never sits around looking
    // "uploaded" while only containing the first few chunks (usually just the
    // table of contents / revision history, since those are always at the start).
    await supabase.from('document_chunks').delete().eq('document_id', doc.id)
    await supabase.from('documents').delete().eq('id', doc.id)
    await supabase.storage.from('documents').remove([storagePath])
    return NextResponse.json({
      error: `Indexing failed partway through (${e?.message ?? 'unknown error'}) - nothing was saved, please try uploading again.`,
    }, { status: 500 })
  }

  return NextResponse.json({ success: true, documentId: doc.id, chunks: chunks.length, pages: parsed.numpages })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const { searchParams } = new URL(req.url)
  const documentId = searchParams.get('documentId')
  if (!documentId) return NextResponse.json({ error: 'documentId required' }, { status: 400 })

  // The project id in the URL isn't trustworthy on its own (nothing stops a
  // caller passing someone else's documentId alongside a project id they do
  // belong to), so confirm via the document's OWN project.
  const auth = await getAuthedUser()
  if (!auth.ok) return authErrorResponse(auth)
  // tsconfig has "strict": false, so TS doesn't narrow `auth` after the
  // guard above - cast explicitly instead of relying on that narrowing.
  const authed = auth as AuthSuccess

  const supabase = createServiceClient()

  const { data: doc } = await supabase.from('documents').select('project_id').eq('id', documentId).single()
  if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

  const { data: project } = await supabase.from('projects').select('organisation_id').eq('id', doc.project_id).single()
  if (!project || project.organisation_id !== authed.organisationId) {
    return NextResponse.json({ error: 'You do not have access to this document.' }, { status: 403 })
  }

  await supabase.from('document_chunks').delete().eq('document_id', documentId)
  await supabase.from('documents').delete().eq('id', documentId)

  return NextResponse.json({ success: true })
}
