import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, BorderStyle, PageBreak,
} from 'docx'
import { requireProjectOrg, authErrorResponse } from '@/lib/auth/apiAuth'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const TEAL = '1F7A8C'
const BORDER_COL = 'CCCCCC'
const MID_GREY = 'F2F2F2'

function h1(text: string) {
  return new Paragraph({ spacing: { before: 100, after: 160 }, children: [new TextRun({ text, bold: true, size: 30, color: TEAL, font: 'Arial' })] })
}
function h2(text: string) {
  return new Paragraph({ spacing: { before: 280, after: 120 }, children: [new TextRun({ text, bold: true, size: 24, color: TEAL, font: 'Arial' })] })
}
function bodyText(text: string) {
  return new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: text || '-', size: 18, font: 'Arial' })] })
}
function headCell(text: string, width = 2000) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: { fill: MID_GREY },
    borders: { top: { style: BorderStyle.SINGLE, size: 1, color: BORDER_COL }, bottom: { style: BorderStyle.SINGLE, size: 1, color: BORDER_COL }, left: { style: BorderStyle.SINGLE, size: 1, color: BORDER_COL }, right: { style: BorderStyle.SINGLE, size: 1, color: BORDER_COL } },
    margins: { top: 60, bottom: 60, left: 90, right: 90 },
    children: [new Paragraph({ children: [new TextRun({ text, bold: true, size: 16, font: 'Arial' })] })],
  })
}
function cell(text: string, width = 2000) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders: { top: { style: BorderStyle.SINGLE, size: 1, color: BORDER_COL }, bottom: { style: BorderStyle.SINGLE, size: 1, color: BORDER_COL }, left: { style: BorderStyle.SINGLE, size: 1, color: BORDER_COL }, right: { style: BorderStyle.SINGLE, size: 1, color: BORDER_COL } },
    margins: { top: 60, bottom: 60, left: 90, right: 90 },
    children: [new Paragraph({ children: [new TextRun({ text: text || '-', size: 16, font: 'Arial' })] })],
  })
}

function countBy<T>(rows: T[], key: (r: T) => string) {
  const map: Record<string, number> = {}
  for (const r of rows) {
    const k = key(r) || 'Unknown'
    map[k] = (map[k] ?? 0) + 1
  }
  return map
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const projectId = params.id

  const auth = await requireProjectOrg(projectId)
  if (!auth.ok) return authErrorResponse(auth)

  const { data: project, error: projErr } = await supabase.from('projects').select('*').eq('id', projectId).single()
  if (projErr || !project) {
    console.error('PROJECT SUMMARY EXPORT ERROR:', projErr)
    return NextResponse.json({ error: 'Project not found', details: projErr?.message }, { status: 404 })
  }

  const { data: lots } = await supabase.from('lots').select('*').eq('project_id', projectId)
  const { data: itps } = await supabase.from('itps').select('*').eq('project_id', projectId)
  const { data: notices } = await supabase.from('notices').select('*').eq('project_id', projectId)
  const { data: obs } = await supabase.from('safety_observations').select('*').eq('project_id', projectId)
  const { data: swmsList } = await supabase.from('swms').select('*').eq('project_id', projectId)

  const itpIds = (itps ?? []).map((i: any) => i.id)
  let activities: any[] = []
  if (itpIds.length > 0) {
    const { data: actData } = await supabase.from('itp_activities').select('itp_id, is_complete').in('itp_id', itpIds)
    activities = actData ?? []
  }

  // --- Lots table with per-lot ITP completion ---
  const lotRows: Paragraph[][] = []
  const lotTableRows: TableRow[] = [
    new TableRow({ children: [headCell('Lot', 2500), headCell('Status', 1500), headCell('ITPs', 1500), headCell('Completion', 2000)] }),
  ]
  for (const lot of lots ?? []) {
    const lotItpIds = (itps ?? []).filter((i: any) => i.lot_id === lot.id).map((i: any) => i.id)
    const lotActs = activities.filter((a: any) => lotItpIds.includes(a.itp_id))
    const pct = lotActs.length > 0 ? Math.round((lotActs.filter((a: any) => a.is_complete).length / lotActs.length) * 100) : 0
    const label = lot.lot_number || lot.name || lot.id
    lotTableRows.push(new TableRow({
      children: [cell(label, 2500), cell(lot.status || '-', 1500), cell(String(lotItpIds.length), 1500), cell(`${pct}%`, 2000)],
    }))
  }

  // --- ITP completion overall ---
  const totalActs = activities.length
  const doneActs = activities.filter((a: any) => a.is_complete).length
  const overallPct = totalActs > 0 ? Math.round((doneActs / totalActs) * 100) : 0

  // --- Notices by type / status ---
  const noticesByType = countBy(notices ?? [], (n: any) => n.type)
  const noticesByStatus = countBy(notices ?? [], (n: any) => n.status)

  // --- Observations by category / status ---
  const obsByCategory = countBy(obs ?? [], (o: any) => o.category)
  const obsByStatus = countBy(obs ?? [], (o: any) => o.status)

  const statCountTable = (counts: Record<string, number>, labelHeader: string) => new Table({
    width: { size: 9500, type: WidthType.DXA },
    rows: [
      new TableRow({ children: [headCell(labelHeader, 5000), headCell('Count', 2000)] }),
      ...Object.entries(counts).map(([k, v]) => new TableRow({ children: [cell(k, 5000), cell(String(v), 2000)] })),
    ],
  })

  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        h1(`Project Summary - ${project.name}`),
        bodyText(`Generated: ${new Date().toLocaleString('en-NZ')}`),

        h2('Lots & ITP Completion'),
        new Table({ width: { size: 9500, type: WidthType.DXA }, rows: lotTableRows }),
        bodyText(''),
        bodyText(`Overall ITP completion: ${doneActs} of ${totalActs} activities signed off (${overallPct}%) across ${(itps ?? []).length} ITPs.`),

        new Paragraph({ children: [new PageBreak()] }),
        h2('Notices (RFI / NCR / EWN / etc.)'),
        bodyText(`Total: ${(notices ?? []).length}`),
        statCountTable(noticesByType, 'Type'),
        bodyText(''),
        statCountTable(noticesByStatus, 'Status'),

        new Paragraph({ children: [new PageBreak()] }),
        h2('Safety Observations'),
        bodyText(`Total: ${(obs ?? []).length}`),
        statCountTable(obsByCategory, 'Category'),
        bodyText(''),
        statCountTable(obsByStatus, 'Status'),

        new Paragraph({ children: [new PageBreak()] }),
        h2('SWMS'),
        new Table({
          width: { size: 9500, type: WidthType.DXA },
          rows: [
            new TableRow({ children: [headCell('Title', 5500), headCell('Revision', 2000), headCell('Status', 2000)] }),
            ...(swmsList ?? []).map((s: any) => new TableRow({
              children: [cell(s.title, 5500), cell(s.revision || '-', 2000), cell(s.status || '-', 2000)],
            })),
          ],
        }),
      ],
    }],
  })

  const buffer = await Packer.toBuffer(doc)

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="Project-Summary-${project.name.replace(/[^a-z0-9]+/gi, '-')}.docx"`,
    },
  })
}
