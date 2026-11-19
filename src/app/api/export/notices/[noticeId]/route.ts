import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle, HeadingLevel } from 'docx'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const TEAL = '1F7A8C'
const BORDER_COL = 'CCCCCC'
const MID_GREY = 'F2F2F2'
const WHITE = 'FFFFFF'

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

function costCell(text: string, opts: { width: number; bold?: boolean; shade?: string }) {
  return new TableCell({
    width: { size: opts.width, type: WidthType.DXA },
    shading: opts.shade ? { fill: opts.shade } : undefined,
    borders: { top: { style: BorderStyle.SINGLE, size: 1, color: BORDER_COL }, bottom: { style: BorderStyle.SINGLE, size: 1, color: BORDER_COL }, left: { style: BorderStyle.SINGLE, size: 1, color: BORDER_COL }, right: { style: BorderStyle.SINGLE, size: 1, color: BORDER_COL } },
    margins: { top: 80, bottom: 80, left: 100, right: 100 },
    children: [new Paragraph({ children: [new TextRun({ text, bold: !!opts.bold, size: 18, font: 'Arial' })] })],
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

export async function GET(req: NextRequest, { params }: { params: { noticeId: string } }) {
  const { data: notice, error } = await supabase.from('notices').select('*').eq('id', params.noticeId).single()
  if (error || !notice) return NextResponse.json({ error: 'Notice not found' }, { status: 404 })

  const { data: evidence } = await supabase.from('notice_evidence').select('file_name').eq('notice_id', params.noticeId)

  const [{ data: linkedLabour }, { data: linkedPlant }, { data: linkedMaterials }] = await Promise.all([
    supabase.from('daily_labour').select('person_name, company, hours, rate').eq('notice_id', params.noticeId),
    supabase.from('daily_plant').select('description, company, hours, rate').eq('notice_id', params.noticeId),
    supabase.from('daily_materials').select('material_name, unit, quantity, rate').eq('notice_id', params.noticeId),
  ])
  const costRows: { label: string; qty: string; rate: string; cost: number }[] = []
  ;(linkedLabour ?? []).forEach((r: any) => {
    const cost = (r.hours ?? 0) * (r.rate ?? 0)
    costRows.push({ label: `Labour - ${r.person_name}${r.company ? ` (${r.company})` : ''}`, qty: `${r.hours ?? 0} hr`, rate: `$${(r.rate ?? 0).toFixed(2)}/hr`, cost })
  })
  ;(linkedPlant ?? []).forEach((r: any) => {
    const cost = (r.hours ?? 0) * (r.rate ?? 0)
    costRows.push({ label: `Plant - ${r.description}${r.company ? ` (${r.company})` : ''}`, qty: `${r.hours ?? 0} hr`, rate: `$${(r.rate ?? 0).toFixed(2)}/hr`, cost })
  })
  ;(linkedMaterials ?? []).forEach((r: any) => {
    const cost = (r.quantity ?? 0) * (r.rate ?? 0)
    costRows.push({ label: `Materials - ${r.material_name}`, qty: `${r.quantity ?? 0} ${r.unit ?? ''}`.trim(), rate: `$${(r.rate ?? 0).toFixed(2)}`, cost })
  })
  const costsTotal = costRows.reduce((s, r) => s + r.cost, 0)
  const costsSection = notice.type === 'CE' ? [
    sectionHeading('Linked Costs'),
    ...(costRows.length > 0 ? [
      new Table({
        width: { size: 9500, type: WidthType.DXA },
        rows: [
          new TableRow({ children: [costCell('Item', { width: 5000, bold: true, shade: MID_GREY }), costCell('Qty', { width: 1800, bold: true, shade: MID_GREY }), costCell('Rate', { width: 1500, bold: true, shade: MID_GREY }), costCell('Cost', { width: 1200, bold: true, shade: MID_GREY })] }),
          ...costRows.map(r => new TableRow({ children: [costCell(r.label, { width: 5000 }), costCell(r.qty, { width: 1800 }), costCell(r.rate, { width: 1500 }), costCell(`$${r.cost.toFixed(2)}`, { width: 1200 })] })),
          new TableRow({ children: [costCell('Total', { width: 5000, bold: true }), costCell('', { width: 1800 }), costCell('', { width: 1500 }), costCell(`$${costsTotal.toFixed(2)}`, { width: 1200, bold: true })] }),
        ],
      }),
    ] : [bodyText('No labour, plant or materials tagged to this variation yet.')]),
  ] : []

  const STATUS_LABELS: Record<string, string> = { open: 'Open', pending_response: 'Pending Response', closed: 'Closed' }

  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        new Paragraph({
          children: [new TextRun({ text: `${notice.type} - ${notice.notice_number}`, bold: true, size: 32, color: TEAL, font: 'Arial' })],
        }),
        new Paragraph({
          spacing: { after: 200 },
          children: [new TextRun({ text: notice.title || '', bold: true, size: 24, font: 'Arial' })],
        }),

        new Table({
          width: { size: 9500, type: WidthType.DXA },
          rows: [
            new TableRow({ children: [labelCell('Status'), valueCell(STATUS_LABELS[notice.status] ?? notice.status)] }),
            new TableRow({ children: [labelCell('Raised By'), valueCell(notice.raised_by_email || '-')] }),
            new TableRow({ children: [labelCell('Raised At'), valueCell(new Date(notice.raised_at).toLocaleString('en-NZ'))] }),
            new TableRow({ children: [labelCell('Responded By'), valueCell(notice.responded_by_name || '-')] }),
            new TableRow({ children: [labelCell('Closed At'), valueCell(notice.closed_at ? new Date(notice.closed_at).toLocaleString('en-NZ') : '-')] }),
          ],
        }),

        sectionHeading('Description'),
        bodyText(notice.description),

        sectionHeading('Response'),
        bodyText(notice.response),

        sectionHeading('Close-Out Notes'),
        bodyText(notice.closeout_notes),

        ...costsSection,

        sectionHeading('Attached Files'),
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
      'Content-Disposition': `attachment; filename="${notice.notice_number}.docx"`,
    },
  })
}
