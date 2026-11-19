import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle } from 'docx'
import { requireRecordProjectAccess, authErrorResponse } from '@/lib/auth/apiAuth'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const TEAL = '1F7A8C'
const BORDER_COL = 'CCCCCC'
const MID_GREY = 'F2F2F2'

function labelCell(text: string) {
  return new TableCell({
    width: { size: 2500, type: WidthType.DXA },
    shading: { fill: MID_GREY },
    borders: { top: { style: BorderStyle.SINGLE, size: 1, color: BORDER_COL }, bottom: { style: BorderStyle.SINGLE, size: 1, color: BORDER_COL }, left: { style: BorderStyle.SINGLE, size: 1, color: BORDER_COL }, right: { style: BorderStyle.SINGLE, size: 1, color: BORDER_COL } },
    margins: { top: 80, bottom: 80, left: 100, right: 100 },
    children: [new Paragraph({ children: [new TextRun({ text, bold: true, size: 18, font: 'Arial' })] })],
  })
}

function valueCell(text: string) {
  return new TableCell({
    width: { size: 7000, type: WidthType.DXA },
    borders: { top: { style: BorderStyle.SINGLE, size: 1, color: BORDER_COL }, bottom: { style: BorderStyle.SINGLE, size: 1, color: BORDER_COL }, left: { style: BorderStyle.SINGLE, size: 1, color: BORDER_COL }, right: { style: BorderStyle.SINGLE, size: 1, color: BORDER_COL } },
    margins: { top: 80, bottom: 80, left: 100, right: 100 },
    children: [new Paragraph({ children: [new TextRun({ text: text || '-', size: 18, font: 'Arial' })] })],
  })
}

function sectionHeading(text: string) {
  return new Paragraph({
    spacing: { before: 240, after: 100 },
    children: [new TextRun({ text, bold: true, size: 22, color: TEAL, font: 'Arial' })],
  })
}

function bodyText(text: string) {
  return new Paragraph({
    spacing: { after: 120 },
    children: [new TextRun({ text: text || '-', size: 18, font: 'Arial' })],
  })
}

export async function GET(req: NextRequest, { params }: { params: { observationId: string } }) {
  const auth = await requireRecordProjectAccess('safety_observations', 'id', params.observationId)
  if (!auth.ok) return authErrorResponse(auth)

  const { data: observation, error } = await supabase.from('safety_observations').select('*').eq('id', params.observationId).single()
  if (error || !observation) {
    console.error('OBSERVATION EXPORT ERROR:', error)
    return NextResponse.json({ error: 'Observation not found', details: error?.message }, { status: 404 })
  }

  const { data: evidence } = await supabase.from('safety_observation_evidence').select('file_name').eq('observation_id', params.observationId)

  let swmsLabel = '-'
  let revisionLabel = '-'
  if (observation.swms_id) {
    const { data: s } = await supabase.from('swms').select('swms_number, title').eq('id', observation.swms_id).single()
    if (s) swmsLabel = `${s.swms_number} - ${s.title}`
  }
  if (observation.closing_swms_revision_id) {
    const { data: r } = await supabase.from('swms_revisions').select('revision, reason').eq('id', observation.closing_swms_revision_id).single()
    if (r) revisionLabel = `Rev ${r.revision} - ${r.reason}`
  }

  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        new Paragraph({
          children: [new TextRun({ text: `${observation.observation_number} - ${observation.category}`, bold: true, size: 32, color: TEAL, font: 'Arial' })],
        }),
        new Paragraph({
          spacing: { after: 200 },
          children: [new TextRun({ text: observation.location || '', size: 20, font: 'Arial' })],
        }),

        new Table({
          width: { size: 9500, type: WidthType.DXA },
          rows: [
            new TableRow({ children: [labelCell('Status'), valueCell(observation.status === 'open' ? 'Open' : 'Closed')] }),
            new TableRow({ children: [labelCell('Raised By'), valueCell(observation.raised_by_email || '-')] }),
            new TableRow({ children: [labelCell('Raised At'), valueCell(new Date(observation.raised_at).toLocaleString('en-NZ'))] }),
            new TableRow({ children: [labelCell('Linked SWMS'), valueCell(swmsLabel)] }),
            new TableRow({ children: [labelCell('Resolved Via'), valueCell(revisionLabel)] }),
            new TableRow({ children: [labelCell('Closed At'), valueCell(observation.closed_at ? new Date(observation.closed_at).toLocaleString('en-NZ') : '-')] }),
          ],
        }),

        sectionHeading('Description'),
        bodyText(observation.description),

        sectionHeading('Close-Out Notes'),
        bodyText(observation.closeout_notes),

        sectionHeading('Attached Photos'),
        ...((evidence && evidence.length > 0)
          ? evidence.map((e: any) => new Paragraph({ children: [new TextRun({ text: `- ${e.file_name}`, size: 18, font: 'Arial' })] }))
          : [bodyText('None')]),
      ],
    }],
  })

  const buffer = await Packer.toBuffer(doc)

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${observation.observation_number}.docx"`,
    },
  })
}
