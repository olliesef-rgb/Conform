#!/usr/bin/env ts-node
/**
 * BATCH ITP PROCESSOR
 * ───────────────────
 * Run this once to process your 343 PDFs into the vector database.
 *
 * Usage:
 *   ITP_FOLDER=/path/to/your/itps npx ts-node scripts/processITPs.ts
 *
 * What it does:
 *   1. Reads all PDFs from ITP_FOLDER
 *   2. Extracts text from each PDF
 *   3. Auto-tags discipline, client, ITP number
 *   4. Generates embeddings for similarity search
 *   5. Uploads to Supabase (documents + document_chunks + itps tables)
 *   6. Skips already-processed files (safe to re-run)
 *
 * Prerequisites:
 *   - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VOYAGE_API_KEY in .env.local
 *   - npm install (for pdf-parse, @supabase/supabase-js)
 */

import fs from 'fs'
import path from 'path'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

// Inline the deps to avoid circular imports in scripts context
const { createClient } = require('@supabase/supabase-js')
const pdfParse = require('pdf-parse')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const ITP_FOLDER = process.env.ITP_FOLDER ?? './data/itps'
const ORG_ID = process.env.ORG_ID ?? '' // Your organisation UUID from Supabase
const BATCH_SIZE = 5 // Process 5 ITPs at a time to avoid rate limits

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function extractMetadata(text: string, filename: string) {
  const itpNumber =
    text.match(/ITP\s*No[:.#]?\s*([\w-]+)/i)?.[1] ??
    path.basename(filename, '.pdf')

  const title =
    text.match(/JOB\/ITP\s+TITLE[:\s]+([^\n]+)/i)?.[1]?.trim() ??
    text.match(/INSPECTION AND TEST PLAN FOR[:\s]+([^\n]+)/i)?.[1]?.trim() ??
    itpNumber

  const client = text.match(/CLIENT[:\s]+([^\n]+)/i)?.[1]?.trim() ?? null
  const workDesc = text.match(/WORK\s+DESCRIPTION[:\s]+([^\n]+)/i)?.[1]?.trim() ?? null
  const engineer = text.match(/ENGINEER[S]?\s*['S]*\s*NAME[:\s]+([^\n]+)/i)?.[1]?.trim() ?? null

  let discipline = 'civil'
  const lower = text.toLowerCase()
  if (lower.includes('pipeline') || lower.includes('pipe')) discipline = 'pipeline'
  else if (lower.includes('mechanical') || lower.includes('hvac') || lower.includes('damper')) discipline = 'mechanical'
  else if (lower.includes('electrical') || lower.includes('cabling')) discipline = 'electrical'
  else if (lower.includes('steel') || lower.includes('structural')) discipline = 'structural'
  else if (lower.includes('concrete') || lower.includes('formwork')) discipline = 'structural'
  else if (lower.includes('geotech') || lower.includes('soil')) discipline = 'geotechnical'

  let clientType = 'other'
  if (lower.includes('watercare')) clientType = 'watercare'
  else if (lower.includes('auckland transport') || lower.includes(' at ')) clientType = 'auckland_transport'
  else if (lower.includes('auckland council')) clientType = 'auckland_council'
  else if (lower.includes('nzta')) clientType = 'nzta'

  return { itpNumber, title, client, workDesc, engineer, discipline, clientType }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function processITP(filePath: string, index: number, total: number) {
  const filename = path.basename(filePath)
  console.log(`[${index + 1}/${total}] Processing: ${filename}`)

  // Check if already processed
  const { data: existing } = await supabase
    .from('documents')
    .select('id')
    .eq('filename', filename)
    .eq('scope', 'global')
    .single()

  if (existing) {
    console.log(`  ↳ Already processed, skipping`)
    return
  }

  // Parse PDF
  const buffer = fs.readFileSync(filePath)
  let parsed: { text: string; numpages: number }
  try {
    parsed = await pdfParse(buffer)
  } catch (e) {
    console.error(`  ✗ PDF parse failed: ${e}`)
    return
  }

  const meta = extractMetadata(parsed.text, filename)
  console.log(`  ↳ ITP: ${meta.itpNumber} | ${meta.discipline} | ${meta.clientType}`)

  // Upload document record
  const storagePath = `itps/${filename}`
  await supabase.storage.from('documents').upload(storagePath, buffer, {
    contentType: 'application/pdf',
    upsert: true,
  })

  const { data: doc, error: docError } = await supabase
    .from('documents')
    .insert({
      organisation_id: ORG_ID || null,
      name: meta.itpNumber ?? filename,
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

  // Chunk and embed the text
  const chunks = chunkText(parsed.text)
  console.log(`  ↳ ${chunks.length} chunks to embed`)

  for (let i = 0; i < chunks.length; i++) {
    const embedding = await generateEmbedding(chunks[i])
    await supabase.from('document_chunks').insert({
      document_id: doc.id,
      chunk_index: i,
      content: chunks[i],
      embedding,
      metadata: {
        document_name: meta.itpNumber ?? filename,
        discipline: meta.discipline,
        client_type: meta.clientType,
        page: 'unknown',
      },
    })
    // Small delay to avoid rate limits
    await new Promise(r => setTimeout(r, 100))
  }

  // Create an ITP record with embedding (for similarity search)
  const itpSummary = [
    meta.title,
    meta.workDesc,
    meta.discipline,
    meta.clientType,
    parsed.text.slice(0, 2000),
  ].filter(Boolean).join(' ')

  const itpEmbedding = await generateEmbedding(itpSummary)

  await supabase.from('itps').insert({
    organisation_id: ORG_ID || null,
    project_id: null,  // library ITPs aren't tied to a project
    itp_number: meta.itpNumber ?? filename,
    title: meta.title ?? meta.itpNumber ?? filename,
    work_description: meta.workDesc ?? '',
    discipline: meta.discipline,
    client: meta.client ?? '',
    client_type: meta.clientType,
    engineer_name: meta.engineer ?? '',
    status: 'issued_for_construction',
    revision: '1.0',
    source_document_ids: [doc.id],
    embedding: itpEmbedding,
  })

  console.log(`  ✓ Done`)
}

async function main() {
  if (!fs.existsSync(ITP_FOLDER)) {
    console.error(`ITP folder not found: ${ITP_FOLDER}`)
    console.error('Set ITP_FOLDER env var to your ITPs directory')
    process.exit(1)
  }

  const files = fs.readdirSync(ITP_FOLDER)
    .filter(f => f.toLowerCase().endsWith('.pdf'))
    .map(f => path.join(ITP_FOLDER, f))

  console.log(`Found ${files.length} PDF files in ${ITP_FOLDER}`)
  console.log('Starting batch processing...\n')

  let success = 0
  let failed = 0

  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE)
    await Promise.allSettled(
      batch.map((f, j) =>
        processITP(f, i + j, files.length)
          .then(() => success++)
          .catch(e => { console.error(`Failed: ${f}`, e); failed++ })
      )
    )
    // Pause between batches
    if (i + BATCH_SIZE < files.length) {
      console.log(`\nBatch complete. Pausing 2s...\n`)
      await new Promise(r => setTimeout(r, 2000))
    }
  }

  console.log(`\n✓ Complete: ${success} processed, ${failed} failed`)
}

main().catch(console.error)
