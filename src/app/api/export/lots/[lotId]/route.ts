import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, BorderStyle, ImageRun, PageBreak,
} from 'docx'
import { requireRecordProjectAccess, authErrorResponse } from '@/lib/auth/apiAuth'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const TEAL = '1F7A8C'
const BORDER_COL = 'CCCCCC'
const MID_GREY = 'F2F2F2'

const IMG_EXT: Record<string, 'jpg' | 'png' | 'gif' | 'bmp'> = {
  jpg: 'jpg', jpeg: 'jpg', png: 'png', gif: 'gif', bmp: 'bmp',
}

async function fetchImageRun(fileUrl: string, fileName: string) {
  const ext = (fileName.split('.').pop() || '').toLowerCase()
  const type = IMG_EXT[ext]
  if (!type) return null
  try {
    const res = await fetch(fileUrl)
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    return new ImageRun({
      data: buf,
      type,
      transformation: { width: 220, height: 165 },
    } as any)
  } catch {
    return null
  }
}

function h1(text: string) {
  return new Paragraph({
    spacing: { before: 100, after: 160 },
    children: [new TextRun({ text, bold: true, size: 30, color: TEAL, font: 'Arial' })],
  })
}

function h2(text: string) {
  return new Paragraph({
    spacing: { before: 280, after: 120 },
    children: [new TextRun({ text, bold: true, size: 24, color: TEAL, font: 'Arial' })],
  })
}

function h3(text: string) {
  return new Paragraph({
    spacing: { before: 160, after: 80 },
    children: [new TextRun({ text, bold: true, size: 20, font: 'Arial' })],
  })
}

function bodyText(text: string, opts: { bold?: boolean; color?: string } = {}) {
  return new Paragraph({
    spacing: { after: 100 },
    children: [new TextRun({ text: text || '-', size: 18, font: 'Arial', bold: !!opts.bold, color: opts.color })],
  })
}

function labelCell(text: string, width = 2500) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: { fill: MID_GREY },
    borders: { top: { style: BorderStyle.SINGLE, size: 1, color: BORDER_COL }, bottom: { style: BorderStyle.SINGLE, size: 1, color: BORDER_COL }, left: { style: BorderStyle.SINGLE, size: 1, color: BORDER_COL }, right: { style: BorderStyle.SINGLE, size: 1, color: BORDER_COL } },
    margins: { top: 60, bottom: 60, left: 90, right: 90 },
    children: [new Paragraph({ children: [new TextRun({ text, bold: true, size: 16, font: 'Arial' })] })],
  })
}

function valueCell(text: string, width = 7000) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders: { top: { style: BorderStyle.SINGLE, size: 1, color: BORDER_COL }, bottom: { style: BorderStyle.SINGLE, size: 1, color: BORDER_COL }, left: { style: BorderStyle.SINGLE, size: 1, color: BORDER_COL }, right: { style: BorderStyle.SINGLE, size: 1, color: BORDER_COL } },
    margins: { top: 60, bottom: 60, left: 90, right: 90 },
    children: [new Paragraph({ children: [new TextRun({ text: text || '-', size: 16, font: 'Arial' })] })],
  })
}

function signatureBlock(role: string) {
  return new Table({
    width: { size: 9500, type: WidthType.DXA },
    borders: {
      top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 9500, type: WidthType.DXA },
            margins: { top: 200, bottom: 200, left: 0, right: 0 },
            children: [
              new Paragraph({ children: [new TextRun({ text: role, bold: true, size: 18, font: 'Arial' })] }),
              new Paragraph({ spacing: { before: 400 }, children: [new TextRun({ text: 'Name: _______________________________', size: 18, font: 'Arial' })] }),
              new Paragraph({ spacing: { before: 300 }, children: [new TextRun({ text: 'Signature: __________________________', size: 18, font: 'Arial' })] }),
              new Paragraph({ spacing: { before: 300 }, children: [new TextRun({ text: 'Date: _______________________________', size: 18, font: 'Arial' })] }),
            ],
          }),
        ],
      }),
    ],
  })
}

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: { lotId: string } }) {
  const auth = await requireRecordProjectAccess('lots', 'id', params.lotId)
  if (!auth.ok) return authErrorResponse(auth)

  const { data: lot, error: lotErr } = await supabase.from('lots').select('*').eq('id', params.lotId).single()
  if (lotErr || !lot) {
    console.error('LOT EXPORT ERROR:', lotErr)
    return NextResponse.json({ error: 'Lot not found', details: lotErr?.message }, { status: 404 })
  }

  const { data: project } = await supabase.from('projects').select('id, name').eq('id', lot.project_id).single()

  const lotLabel = lot.lot_number || lot.name || lot.id

  // ITPs for this lot
  const { data: itps } = await supabase.from('itps').select('*').eq('lot_id', params.lotId)

  const itpBlocks: (Paragraph | Table)[] = []

  for (const itp of itps ?? []) {
    const { data: activities } = await supabase
      .from('itp_activities')
      .select('*')
      .eq('itp_id', itp.id)
      .order('sort_order', { ascending: true })

    const { data: checklist } = await supabase
      .from('itp_qa_checklist')
      .select('*')
      .eq('itp_id', itp.id)
      .order('item_number', { ascending: true })

    const actIds = (activities ?? []).map((a: any) => a.id)
    let evidence: any[] = []
    if (actIds.length > 0) {
      const { data: evData } = await supabase.from('itp_activity_evidence').select('*').in('itp_activity_id', actIds)
      evidence = evData ?? []
    }
    const evidenceByActivity: Record<string, any[]> = {}
    evidence.forEach((e: any) => {
      if (!evidenceByActivity[e.itp_activity_id]) evidenceByActivity[e.itp_activity_id] = []
      evidenceByActivity[e.itp_activity_id].push(e)
    })

    const total = (activities ?? []).length
    const done = (activities ?? []).filter((a: any) => a.is_complete).length

    itpBlocks.push(h2(`${itp.itp_number}${itp.title ? ' - ' + itp.title : ''}`))
    itpBlocks.push(bodyText(`Revision ${itp.revision} - Status: ${itp.status} - ${done} of ${total} activities signed off`))

    for (const a of activities ?? []) {
      itpBlocks.push(new Table({
        width: { size: 9500, type: WidthType.DXA },
        rows: [
          new TableRow({ children: [labelCell('No.', 800), valueCell(a.activity_number, 2000), labelCell('Done', 800), valueCell(a.is_complete ? 'Yes' : 'No', 1900)] }),
          new TableRow({ children: [labelCell('Activity', 800), valueCell(a.description, 6600, )] }),
          new TableRow({ children: [labelCell('Responsibility', 800), valueCell(a.responsibility, 2900), labelCell('H/W', 800), valueCell(a.hold_witness_type || '-', 1900)] }),
        ],
      }))

      const actEvidence = evidenceByActivity[a.id] ?? []
      if (actEvidence.length > 0) {
        for (const ev of actEvidence) {
          const img = await fetchImageRun(ev.file_url, ev.file_name)
          if (img) {
            itpBlocks.push(new Paragraph({ children: [img], spacing: { before: 60, after: 20 } }))
            itpBlocks.push(bodyText(ev.file_name, { color: '888888' }))
          } else {
            itpBlocks.push(bodyText(`Attached: ${ev.file_name}`, { color: '888888' }))
          }
        }
      } else {
        itpBlocks.push(bodyText('No evidence attached to this activity.', { color: 'AAAAAA' }))
      }
      itpBlocks.push(new Paragraph({ spacing: { after: 120 }, children: [] }))
    }

    if (checklist && checklist.length > 0) {
      itpBlocks.push(h3('QA Checklist'))
      checklist.forEach((c: any) => {
        itpBlocks.push(bodyText(`${c.checked ? '[x]' : '[ ]'} ${c.label}${c.comments ? ' - ' + c.comments : ''}`))
      })
    }
  }

  // Notices for this lot
  const { data: notices } = await supabase.from('notices').select('*').eq('lot_id', params.lotId)
  const noticeBlocks: Paragraph[] = []
  const STATUS_LABELS: Record<string, string> = { open: 'Open', pending_response: 'Pending Response', closed: 'Closed' }

  for (const n of notices ?? []) {
    const { data: ev } = await supabase.from('notice_evidence').select('*').eq('notice_id', n.id)
    noticeBlocks.push(h3(`${n.type} ${n.notice_number} - ${n.title}`))
    noticeBlocks.push(bodyText(`Status: ${STATUS_LABELS[n.status] ?? n.status}`))
    noticeBlocks.push(bodyText(n.description))
    for (const e of ev ?? []) {
      const img = await fetchImageRun(e.file_url, e.file_name)
      if (img) {
        noticeBlocks.push(new Paragraph({ children: [img], spacing: { after: 60 } }))
      } else {
        noticeBlocks.push(bodyText(`- ${e.file_name}`))
      }
    }
  }

  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        h1(`Lot Package - ${lotLabel}`),
        bodyText(`Project: ${project?.name ?? '-'}`),
        bodyText(`Lot: ${lotLabel}${lot.name && lot.lot_number ? ' - ' + lot.name : ''}`),
        bodyText(`Status: ${lot.status || '-'}`),
        bodyText(`Description: ${lot.description || '-'}`),
        bodyText(`Generated: ${new Date().toLocaleString('en-NZ')}`),

        new Paragraph({ children: [new PageBreak()] }),
        h1('Inspection & Test Plans'),
        ...(itpBlocks.length > 0 ? itpBlocks : [bodyText('No ITPs assigned to this lot.')]),

        new Paragraph({ children: [new PageBreak()] }),
        h1('Notices (RFI / NCR / EWN / etc.)'),
        ...(noticeBlocks.length > 0 ? noticeBlocks : [bodyText('No notices linked to this lot.')]),

        new Paragraph({ children: [new PageBreak()] }),
        h1('Conformance Statement'),
        bodyText(`This Lot Package certifies that the works described in Lot ${lotLabel} have been carried out and inspected in accordance with the relevant Inspection and Test Plans, specifications and standards, and that any associated notices have been addressed as recorded above.`),
        new Paragraph({ spacing: { before: 300 }, children: [] }),
        signatureBlock('Senior Project Engineer'),
        new Paragraph({ spacing: { before: 200 }, children: [] }),
        signatureBlock('QA Manager'),
        new Paragraph({ spacing: { before: 200 }, children: [] }),
        signatureBlock('Independent Verifier'),
      ],
    }],
  })

  const buffer = await Packer.toBuffer(doc)

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="Lot-Package-${lotLabel}.docx"`,
      'Cache-Control': 'no-store',
    },
  })
}
