#!/usr/bin/env ts-node
/**
 * BATCH SWMS PROCESSOR
 * ────────────────────
 * Run this once to process your 489 SWMS PDFs into the vector database.
 *
 * Usage:
 *   SWMS_FOLDER=/path/to/your/swms npx ts-node scripts/processSWMS.ts
 *
 * See processITPs.ts for full documentation — same pattern.
 */

import fs from 'fs'
import path from 'path'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const { createClient } = require('@supabase/supabase-js')
const pdfParse = require('pdf-parse')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const SWMS_FOLDER = process.env.SWMS_FOLDER ?? './data/swms'
const ORG_ID = process.env.ORG_ID ?? ''
const BATCH_SIZE = 5

async function generateEmbedding(text: string): Promise<number[]> {
  const res = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: 'voyage-large-2', input: text.slice(0, 8000) }),
  })
  const data = await res.json()
  return data.data[0].embedding
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

function extractSWMSMetadata(text: string, filename: string) {
  const swmsNumber =
    text.match(/SWMS\s*No[:.#]?\s*([\w-]+)/i)?.[1] ??
    path.basename(filename, '.pdf')

  const title =
    text.match(/SAFE\s+WORK\s+METHOD\s+STATEMENT\s+FOR[:\s]+([^\n]+)/i)?.[1]?.trim() ??
    text.match(/WORK\s+DESCRIPTION[:\s]+([^\n]+)/i)?.[1]?.trim() ??
    swmsNumber

  const workDesc = text.match(/WORK\s+DESCRIPTION[:\s]+([^\n]+)/i)?.[1]?.trim() ?? null
  const supervisor = text.match(/SITE\s+SUPERVISOR[:\s]+([^\n]+)/i)?.[1]?.trim() ?? null
  const client = text.match(/CLIENT[:\s]+([^\n]+)/i)?.[1]?.trim() ?? null

  let discipline = 'civil'
  const lower = text.toLowerCase()
  if (lower.includes('excavat') || lower.includes('trench')) discipline = 'civil'
  else if (lower.includes('confined space') || lower.includes('manhole')) discipline = 'civil'
  else if (lower.includes('electrical') || lower.includes('loto')) discipline = 'electrical'
  else if (lower.includes('welding') || lower.includes('hot work')) discipline = 'mechanical'
  else if (lower.includes('pipeline') || lower.includes('pressure')) discipline = 'pipeline'
  else if (lower.includes('concrete') || lower.includes('formwork')) discipline = 'structural'
  else if (lower.includes('height') || lower.includes('scaffold')) discipline = 'structural'
  else if (lower.includes('crane') || lower.includes('lifting')) discipline = 'mechanical'

  let clientType = 'other'
  if (lower.includes('watercare')) clientType = 'watercare'
  else if (lower.includes('auckland transport')) clientType = 'auckland_transport'
  else if (lower.includes('auckland council')) clientType = 'auckland_council'
  else if (lower.includes('nzta')) clientType = 'nzta'

  return { swmsNumber, title, workDesc, supervisor, client, discipline, clientType }
}

async function processSWMS(filePath: string, index: number, total: number) {
  const filename = path.basename(filePath)
  console.log(`[${index + 1}/${total}] Processing: ${filename}`)

  // Skip if already processed
  const { data: existing } = await supabase
    .from('documents')
    .select('id')
    .eq('filename', filename)
    .single()

  if (existing) {
    console.log(`  ↳ Already processed, skipping`)
    return
  }

  const buffer = fs.readFileSync(filePath)
  let parsed: { text: string; numpages: number }
  try {
    parsed = await pdfParse(buffer)
  } catch (e) {
    console.error(`  ✗ PDF parse failed: ${e}`)
    return
  }

  const meta = extractSWMSMetadata(parsed.text, filename)
  console.log(`  ↳ SWMS: ${meta.swmsNumber} | ${meta.discipline} | ${meta.clientType}`)

  // Upload to storage
  const storagePath = `swms/${filename}`
  await supabase.storage.from('documents').upload(storagePath, buffer, {
    contentType: 'application/pdf',
    upsert: true,
  })

  // Insert document record
  const { data: doc, error: docError } = await supabase
    .from('documents')
    .insert({
      organisation_id: ORG_ID || null,
      name: meta.swmsNumber ?? filename,
      filename,
      storage_path: storagePath,
      document_type: 'specification',
      scope: 'global',
      client_type: meta.clientType,
      parsed_text: parsed.text,
      page_count: parsed.numpages,
    })
    .select('id')
    .single()

  if (docError || !doc) {
    console.error(`  ✗ Document insert failed: ${docError?.message}`)
    return
  }

  // Chunk and embed
  const chunks = chunkText(parsed.text)
  for (let i = 0; i < chunks.length; i++) {
    const embedding = await generateEmbedding(chunks[i])
    await supabase.from('document_chunks').insert({
      document_id: doc.id,
      chunk_index: i,
      content: chunks[i],
      embedding,
      metadata: {
        document_name: meta.swmsNumber ?? filename,
        document_kind: 'swms',
        discipline: meta.discipline,
        client_type: meta.clientType,
      },
    })
    await new Promise(r => setTimeout(r, 100))
  }

  // Create SWMS record with embedding
  const swmsSummary = [meta.title, meta.workDesc, meta.discipline, meta.clientType, parsed.text.slice(0, 2000)]
    .filter(Boolean).join(' ')

  const swmsEmbedding = await generateEmbedding(swmsSummary)

  await supabase.from('swms').insert({
    organisation_id: ORG_ID || null,
    project_id: null,
    swms_number: meta.swmsNumber ?? filename,
    title: meta.title ?? meta.swmsNumber ?? filename,
    work_description: meta.workDesc ?? '',
    discipline: meta.discipline,
    client: meta.client ?? '',
    site_supervisor: meta.supervisor ?? '',
    status: 'approved',
    revision: '1.0',
    source_document_ids: [doc.id],
    embedding: swmsEmbedding,
  })

  console.log(`  ✓ Done`)
}

async function main() {
  if (!fs.existsSync(SWMS_FOLDER)) {
    console.error(`SWMS folder not found: ${SWMS_FOLDER}`)
    console.error('Set SWMS_FOLDER env var to your SWMS directory')
    process.exit(1)
  }

  const files = fs.readdirSync(SWMS_FOLDER)
    .filter(f => f.toLowerCase().endsWith('.pdf'))
    .map(f => path.join(SWMS_FOLDER, f))

  console.log(`Found ${files.length} PDF files in ${SWMS_FOLDER}`)

  let success = 0, failed = 0

  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE)
    await Promise.allSettled(
      batch.map((f, j) =>
        processSWMS(f, i + j, files.length)
          .then(() => success++)
          .catch(e => { console.error(`Failed: ${f}`, e); failed++ })
      )
    )
    if (i + BATCH_SIZE < files.length) {
      await new Promise(r => setTimeout(r, 2000))
    }
  }

  console.log(`\n✓ Complete: ${success} processed, ${failed} failed`)
}

main().catch(console.error)
