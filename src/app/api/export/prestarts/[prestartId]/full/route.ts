import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, BorderStyle, ImageRun,
} from 'docx'
import { requireRecordProjectAccess, authErrorResponse } from '@/lib/auth/apiAuth'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const NAVY = '163300'
const SAGE = 'E2F6D5'
const BORDER_COLOR = 'CDD3DA'

const cellBorders = {
  top: { style: BorderStyle.SINGLE, size: 4, color: BORDER_COLOR },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: BORDER_COLOR },
  left: { style: BorderStyle.SINGLE, size: 4, color: BORDER_COLOR },
  right: { style: BorderStyle.SINGLE, size: 4, color: BORDER_COLOR },
}
const cellMargins = { top: 100, bottom: 100, left: 120, right: 120 }
const writingCellMargins = { top: 200, bottom: 200, left: 120, right: 120 }

function getImageDimensions(buf: Buffer, type: string): { width: number; height: number } | null {
  try {
    if (type === 'png') {
      if (buf.length < 24) return null
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
    }
    if (type === 'jpg') {
      let offset = 2
      while (offset < buf.length - 9) {
        if (buf[offset] !== 0xFF) break
        const marker = buf[offset + 1]
        if (marker === 0xC0 || marker === 0xC1 || marker === 0xC2 || marker === 0xC3) {
          return { height: buf.readUInt16BE(offset + 5), width: buf.readUInt16BE(offset + 7) }
        }
        const segLength = buf.readUInt16BE(offset + 2)
        offset += 2 + segLength
      }
      return null
    }
    if (type === 'gif') {
      if (buf.length < 10) return null
      return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) }
    }
    if (type === 'bmp') {
      if (buf.length < 26) return null
      return { width: buf.readInt32LE(18), height: Math.abs(buf.readInt32LE(22)) }
    }
    return null
  } catch {
    return null
  }
}

async function fetchImageForDocx(url: string): Promise<{ data: Buffer; width: number; height: number; type: 'jpg' | 'png' | 'gif' | 'bmp' } | null> {
  try {
    const ext = (url.split('?')[0].split('.').pop() || '').toLowerCase()
    const typeMap: Record<string, 'jpg' | 'png' | 'gif' | 'bmp'> = { jpg: 'jpg', jpeg: 'jpg', png: 'png', gif: 'gif', bmp: 'bmp' }
    const type = typeMap[ext]
    if (!type) return null

    const res = await fetch(url)
    if (!res.ok) return null
    const data = Buffer.from(await res.arrayBuffer())

    const dims = getImageDimensions(data, type)
    if (!dims || !dims.width || !dims.height) return null

    const maxWidth = 560
    const scale = dims.width > maxWidth ? maxWidth / dims.width : 1
    return { data, width: Math.round(dims.width * scale), height: Math.round(dims.height * scale), type }
  } catch {
    return null
  }
}

// Single-column "box" section: title bar + content, as TWO ROWS of the SAME table
// (never a nested table, which is what caused the colour bar to shrink to the width
// of its own text). cantSplit stops a row being sliced mid-row, and tableHeader makes
// the title repeat above the content wherever it lands if the table does have to move
// to the next page - so the heading can never end up separated from what's under it.
function boxSection(title: string, contentChildren: any[]) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        cantSplit: true,
        tableHeader: true,
        children: [
          new TableCell({
            width: { size: 100, type: WidthType.PERCENTAGE },
            shading: { fill: NAVY },
            borders: cellBorders,
            margins: cellMargins,
            children: [new Paragraph({ children: [new TextRun({ text: title, bold: true, color: 'FFFFFF' })] })],
          }),
        ],
      }),
      // Content row deliberately has no cantSplit: free text here can run long, and
      // forcing it to stay in one piece just pushes the whole box to the next page,
      // leaving a large blank gap behind it. tableHeader on the title row above
      // already guarantees the heading reappears wherever the content actually lands.
      new TableRow({
        children: [
          new TableCell({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: cellBorders,
            margins: writingCellMargins,
            children: contentChildren,
          }),
        ],
      }),
    ],
  })
}

// Multi-column "data" section: a full-width title row (columnSpan across every data
// column, so the green bar is exactly as wide as the table below it), then the
// column-header row, then the body rows - all rows of ONE table.
function dataSection(title: string, headerCells: string[], widths: number[], bodyRows: TableRow[]) {
  const titleRow = new TableRow({
    cantSplit: true,
    tableHeader: true,
    children: [
      new TableCell({
        columnSpan: headerCells.length,
        width: { size: 100, type: WidthType.PERCENTAGE },
        shading: { fill: NAVY },
        borders: cellBorders,
        margins: cellMargins,
        children: [new Paragraph({ children: [new TextRun({ text: title, bold: true, color: 'FFFFFF' })] })],
      }),
    ],
  })
  const headerRow = new TableRow({
    cantSplit: true,
    tableHeader: true,
    children: headerCells.map((h, i) => new TableCell({
      width: { size: widths[i], type: WidthType.PERCENTAGE },
      shading: { fill: SAGE },
      borders: cellBorders,
      margins: cellMargins,
      children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, color: NAVY })] })],
    })),
  })
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [titleRow, headerRow, ...bodyRows] })
}

function dataBodyRow(cells: string[], widths: number[]) {
  return new TableRow({
    cantSplit: true,
    children: cells.map((c, i) => new TableCell({
      width: { size: widths[i], type: WidthType.PERCENTAGE },
      borders: cellBorders,
      margins: cellMargins,
      children: [new Paragraph({ children: [new TextRun(c)] })],
    })),
  })
}

function blankDataRow(widths: number[]) {
  return new TableRow({
    cantSplit: true,
    children: widths.map(w => new TableCell({
      width: { size: w, type: WidthType.PERCENTAGE },
      borders: cellBorders,
      margins: writingCellMargins,
      children: [new Paragraph({ text: '' })],
    })),
  })
}

function labelValueTable(rows: Array<[string, string]>, labelWidth = 22) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map(([label, value]) => new TableRow({
      cantSplit: true,
      children: [
        new TableCell({
          width: { size: labelWidth, type: WidthType.PERCENTAGE },
          shading: { fill: SAGE },
          borders: cellBorders,
          margins: cellMargins,
          children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, color: NAVY })] })],
        }),
        new TableCell({
          width: { size: 100 - labelWidth, type: WidthType.PERCENTAGE },
          borders: cellBorders,
          margins: writingCellMargins,
          children: [
            ...(value || '-').split('\n').map(line => new Paragraph({ children: [new TextRun(line)] })),
            new Paragraph({ text: '' }),
          ],
        }),
      ],
    })),
  })
}

// Plain text content for inside a boxSection. trailingBlanks defaults to 2 (handwriting
// space); pass 0 for auto-generated content nobody writes into by hand, so a long block
// that spills onto a new page doesn't leave the repeated heading sitting above nothing.
// trailingBlanks: flat number of blank handwriting lines always added after the text.
// minLines: absolute floor on total lines (content + blanks) - use this when a box needs
// to hold a guaranteed minimum height (e.g. a third of a page) no matter how short the
// text is, rather than just a couple of spare lines.
function textBoxContent(text: string, trailingBlanks = 2, minLines = 0) {
  const lines = (text || '-').split('\n')
  let blanks = trailingBlanks
  const currentTotal = lines.length + blanks
  if (currentTotal < minLines) blanks += (minLines - currentTotal)
  return [
    ...lines.map(line => new Paragraph({ children: [new TextRun(line)] })),
    ...Array.from({ length: blanks }).map(() => new Paragraph({ text: '' })),
  ]
}

function blankDrawContent() {
  return [
    new Paragraph({
      children: [new TextRun({ text: 'No plan uploaded - mark the work area and safe walkways below', italics: true, color: '8A9BB0', size: 18 })],
    }),
    ...Array.from({ length: 14 }).map(() => new Paragraph({ text: '' })),
  ]
}

// Top info strip: Project gets its own full-width row (names can be long), Date and
// Weather pair up on the next row with generous width each so neither wraps/bunches,
// then Supervisor on its own full-width row.
// Label column width used consistently across the top strip, Supervisor Sign-Off and
// Nominated First Aiders, so their green label columns line up vertically down the page.
const LABEL_COL_WIDTH = 22

function stripRow1(label: string, value: string) {
  return new TableRow({
    cantSplit: true,
    children: [
      new TableCell({ width: { size: LABEL_COL_WIDTH, type: WidthType.PERCENTAGE }, shading: { fill: SAGE }, borders: cellBorders, margins: cellMargins, children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, color: NAVY })] })] }),
      new TableCell({ width: { size: 100 - LABEL_COL_WIDTH, type: WidthType.PERCENTAGE }, borders: cellBorders, margins: cellMargins, children: [new Paragraph({ children: [new TextRun(value || '-')] })] }),
    ],
  })
}

// Width for the two boxes with longer labels (Supervisor Sign-Off, Nominated First
// Aiders) - wide enough that the label sits on one line instead of wrapping, and shared
// between the two so their columns line up with each other.
const SIGNOFF_LABEL_WIDTH = 34

// Supervisor sign-off - signature only; name is already shown at the top of the form,
// so it isn't repeated here. One row, fits without wrapping.
function supervisorSignoffTable() {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          new TableCell({
            width: { size: SIGNOFF_LABEL_WIDTH, type: WidthType.PERCENTAGE },
            shading: { fill: SAGE },
            borders: cellBorders,
            margins: cellMargins,
            children: [
              new Paragraph({ children: [new TextRun({ text: 'Supervisor Sign-Off', bold: true, color: NAVY })] }),
            ],
          }),
          new TableCell({
            width: { size: 100 - SIGNOFF_LABEL_WIDTH, type: WidthType.PERCENTAGE },
            borders: cellBorders,
            margins: writingCellMargins,
            children: [
              new Paragraph({ children: [new TextRun({ text: 'Signature', italics: true, color: '8A9BB0', size: 18 })] }),
              new Paragraph({ text: '' }),
            ],
          }),
        ],
      }),
    ],
  })
}

function signOnRows(signons: any[], widths: number[]) {
  const filledRows = (signons ?? []).map((s: any) => new TableRow({
    cantSplit: true,
    children: [
      new TableCell({ width: { size: widths[0], type: WidthType.PERCENTAGE }, borders: cellBorders, margins: cellMargins, children: [new Paragraph({ children: [new TextRun(s.name)] })] }),
      new TableCell({ width: { size: widths[1], type: WidthType.PERCENTAGE }, borders: cellBorders, margins: cellMargins, children: [new Paragraph({ children: [new TextRun(s.company || '-')] })] }),
      new TableCell({ width: { size: widths[2], type: WidthType.PERCENTAGE }, borders: cellBorders, margins: cellMargins, children: [new Paragraph({ children: [new TextRun({ text: '(signed online)', italics: true })] })] }),
      new TableCell({ width: { size: widths[3], type: WidthType.PERCENTAGE }, borders: cellBorders, margins: cellMargins, children: [new Paragraph({ children: [new TextRun(new Date(s.signed_at).toLocaleString('en-NZ'))] })] }),
    ],
  }))
  // Enough blank rows to fill a whole page on its own, since Attendee List now starts
  // on a fresh page (see pageBreakBefore where this is used).
  const blankRows = Array.from({ length: 28 }).map(() => blankDataRow(widths))
  return [...filledRows, ...blankRows]
}

function spacer() {
  return new Paragraph({ text: '', spacing: { after: 200 } })
}

export async function GET(req: NextRequest, { params }: { params: { prestartId: string } }) {
  const prestartId = params.prestartId

  const auth = await requireRecordProjectAccess('prestarts', 'id', prestartId)
  if (!auth.ok) return authErrorResponse(auth)

  const { data: prestart } = await supabase
    .from('prestarts')
    .select('*, projects(name)')
    .eq('id', prestartId)
    .single()

  if (!prestart) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { data: swmsLinks } = await supabase
    .from('prestart_swms')
    .select('swms:swms_id(swms_number, title)')
    .eq('prestart_id', prestartId)
  const swmsList = ((swmsLinks ?? []) as any[]).map(r => r.swms).filter(Boolean)

  const PERMIT_ORDER = [
    'Hot Works', 'Excavation', 'Confined Space', 'Working at Height',
    'Electrical Isolation', 'Lifting / Crane', 'Traffic Management', 'Other',
  ]
  const { data: permitsRaw } = await supabase.from('prestart_permits').select('*').eq('prestart_id', prestartId)
  // Always print every permit type, not just the ones currently flagged as required -
  // permit status can change mid-day (pending -> approved, or a new one becomes needed),
  // and the printed sheet is the thing that gets hand-amended on site, not regenerated.
  const allPermits = [...(permitsRaw ?? [])].sort((a: any, b: any) => PERMIT_ORDER.indexOf(a.permit_type) - PERMIT_ORDER.indexOf(b.permit_type))

  const { data: deliveries } = await supabase.from('prestart_deliveries').select('*').eq('prestart_id', prestartId)

  const { data: signons } = await supabase
    .from('prestart_signons')
    .select('*')
    .eq('prestart_id', prestartId)
    .order('signed_at', { ascending: true })

  const dateStr = new Date(prestart.date).toLocaleDateString('en-NZ', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' })

  const children: any[] = []

  children.push(new Paragraph({
    children: [new TextRun({ text: 'DAILY ACTIVITY PRE-START', bold: true, size: 36, color: NAVY })],
    spacing: { after: 60 },
  }))
  children.push(new Paragraph({
    children: [new TextRun({ text: (prestart.projects?.name ?? '') + '  -  ' + dateStr, italics: true, size: 22 })],
    spacing: { after: 240 },
  }))

  children.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      stripRow1('Project', prestart.projects?.name ?? '-'),
      stripRow1('Site / Area', prestart.site_area || '-'),
      stripRow1('Date', dateStr),
      stripRow1('Supervisor', prestart.nominated_supervisor || '-'),
      stripRow1('Weather', prestart.weather || '-'),
    ],
  }))
  children.push(spacer())

  children.push(boxSection('Notes (if any)', textBoxContent(prestart.notes || '-')))
  children.push(spacer())

  children.push(new Paragraph({
    children: [new TextRun({
      text: 'The shift supervisor declares: all appointed personnel for today are competent for their assigned roles, and all known hazards and controls for today’s work have been communicated to the crew.',
      italics: true, color: '52637A', size: 19,
    })],
    spacing: { after: 160 },
  }))

  children.push(supervisorSignoffTable())
  children.push(spacer())

  children.push(labelValueTable([['Nominated First Aiders', prestart.nominated_first_aiders || '-']], SIGNOFF_LABEL_WIDTH))
  children.push(spacer())

  children.push(boxSection('Crew / Attendees (As Planned)', textBoxContent(prestart.crew || '-')))
  children.push(spacer())

  children.push(boxSection('Planned Works For Today', textBoxContent(prestart.planned_works || '-', 2, 16)))
  children.push(spacer())

  const swmsText = swmsList.length === 0
    ? 'None linked.'
    : swmsList.map((s: any) => s.swms_number + ' - ' + s.title).join('\n')
  children.push(boxSection('Linked SWMS', textBoxContent(swmsText)))
  children.push(spacer())

  if (prestart.critical_risks_snapshot) {
    children.push(boxSection('Critical Risks & Controls (High/Critical before controls, grouped by SWMS)', textBoxContent(prestart.critical_risks_snapshot, 0)))
    children.push(spacer())
  }

  let siteLayoutBody: any[] = []
  if (prestart.site_layout_url) {
    const img = await fetchImageForDocx(prestart.site_layout_url)
    if (img) {
      siteLayoutBody = [new Paragraph({
        children: [new ImageRun({ data: img.data, transformation: { width: img.width, height: img.height }, type: img.type } as any)],
      })]
    } else {
      siteLayoutBody = [new Paragraph({ children: [new TextRun('Plan: ' + prestart.site_layout_url)] })]
    }
  } else {
    siteLayoutBody = blankDrawContent()
  }
  if (prestart.site_layout_notes) {
    siteLayoutBody.push(new Paragraph({ children: [new TextRun({ text: 'Notes: ', bold: true }), new TextRun(prestart.site_layout_notes)] }))
  }
  children.push(boxSection('Site Layout (Mark your work area and safe walkways)', siteLayoutBody))
  children.push(spacer())

  if (prestart.emergency_procedures || prestart.nearest_medical_facility) {
    children.push(boxSection('Emergency Procedures', [
      new Paragraph({ children: [new TextRun({ text: 'Procedures: ', bold: true })] }),
      ...textBoxContent(prestart.emergency_procedures || '-'),
      new Paragraph({ children: [new TextRun({ text: 'Nearest Medical Facility: ', bold: true })] }),
      ...textBoxContent(prestart.nearest_medical_facility || '-'),
    ]))
    children.push(spacer())
  }

  if (prestart.site_constraints || prestart.simultaneous_operations) {
    children.push(boxSection('Site Constraints / SIMOPS', [
      new Paragraph({ children: [new TextRun({ text: 'Site Constraints: ', bold: true })] }),
      ...textBoxContent(prestart.site_constraints || '-'),
      new Paragraph({ children: [new TextRun({ text: 'Simultaneous Operations: ', bold: true })] }),
      ...textBoxContent(prestart.simultaneous_operations || '-'),
    ]))
    children.push(spacer())
  }

  const permitsWidths = [24, 14, 18, 44]
  const permitsRows = [
    ...allPermits.map((p: any) => dataBodyRow(
      [p.permit_type, p.status === 'not_required' ? 'N' : 'Y', p.reference || '-', p.notes || '-'],
      permitsWidths
    )),
    blankDataRow(permitsWidths),
  ]
  children.push(dataSection('Permits', ['Permit Type', 'Required? (Y/N)', 'Reference', 'Notes'], permitsWidths, permitsRows))
  children.push(spacer())

  const deliveriesWidths = [14, 36, 18, 12, 20]
  const deliveriesRows = (!deliveries || deliveries.length === 0)
    ? [blankDataRow(deliveriesWidths)]
    : [
        ...deliveries.map((d: any) => dataBodyRow([d.supplier || '-', d.description, d.expected_time || '-', d.quantity || '-', String(d.status).toUpperCase()], deliveriesWidths)),
        blankDataRow(deliveriesWidths),
        blankDataRow(deliveriesWidths),
      ]
  children.push(dataSection('Expected Site Deliveries', ['Supplier', 'Description', 'Expected', 'Qty', 'Status'], deliveriesWidths, deliveriesRows))
  children.push(spacer())

  const attendeeWidths = [24, 24, 30, 22]
  children.push(new Paragraph({ text: '', pageBreakBefore: true }))
  children.push(dataSection('Attendee List', ['Attendee Name', 'Company', 'Signature', 'Time'], attendeeWidths, signOnRows(signons ?? [], attendeeWidths)))

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: 'Calibri', size: 22 },
        },
      },
    },
    sections: [{ properties: {}, children }],
  })
  const buffer = await Packer.toBuffer(doc)

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': 'attachment; filename="prestart-full-' + prestart.date + '.docx"',
    },
  })
}
