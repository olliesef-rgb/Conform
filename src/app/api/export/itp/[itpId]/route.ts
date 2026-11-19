import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, BorderStyle, WidthType, ShadingType, VerticalAlign,
  PageOrientation, LevelFormat, HeadingLevel, PageBreak,
} from 'docx'
import { requireRecordProjectAccess, authErrorResponse } from '@/lib/auth/apiAuth'

// --- Supabase (service role - server only) ---
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// --- Colour palette (matching real ITP docs) ---
const TEAL       = '1F7A8C'   // section header bg
const TEAL_LIGHT = 'D6EEF2'   // legend bar bg
const DARK_BLUE  = '1A3A4A'   // header text on teal
const MID_GREY   = 'F2F2F2'   // alternating row
const BORDER_COL = 'CCCCCC'
const WHITE      = 'FFFFFF'

// --- Border helper ---
const border = (color = BORDER_COL) => ({ style: BorderStyle.SINGLE, size: 1, color })
const allBorders = (color = BORDER_COL) => ({
  top: border(color), bottom: border(color),
  left: border(color), right: border(color),
})
const noBorders = () => ({
  top:    { style: BorderStyle.NONE, size: 0, color: WHITE },
  bottom: { style: BorderStyle.NONE, size: 0, color: WHITE },
  left:   { style: BorderStyle.NONE, size: 0, color: WHITE },
  right:  { style: BorderStyle.NONE, size: 0, color: WHITE },
})

// --- Cell helpers ---
function hdrCell(text: string, width: number, opts: { bold?: boolean; fontSize?: number } = {}) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: { fill: TEAL, type: ShadingType.CLEAR },
    borders: allBorders(TEAL),
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      children: [new TextRun({
        text,
        bold: opts.bold ?? true,
        color: WHITE,
        size: opts.fontSize ?? 16,
        font: 'Arial',
      })],
    })],
  })
}

function dataCell(
  text: string,
  width: number,
  opts: { bold?: boolean; shade?: boolean; fontSize?: number; center?: boolean } = {}
) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: { fill: opts.shade ? MID_GREY : WHITE, type: ShadingType.CLEAR },
    borders: allBorders(),
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      alignment: opts.center ? AlignmentType.CENTER : AlignmentType.LEFT,
      children: [new TextRun({
        text: text || '—',
        bold: opts.bold,
        size: opts.fontSize ?? 16,
        font: 'Arial',
      })],
    })],
  })
}

function labelCell(label: string, width: number) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: { fill: MID_GREY, type: ShadingType.CLEAR },
    borders: allBorders(),
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [new Paragraph({
      children: [new TextRun({ text: label, bold: true, size: 16, font: 'Arial' })],
    })],
  })
}

// --- Spacer paragraph ---
function spacer(pts = 80) {
  return new Paragraph({ spacing: { before: pts, after: pts }, children: [] })
}

// --- Section header row (full width, teal background) ---
// Total page width A4 landscape: 16838 - 1440*2 = 13958 DXA content
const PAGE_W = 13958

function sectionHeaderRow(label: string, colCount: number) {
  // Use columnSpan to span all columns
  return new TableRow({
    children: [
      new TableCell({
        columnSpan: colCount,
        width: { size: PAGE_W, type: WidthType.DXA },
        shading: { fill: TEAL, type: ShadingType.CLEAR },
        borders: allBorders(TEAL),
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({
          children: [new TextRun({
            text: label,
            bold: true,
            color: WHITE,
            size: 18,
            font: 'Arial',
          })],
        })],
      }),
    ],
  })
}

// --- Column widths for activities table ---
// Activity# | Description | Responsibility | Req/Ref | Conformance | Method | Frequency | Type | Attendance | Records
const COL = [700, 2800, 1000, 1500, 2000, 900, 1000, 500, 700, 1858]
// sum = 12958 (fits A4 landscape with 0.5" margins each side)

// --- GET handler ---
export async function GET(
  req: NextRequest,
  { params }: { params: { itpId: string } }
) {
  const { itpId } = params

  // Confirm the signed-in caller's organisation actually owns the project
  // this ITP belongs to before generating and returning its DOCX export.
  const auth = await requireRecordProjectAccess('itps', 'id', itpId)
  if (!auth.ok) return authErrorResponse(auth)

  // 1. Fetch ITP header
  const { data: itp, error: itpErr } = await supabase
    .from('itps')
    .select('*')
    .eq('id', itpId)
    .single()

  if (itpErr || !itp) {
    return NextResponse.json({ error: 'ITP not found' }, { status: 404 })
  }

  // 2. Fetch project
  const { data: project } = await supabase
    .from('projects')
    .select('name, contract_number, client')
    .eq('id', itp.project_id)
    .single()

  // 3. Fetch activities
  const { data: activities } = await supabase
    .from('itp_activities')
    .select('*')
    .eq('itp_id', itpId)
    .order('sort_order', { ascending: true })

  const acts = activities ?? []

  // 4. Group activities by section
  const sections: Record<string, typeof acts> = {}
  for (const act of acts) {
    const key = act.section_name || 'General'
    if (!sections[key]) sections[key] = []
    sections[key].push(act)
  }

  const formattedDate = itp.created_at
    ? new Date(itp.created_at).toLocaleDateString('en-NZ', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : ''

  // --- Document ---
  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: 'Arial', size: 18 } },
      },
    },
    numbering: {
      config: [
        {
          reference: 'bullets',
          levels: [{
            level: 0,
            format: LevelFormat.BULLET,
            text: '•',
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 360, hanging: 180 } } },
          }],
        },
      ],
    },
    sections: [{
      properties: {
        page: {
          size: {
            width: 12240,
            height: 15840,
            orientation: PageOrientation.LANDSCAPE,
          },
          margin: { top: 720, right: 720, bottom: 720, left: 720 },
        },
      },
      children: [

        // --- TITLE ---
        new Paragraph({
          spacing: { before: 0, after: 120 },
          children: [new TextRun({
            text: 'INSPECTION TEST PLAN',
            bold: true,
            size: 36,
            color: TEAL,
            font: 'Arial',
          })],
        }),

        // --- HEADER INFO TABLE ---
        new Table({
          width: { size: PAGE_W, type: WidthType.DXA },
          columnWidths: [1600, 3000, 1600, 3000, 1600, 3158],
          rows: [
            new TableRow({ children: [
              labelCell('CLIENT:', 1600),
              dataCell(project?.client || itp.client || '', 3000),
              labelCell('ITP No:', 1600),
              dataCell(itp.itp_number, 3000),
              labelCell('REVISION:', 1600),
              dataCell(itp.revision, 3158),
            ]}),
            new TableRow({ children: [
              labelCell('CONTRACT No. #', 1600),
              dataCell(project?.contract_number || itp.contract_number || '', 3000),
              labelCell('JOB/ITP TITLE:', 1600),
              dataCell(itp.title, 3000),
              labelCell('STATUS:', 1600),
              dataCell((itp.status || 'draft').toUpperCase().replace(/_/g, ' '), 3158),
            ]}),
            new TableRow({ children: [
              labelCell('CONTRACT:', 1600),
              dataCell(project?.name || '', 3000),
              labelCell('PACKAGE No:', 1600),
              dataCell(itp.package_number || '', 3000),
              labelCell('WORK AREA:', 1600),
              dataCell(itp.work_area || '', 3158),
            ]}),
            new TableRow({ children: [
              labelCell('WORKPLACE / ADDRESS:', 1600),
              dataCell(itp.workplace_address || '', 3000),
              labelCell('CHAINAGE (if any):', 1600),
              dataCell(itp.chainage || 'N/A', 3000),
              labelCell('DATE:', 1600),
              dataCell(formattedDate, 3158),
            ]}),
            new TableRow({ children: [
              labelCell('CONTRACTOR NAME:', 1600),
              dataCell(itp.contractor_names?.join(', ') || 'GAJV', 3000),
              labelCell('RELATED CEP No:', 1600),
              dataCell(itp.related_cep_number || 'TBC', 3000),
              labelCell("ENGINEER'S NAME:", 1600),
              dataCell(itp.engineer_name || '', 3158),
            ]}),
            new TableRow({ children: [
              labelCell('SUBCONTRACTOR/S NAME:', 1600),
              dataCell(itp.subcontractor_names?.join(', ') || '', 3000),
              labelCell('SWMS No (if any):', 1600),
              dataCell(itp.swms_number || 'TBC', 3000),
              labelCell('DISCIPLINE:', 1600),
              dataCell((itp.discipline || '').toUpperCase(), 3158),
            ]}),
            new TableRow({ children: [
              labelCell('WORK DESCRIPTION:', 1600),
              new TableCell({
                columnSpan: 5,
                width: { size: PAGE_W - 1600, type: WidthType.DXA },
                shading: { fill: WHITE, type: ShadingType.CLEAR },
                borders: allBorders(),
                margins: { top: 60, bottom: 60, left: 100, right: 100 },
                children: [new Paragraph({
                  children: [new TextRun({ text: itp.work_description || '', size: 16, font: 'Arial' })],
                })],
              }),
            ]}),
          ],
        }),

        spacer(120),

        // --- DEFINITIONS PARAGRAPH ---
        new Paragraph({
          spacing: { before: 0, after: 60 },
          children: [new TextRun({
            text: 'The purpose of this Inspection and Test Plan is for identifying and tracking stages of completion and product traceability during all phases of construction.',
            bold: true,
            size: 16,
            font: 'Arial',
          })],
        }),
        ...['Packages: Discrete components or work areas.',
          'Inspection and Test Plan: A sequential work method statement capturing quality related requirements that provide evidence of conformance to specifications.',
          'Inspection Check Sheet: A document detailing specific criteria to be checked and recorded, often developed to meet testing requirements of standards and/or technical specifications.',
          'Punch List / Defects List: A list of minor rectification type tasks which need to complete to satisfy the term of the contract.',
          'Surveillance: Ongoing monitoring.',
          'Hold Point: A notice of the event must be provided and shall not proceed with the work without the client or its representative being present unless authority to proceed has been provided by the client in writing. Signature required.',
          'Witness Point: A notice of the event must be provided. If the client representative is not present at the designated time and place, work may proceed.',
        ].map(t => new Paragraph({
          spacing: { before: 0, after: 40 },
          children: [new TextRun({ text: t, size: 14, font: 'Arial' })],
        })),

        spacer(80),

        // --- LEGEND BAR ---
        new Table({
          width: { size: PAGE_W, type: WidthType.DXA },
          columnWidths: [2000, 2000, 2000, 3958, 2000, 2000],
          rows: [new TableRow({ children: [
            'W = WITNESS POINT',
            'H = HOLD POINT',
            'S = SURVEILLANCE',
            'GAJV = GHELLA ABERGELDIE JOINT VENTURE',
            'S/C = SUBCONTRACTOR',
            'WSL = ENGINEER REPRESENTATIVE',
          ].map((t, i) => new TableCell({
            width: { size: i === 3 ? 3958 : 2000, type: WidthType.DXA },
            shading: { fill: TEAL_LIGHT, type: ShadingType.CLEAR },
            borders: allBorders(TEAL),
            margins: { top: 60, bottom: 60, left: 100, right: 100 },
            children: [new Paragraph({
              children: [new TextRun({ text: t, bold: true, size: 14, font: 'Arial', color: DARK_BLUE })],
            })],
          }))})],
        }),

        spacer(80),

        // --- ACTIVITIES TABLE ---
        new Table({
          width: { size: PAGE_W, type: WidthType.DXA },
          columnWidths: COL,
          rows: [
            // Header row
            new TableRow({
              tableHeader: true,
              children: [
                hdrCell('ACTIVITY\nNo. #', COL[0]),
                hdrCell('DESCRIPTION', COL[1]),
                hdrCell('RESPONSIBILITY', COL[2]),
                hdrCell('REQUIREMENTS /\nREFERENCE', COL[3]),
                hdrCell('CONFORMANCE CRITERIA', COL[4]),
                hdrCell('METHOD', COL[5]),
                hdrCell('FREQUENCY /\nPROCESS HELD', COL[6]),
                hdrCell('TYPE', COL[7]),
                hdrCell('ATTEND.', COL[8]),
                hdrCell('RECORDS OR CHECKLISTS', COL[9]),
              ],
            }),

            // Activities grouped by section
            ...Object.entries(sections).flatMap(([sectionName, sectionActs], secIdx) => [
              sectionHeaderRow(sectionName, 10),
              ...sectionActs.map((act, rowIdx) => new TableRow({
                children: [
                  dataCell(act.activity_number || '', COL[0], { shade: rowIdx % 2 === 1, center: true }),
                  dataCell(act.description || '', COL[1], { shade: rowIdx % 2 === 1 }),
                  dataCell(act.responsibility || '', COL[2], { shade: rowIdx % 2 === 1 }),
                  dataCell(act.requirements_reference || '', COL[3], { shade: rowIdx % 2 === 1, fontSize: 14 }),
                  dataCell(act.conformance_criteria || '', COL[4], { shade: rowIdx % 2 === 1, fontSize: 14 }),
                  dataCell(act.method || '', COL[5], { shade: rowIdx % 2 === 1, fontSize: 14 }),
                  dataCell(act.frequency || '', COL[6], { shade: rowIdx % 2 === 1, fontSize: 14 }),
                  // H/W badge cell
                  new TableCell({
                    width: { size: COL[7], type: WidthType.DXA },
                    shading: {
                      fill: act.hold_witness_type === 'H' ? 'FFD7D7'
                          : act.hold_witness_type === 'W' ? 'FFF3CD'
                          : act.hold_witness_type === 'R' ? 'D6EEF2'
                          : MID_GREY,
                      type: ShadingType.CLEAR,
                    },
                    borders: allBorders(),
                    margins: { top: 60, bottom: 60, left: 60, right: 60 },
                    verticalAlign: VerticalAlign.CENTER,
                    children: [new Paragraph({
                      alignment: AlignmentType.CENTER,
                      children: [new TextRun({
                        text: act.hold_witness_type || '',
                        bold: true,
                        size: 18,
                        font: 'Arial',
                        color: act.hold_witness_type === 'H' ? 'CC0000'
                             : act.hold_witness_type === 'W' ? '996600'
                             : act.hold_witness_type === 'R' ? '1F7A8C'
                             : '666666',
                      })],
                    })],
                  }),
                  dataCell(
                    Array.isArray(act.attendance_required)
                      ? act.attendance_required.join('\n')
                      : act.attendance_required || '',
                    COL[8], { shade: rowIdx % 2 === 1, fontSize: 13 }
                  ),
                  dataCell(act.records_checklists || '', COL[9], { shade: rowIdx % 2 === 1, fontSize: 14 }),
                ],
              })),
            ]),
          ],
        }),

        spacer(160),

        // --- PAGE BREAK before QA checklist ---
        new Paragraph({ children: [new PageBreak()] }),

        // --- QA DOCUMENT CHECKLIST ---
        new Paragraph({
          spacing: { before: 0, after: 120 },
          children: [new TextRun({ text: 'QA DOCUMENT CHECKLIST', bold: true, size: 22, font: 'Arial' })],
        }),

        new Table({
          width: { size: PAGE_W, type: WidthType.DXA },
          columnWidths: [400, 3400, 800, 1200, 400, 3400, 800, 1200, 1558],
          rows: [
            // Header
            new TableRow({ children: [
              hdrCell('ITEM', 400),
              hdrCell('QA DOCUMENT CHECKLIST', 3400),
              hdrCell('TICK', 800),
              hdrCell('COMMENTS', 1200),
              hdrCell('ITEM', 400),
              hdrCell('QA DOCUMENT CHECKLIST', 3400),
              hdrCell('TICK', 800),
              hdrCell('COMMENTS', 1558),
              // dummy last cell to fill width
              new TableCell({ width: { size: 0, type: WidthType.DXA }, borders: noBorders(), children: [new Paragraph({ children: [] })] }),
            ]}),
            // Items (22 items in 11 rows of 2)
            ...[
              ['1', 'Completed Inspection and Test Plan', '12', 'Check sheets Completed and signed'],
              ['2', 'Material Delivery Dockets (if applicable)', '13', 'Independent Reviewer Report'],
              ['3', 'Incoming Material Inspection Checklist', '14', 'Operation and Maintenance Manuals (if applicable)'],
              ['4', 'All Aconex Mails Closed-Out - Related to Lots', '15', 'Warranties / Guarantees (if applicable)'],
              ['5', 'Conformance Certificates (if applicable)', '16', 'Producer Statements'],
              ['6', 'Test Reports', '17', 'Compliance Statement'],
              ['7', 'Engineers Red-Line mark ups', '18', 'Relevant RFIs'],
              ['8', 'As Built Survey', '19', 'Instructions'],
              ['9', 'Photos', '20', 'Factory Acceptance Test (if applicable)'],
              ['10', 'Geotechnical Site Inspection Report (if applicable)', '21', 'Other'],
              ['11', 'QA Engineer Site Inspection Report', '22', 'Other'],
            ].map(([n1, l1, n2, l2], i) => new TableRow({
              children: [
                dataCell(n1, 400, { center: true, shade: i % 2 === 1 }),
                dataCell(l1, 3400, { shade: i % 2 === 1, fontSize: 14 }),
                dataCell('☐', 800, { center: true, shade: i % 2 === 1 }),
                dataCell('', 1200, { shade: i % 2 === 1 }),
                dataCell(n2, 400, { center: true, shade: i % 2 === 1 }),
                dataCell(l2, 3400, { shade: i % 2 === 1, fontSize: 14 }),
                dataCell('☐', 800, { center: true, shade: i % 2 === 1 }),
                dataCell('', 1558, { shade: i % 2 === 1 }),
                new TableCell({ width: { size: 0, type: WidthType.DXA }, borders: noBorders(), children: [new Paragraph({ children: [] })] }),
              ],
            })),
          ],
        }),

        spacer(160),

        // --- CONFORMANCE / VERIFICATION STATEMENT ---
        new Table({
          width: { size: PAGE_W, type: WidthType.DXA },
          columnWidths: [PAGE_W],
          rows: [
            new TableRow({ children: [
              new TableCell({
                width: { size: PAGE_W, type: WidthType.DXA },
                shading: { fill: TEAL, type: ShadingType.CLEAR },
                borders: allBorders(TEAL),
                margins: { top: 80, bottom: 80, left: 120, right: 120 },
                children: [new Paragraph({
                  children: [new TextRun({ text: 'CONFORMANCE / VERIFICATION STATEMENT', bold: true, color: WHITE, size: 20, font: 'Arial' })],
                })],
              }),
            ]}),
            new TableRow({ children: [
              new TableCell({
                width: { size: PAGE_W, type: WidthType.DXA },
                shading: { fill: WHITE, type: ShadingType.CLEAR },
                borders: allBorders(),
                margins: { top: 80, bottom: 80, left: 120, right: 120 },
                children: [new Paragraph({
                  children: [new TextRun({
                    text: 'This closed lot conforms in all respects with the standards and requirements specified in the Contract Documents. The lot verification records are complete, and any non-conformances have been closed out in accordance with the Projects requirements.',
                    size: 16,
                    font: 'Arial',
                  })],
                })],
              }),
            ]}),
          ],
        }),

        spacer(80),

        // Signature rows
        ...([
          'Construction Lot checked by the Senior Project Engineer responsible for the works',
          'Construction Lot verified and closed by Quality Management Representative',
          'Independent Verification Review (if required) by:',
        ]).map(label => new Table({
          width: { size: PAGE_W, type: WidthType.DXA },
          columnWidths: [3500, 800, 3500, 800, 2000, 1358],
          rows: [new TableRow({ children: [
            new TableCell({
              width: { size: 3500, type: WidthType.DXA },
              shading: { fill: MID_GREY, type: ShadingType.CLEAR },
              borders: allBorders(),
              margins: { top: 60, bottom: 60, left: 100, right: 100 },
              children: [new Paragraph({
                children: [new TextRun({ text: label, bold: true, size: 16, font: 'Arial' })],
              })],
            }),
            labelCell('PRINT NAME', 800),
            dataCell('', 3500),
            labelCell('SIGNATURE', 800),
            dataCell('', 2000),
            new TableCell({
              width: { size: 1358, type: WidthType.DXA },
              shading: { fill: WHITE, type: ShadingType.CLEAR },
              borders: allBorders(),
              margins: { top: 60, bottom: 60, left: 100, right: 100 },
              children: [
                new Paragraph({ children: [new TextRun({ text: 'DATE', bold: true, size: 16, font: 'Arial' })] }),
                new Paragraph({ children: [new TextRun({ text: '', size: 16, font: 'Arial' })] }),
              ],
            }),
          ]})],
        })).flatMap(t => [t, spacer(60)]),

        // --- FOOTER NOTE ---
        spacer(80),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({
            text: `DOCUMENT UNCONTROLLED WHEN PRINTED  ·  ${itp.itp_number}  ·  Rev ${itp.revision}  ·  Generated ${formattedDate}`,
            size: 14,
            color: '888888',
            font: 'Arial',
          })],
        }),
      ],
    }],
  })

  // --- Generate buffer and return as download ---
  const buffer = await Packer.toBuffer(doc)
  const filename = `${itp.itp_number}_Rev${itp.revision}.docx`

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length.toString(),
    },
  })
}
