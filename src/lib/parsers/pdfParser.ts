import fs from 'fs'
import path from 'path'
import pdfParse from 'pdf-parse'

export interface ParsedDocument {
  text: string
  pageCount: number
  filename: string
}

// Chunk text into ~500 token pieces with overlap for RAG
export function chunkText(
  text: string,
  chunkSize: number = 1800,   // ~450 tokens at 4 chars/token
  overlap: number = 200
): string[] {
  const chunks: string[] = []
  let start = 0

  // Clean up whitespace
  const cleaned = text
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim()

  while (start < cleaned.length) {
    let end = start + chunkSize

    // Try to break at a sentence boundary
    if (end < cleaned.length) {
      const sentenceEnd = cleaned.lastIndexOf('\n', end)
      if (sentenceEnd > start + chunkSize / 2) {
        end = sentenceEnd
      }
    }

    const chunk = cleaned.slice(start, end).trim()
    if (chunk.length > 50) {  // skip tiny chunks
      chunks.push(chunk)
    }

    start = end - overlap
  }

  return chunks
}

export async function parsePDF(filePath: string): Promise<ParsedDocument> {
  const buffer = fs.readFileSync(filePath)
  const data = await pdfParse(buffer)

  return {
    text: data.text,
    pageCount: data.numpages,
    filename: path.basename(filePath),
  }
}

export async function parsePDFBuffer(
  buffer: Buffer,
  filename: string
): Promise<ParsedDocument> {
  const data = await pdfParse(buffer)
  return {
    text: data.text,
    pageCount: data.numpages,
    filename,
  }
}

// Extract ITP-specific metadata from parsed text
// Helps auto-tag bulk-uploaded ITPs without manual input
export function extractITPMetadata(text: string): {
  itpNumber: string | null
  discipline: string | null
  client: string | null
  workDescription: string | null
} {
  const itpNumber = text.match(/ITP\s*No[:.#]?\s*([\w-]+)/i)?.[1] ?? null
  const workDesc = text.match(/WORK\s+DESCRIPTION[:\s]+([^\n]+)/i)?.[1]?.trim() ?? null
  const client = text.match(/CLIENT[:\s]+([^\n]+)/i)?.[1]?.trim() ?? null

  // Guess discipline from keywords
  let discipline: string | null = null
  const lower = text.toLowerCase()
  if (lower.includes('pipeline') || lower.includes('pipe')) discipline = 'pipeline'
  else if (lower.includes('structural') || lower.includes('steel')) discipline = 'structural'
  else if (lower.includes('electrical') || lower.includes('cabling')) discipline = 'electrical'
  else if (lower.includes('mechanical') || lower.includes('hvac') || lower.includes('damper')) discipline = 'mechanical'
  else if (lower.includes('civil') || lower.includes('earthwork') || lower.includes('excavat')) discipline = 'civil'
  else if (lower.includes('concrete') || lower.includes('reinforce')) discipline = 'structural'
  else if (lower.includes('geotech') || lower.includes('soil')) discipline = 'geotechnical'

  return { itpNumber, discipline, client, workDescription: workDesc }
}

// Extract SWMS-specific metadata
export function extractSWMSMetadata(text: string): {
  swmsNumber: string | null
  discipline: string | null
  workDescription: string | null
  siteSupervisor: string | null
} {
  const swmsNumber = text.match(/SWMS\s*No[:.#]?\s*([\w-]+)/i)?.[1] ?? null
  const workDesc = text.match(/WORK\s+DESCRIPTION[:\s]+([^\n]+)/i)?.[1]?.trim() ?? null
  const supervisor = text.match(/SITE\s+SUPERVISOR[:\s]+([^\n]+)/i)?.[1]?.trim() ?? null

  let discipline: string | null = null
  const lower = text.toLowerCase()
  if (lower.includes('excavat') || lower.includes('trenching')) discipline = 'civil'
  else if (lower.includes('height') || lower.includes('scaffold') || lower.includes('roof')) discipline = 'structural'
  else if (lower.includes('electrical') || lower.includes('loto') || lower.includes('lockout')) discipline = 'electrical'
  else if (lower.includes('confined space') || lower.includes('manhole')) discipline = 'civil'
  else if (lower.includes('welding') || lower.includes('hot work')) discipline = 'mechanical'
  else if (lower.includes('pipeline') || lower.includes('pressure test')) discipline = 'pipeline'
  else if (lower.includes('concrete') || lower.includes('formwork')) discipline = 'structural'

  return { swmsNumber, discipline, workDescription: workDesc, siteSupervisor: supervisor }
}
