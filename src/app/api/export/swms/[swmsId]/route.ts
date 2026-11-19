import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, BorderStyle, WidthType, ShadingType, VerticalAlign,
  PageOrientation, LevelFormat, PageBreak,
} from 'docx'
import { requireRecordProjectAccess, authErrorResponse } from '@/lib/auth/apiAuth'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// â”€â”€ Colours â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const TEAL       = '1F7A8C'
const TEAL_LIGHT = 'D6EEF2'
const DARK_BLUE  = '1A3A4A'
const MID_GREY   = 'F2F2F2'
const BORDER_COL = 'CCCCCC'
const WHITE      = 'FFFFFF'
const RED_LIGHT  = 'FFD7D7'
const AMBER_LIGHT= 'FFF3CD'
const GREEN_LIGHT= 'D4EDDA'

// â”€â”€ Page width A4 landscape (DXA) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const PAGE_W = 13958

// â”€â”€ Border helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const b = (color = BORDER_COL) => ({ style: BorderStyle.SINGLE, size: 1, color })
const allBorders = (color = BORDER_COL) => ({ top: b(color), bottom: b(color), left: b(color), right: b(color) })
const noBorder = () => ({ style: BorderStyle.NONE, size: 0, color: WHITE })
const noBorders = () => ({ top: noBorder(), bottom: noBorder(), left: noBorder(), right: noBorder() })

// â”€â”€ Cell helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function hdrCell(text: string, width: number) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: { fill: TEAL, type: ShadingType.CLEAR },
    borders: allBorders(TEAL),
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      children: [new TextRun({ text, bold: true, color: WHITE, size: 16, font: 'Arial' })],
    })],
  })
}

function dataCell(text: string, width: number, opts: { bold?: boolean; shade?: boolean; center?: boolean; fontSize?: number; fill?: string } = {}) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: { fill: opts.fill ?? (opts.shade ? MID_GREY : WHITE), type: ShadingType.CLEAR },
    borders: allBorders(),
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      alignment: opts.center ? AlignmentType.CENTER : AlignmentType.LEFT,
      children: [new TextRun({ text: text || 'â€”', bold: opts.bold, size: opts.fontSize ?? 16, font: 'Arial' })],
    })],
  })
}

function labelCell(text: string, width: number) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: { fill: MID_GREY, type: ShadingType.CLEAR },
    borders: allBorders(),
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [new Paragraph({
      children: [new TextRun({ text, bold: true, size: 16, font: 'Arial' })],
    })],
  })
}

function spacer(pts = 80) {
  return new Paragraph({ spacing: { before: pts, after: pts }, children: [] })
}

function sectionHeader(text: string, cols: number) {
  return new TableRow({
    children: [new TableCell({
      columnSpan: cols,
      width: { size: PAGE_W, type: WidthType.DXA },
      shading: { fill: TEAL, type: ShadingType.CLEAR },
      borders: allBorders(TEAL),
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      children: [new Paragraph({
        children: [new TextRun({ text, bold: true, color: WHITE, size: 18, font: 'Arial' })],
      })],
    })],
  })
}

function riskFill(score: number) {
  if (score >= 20) return 'FFB3B3'
  if (score >= 17) return 'FFA07A'
  if (score >= 8) return 'FFF3CD'
  return GREEN_LIGHT
}

function riskColor(score: number) {
  if (score >= 17) return 'CC0000'
  if (score >= 8) return '996600'
  return '276221'
}

// â”€â”€ GET handler â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function GET(
  _req: NextRequest,
  { params }: { params: { swmsId: string } }
) {
  const { swmsId } = params

  const auth = await requireRecordProjectAccess('swms', 'id', swmsId)
  if (!auth.ok) return authErrorResponse(auth)

  const { data: swms, error } = await supabase
    .from('swms')
    .select('*')
    .eq('id', swmsId)
    .single()

  if (error || !swms) return NextResponse.json({ error: 'SWMS not found' }, { status: 404 })

  const { data: project } = await supabase
    .from('projects')
    .select('name, contract_number, client')
    .eq('id', swms.project_id)
    .single()

  const { data: activities } = await supabase
    .from('swms_activities')
    .select('*')
    .eq('swms_id', swmsId)
    .order('sort_order', { ascending: true })

  const acts = activities ?? []
  const ppe: string[] = Array.isArray(swms.ppe_requirements) ? swms.ppe_requirements : []
  const sections = swms.additional_sections ?? {}
  const trainingRows: any[] = sections.training ?? []
  const drawingRows: any[] = sections.drawings ?? []
  const assocDocRows: any[] = sections.assoc_docs ?? []
  const resourceRows: any[] = sections.resources ?? []
  const training: any[] = sections.training ?? []
  const safetyEquipment: string[] = sections.safety_equipment ?? []
  const permitsRequired: string[] = sections.permits_required ?? []
  const hazardousSubstances: any[] = sections.hazardous_substances ?? []
  const environmentRisks: any[] = sections.environment_risks ?? []
  const stakeholders: any[] = sections.stakeholders ?? []
  const hazardId: Record<string, any> = sections.hazard_identification ?? {}
  const emergencyResponse: string = sections.emergency_response ?? ''
  const plantEquipment: string[] = Array.isArray(swms.plant_equipment) ? swms.plant_equipment : []

  const formattedDate = new Date(swms.created_at).toLocaleDateString('en-NZ', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })

  // â”€â”€ Document â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const doc = new Document({
    styles: {
      default: { document: { run: { font: 'Arial', size: 18 } } },
    },
    numbering: {
      config: [{
        reference: 'bullets',
        levels: [{
          level: 0,
          format: LevelFormat.BULLET,
          text: '-',
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 360, hanging: 180 } } },
        }],
      }],
    },
    sections: [{
      properties: {
        page: {
          size: { width: 12240, height: 15840, orientation: PageOrientation.LANDSCAPE },
          margin: { top: 720, right: 720, bottom: 720, left: 720 },
        },
      },
      children: [

        // â”€â”€ TITLE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        new Paragraph({
          spacing: { before: 0, after: 120 },
          children: [new TextRun({ text: 'SAFE WORK METHOD STATEMENT (SWMS)', bold: true, size: 36, color: TEAL, font: 'Arial' })],
        }),

        // â”€â”€ HEADER TABLE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        new Table({
          width: { size: PAGE_W, type: WidthType.DXA },
          columnWidths: [2400, 4400, 2400, 4758],
          rows: [
            new TableRow({ children: [
              labelCell('SWMS NAME', 1800),
              new TableCell({
                columnSpan: 3, width: { size: 8000, type: WidthType.DXA },
                shading: { fill: WHITE, type: ShadingType.CLEAR }, borders: allBorders(),
                margins: { top: 60, bottom: 60, left: 100, right: 100 },
                children: [new Paragraph({ children: [new TextRun({ text: swms.title || '', bold: true, size: 16, font: 'Arial' })] })],
              }),
              labelCell('SWMS #', 1600),
              dataCell(swms.swms_number || '', 2558),
            ]}),
            new TableRow({ children: [
              labelCell('SUBCONTRACTOR', 1800),
              dataCell(sections.subcontractor || swms.subcontractor_names?.join(', ') || 'N/A', 3200),
              labelCell('RELATED CEP #', 1600),
              dataCell(sections.related_cep || swms.related_cep_number || '', 3200),
              labelCell('SWMS REVISION #', 1600),
              dataCell(swms.revision || '1.0', 2558),
            ]}),
            new TableRow({ children: [
              labelCell('WORKPLACE ADDRESS', 1800),
              new TableCell({
                columnSpan: 5, width: { size: PAGE_W - 1800, type: WidthType.DXA },
                shading: { fill: WHITE, type: ShadingType.CLEAR }, borders: allBorders(),
                margins: { top: 60, bottom: 60, left: 100, right: 100 },
                children: [new Paragraph({ children: [new TextRun({ text: swms.workplace_address || swms.work_location || '', size: 16, font: 'Arial' })] })],
              }),
            ]}),
            new TableRow({ children: [
              labelCell('ACTIVITY OR TASK', 1800),
              new TableCell({
                columnSpan: 5, width: { size: PAGE_W - 1800, type: WidthType.DXA },
                shading: { fill: WHITE, type: ShadingType.CLEAR }, borders: allBorders(),
                margins: { top: 80, bottom: 80, left: 100, right: 100 },
                children: [new Paragraph({ children: [new TextRun({ text: swms.work_description || '', size: 16, font: 'Arial' })] })],
              }),
            ]}),
            new TableRow({ children: [
              labelCell('SWMS PREPARED BY', 1800),
              dataCell(sections.prepared_by || '', 3200),
              labelCell('SIGNATURE', 1600),
              dataCell('', 3200),
              labelCell('DATE', 1600),
              dataCell(formattedDate, 2558),
            ]}),
            new TableRow({ children: [
              labelCell('SWMS REVIEWED BY', 1800),
              dataCell(sections.reviewed_by || '', 3200),
              labelCell('SIGNATURE', 1600),
              dataCell('', 3200),
              labelCell('DATE', 1600),
              dataCell('', 2558),
            ]}),
            new TableRow({ children: [
              labelCell('SWMS APPROVED BY', 1800),
              dataCell(sections.approved_by || '', 3200),
              labelCell('SIGNATURE', 1600),
              dataCell('', 3200),
              labelCell('DATE', 1600),
              dataCell('', 2558),
            ]}),
            new TableRow({ children: [
              labelCell('PERSON SUPERVISING WORK', 2400),
              dataCell(sections.person_supervising || swms.site_supervisor || '', 4400),
              labelCell('POSITION OF PERSON SUPERVISING', 2400),
              dataCell(sections.position_supervising || '', 4758),
            ]}),
            new TableRow({ children: [
              labelCell('PERSON RESPONSIBLE FOR ENSURING COMPLIANCE WITH THE SWMS', 2400),
              dataCell(sections.person_responsible || '', 4400),
              labelCell('POSITION', 2400),
              dataCell(sections.position_responsible || '', 4758),
            ]}),
            new TableRow({ children: [
              labelCell('MINIMUM NO. OF PERSONS INVOLVED IN TASK', 1800),
              dataCell(sections.min_persons || '', 3200),
              labelCell('DURATION OF WORKS (Start / Finish)', 1600),
              new TableCell({
                columnSpan: 3, width: { size: 7358, type: WidthType.DXA },
                shading: { fill: WHITE, type: ShadingType.CLEAR }, borders: allBorders(),
                margins: { top: 60, bottom: 60, left: 100, right: 100 },
                children: [new Paragraph({ children: [new TextRun({ text: [sections.duration_start, sections.duration_end].filter(Boolean).join(' - ') || '', size: 16, font: 'Arial' })] })],
              }),
            ]}),
          ],
        }),

        spacer(80),

        // â”€â”€ TRAINING & COMPETENCY â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        new Table({
          width: { size: PAGE_W, type: WidthType.DXA },
          columnWidths: [Math.floor(PAGE_W/2), PAGE_W - Math.floor(PAGE_W/2)],
          rows: [
            new TableRow({ children: [
              new TableCell({
                width: { size: Math.floor(PAGE_W/2), type: WidthType.DXA },
                shading: { fill: TEAL, type: ShadingType.CLEAR }, borders: allBorders(TEAL),
                margins: { top: 70, bottom: 70, left: 120, right: 120 },
                children: [new Paragraph({ children: [new TextRun({ text: 'TRAINING AND COMPETENCY DETAILS - All training and competencies identified as being required to perform activity shall be recorded.', bold: true, color: WHITE, size: 14, font: 'Arial' })] })],
              }),
              new TableCell({
                width: { size: PAGE_W - Math.floor(PAGE_W/2), type: WidthType.DXA },
                shading: { fill: TEAL, type: ShadingType.CLEAR }, borders: allBorders(TEAL),
                margins: { top: 70, bottom: 70, left: 120, right: 120 },
                children: [new Paragraph({ children: [new TextRun({ text: 'TRAINING REQUIREMENTS - Identified gaps in skills and training required to perform activity', bold: true, color: WHITE, size: 14, font: 'Arial' })] })],
              }),
            ]}),
            ...(trainingRows.length > 0
              ? trainingRows.map((t: any, idx: number) => new TableRow({ children: [
                  new TableCell({
                    width: { size: Math.floor(PAGE_W/2), type: WidthType.DXA },
                    shading: { fill: idx % 2 === 1 ? MID_GREY : WHITE, type: ShadingType.CLEAR }, borders: allBorders(),
                    margins: { top: 80, bottom: 80, left: 120, right: 120 },
                    children: [
                      new Paragraph({ children: [new TextRun({ text: t.role || '', bold: true, size: 15, font: 'Arial' })] }),
                      ...(t.requirements ? [new Paragraph({ children: [new TextRun({ text: t.requirements, size: 14, font: 'Arial' })] })] : []),
                    ],
                  }),
                  new TableCell({
                    width: { size: PAGE_W - Math.floor(PAGE_W/2), type: WidthType.DXA },
                    shading: { fill: idx % 2 === 1 ? MID_GREY : WHITE, type: ShadingType.CLEAR }, borders: allBorders(),
                    margins: { top: 80, bottom: 80, left: 120, right: 120 },
                    children: [new Paragraph({ children: [new TextRun({ text: '', size: 14, font: 'Arial' })] })],
                  }),
                ]}))
              : Array.from({ length: 4 }, (_, idx) => new TableRow({ children: [
                  new TableCell({ width: { size: Math.floor(PAGE_W/2), type: WidthType.DXA }, shading: { fill: idx % 2 === 1 ? MID_GREY : WHITE, type: ShadingType.CLEAR }, borders: allBorders(), margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [] })] }),
                  new TableCell({ width: { size: PAGE_W - Math.floor(PAGE_W/2), type: WidthType.DXA }, shading: { fill: idx % 2 === 1 ? MID_GREY : WHITE, type: ShadingType.CLEAR }, borders: allBorders(), margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [] })] }),
                ]}))
            ),
          ],
        }),

        spacer(80),

        // â”€â”€ DRAWINGS & SPECS + ASSOCIATED DOCS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        new Table({
          width: { size: PAGE_W, type: WidthType.DXA },
          columnWidths: [Math.floor(PAGE_W/2), PAGE_W - Math.floor(PAGE_W/2)],
          rows: [
            new TableRow({ children: [
              new TableCell({
                width: { size: Math.floor(PAGE_W/2), type: WidthType.DXA },
                shading: { fill: TEAL, type: ShadingType.CLEAR }, borders: allBorders(TEAL),
                margins: { top: 70, bottom: 70, left: 120, right: 120 },
                children: [new Paragraph({ children: [new TextRun({ text: "Drawings and Specifications - All drawings and specifications identified as being required to perform activity shall be recorded.", bold: true, color: WHITE, size: 14, font: 'Arial' })] })],
              }),
              new TableCell({
                width: { size: PAGE_W - Math.floor(PAGE_W/2), type: WidthType.DXA },
                shading: { fill: TEAL, type: ShadingType.CLEAR }, borders: allBorders(TEAL),
                margins: { top: 70, bottom: 70, left: 120, right: 120 },
                children: [new Paragraph({ children: [new TextRun({ text: "Associated Documents (ITP's, CEP's, SWMS', SOP's) - All associated documents with this SWMS interrelates with must be identified.", bold: true, color: WHITE, size: 14, font: 'Arial' })] })],
              }),
            ]}),
            new TableRow({ children: [
              new TableCell({
                width: { size: Math.floor(PAGE_W/2), type: WidthType.DXA },
                shading: { fill: MID_GREY, type: ShadingType.CLEAR }, borders: allBorders(),
                margins: { top: 60, bottom: 60, left: 120, right: 120 },
                children: [new Paragraph({ children: [new TextRun({ text: 'Reference No.', bold: true, size: 15, font: 'Arial' }), new TextRun({ text: '          Title', bold: true, size: 15, font: 'Arial' })] })],
              }),
              new TableCell({
                width: { size: PAGE_W - Math.floor(PAGE_W/2), type: WidthType.DXA },
                shading: { fill: MID_GREY, type: ShadingType.CLEAR }, borders: allBorders(),
                margins: { top: 60, bottom: 60, left: 120, right: 120 },
                children: [new Paragraph({ children: [new TextRun({ text: 'Reference No.', bold: true, size: 15, font: 'Arial' }), new TextRun({ text: '          Title', bold: true, size: 15, font: 'Arial' })] })],
              }),
            ]}),
            ...Array.from({ length: Math.max(drawingRows.length, assocDocRows.length, 4) }, (_, idx) => {
              const drawing = drawingRows[idx] ?? { ref: '', title: '' }
              const assoc = assocDocRows[idx] ?? { ref: '', title: '' }
              return new TableRow({ children: [
                new TableCell({
                  width: { size: Math.floor(PAGE_W/2), type: WidthType.DXA },
                  shading: { fill: idx % 2 === 1 ? MID_GREY : WHITE, type: ShadingType.CLEAR }, borders: allBorders(),
                  margins: { top: 60, bottom: 60, left: 120, right: 120 },
                  children: [new Paragraph({ children: [new TextRun({ text: drawing.ref ? `${drawing.ref}     ${drawing.title}` : '', size: 14, font: 'Arial' })] })],
                }),
                new TableCell({
                  width: { size: PAGE_W - Math.floor(PAGE_W/2), type: WidthType.DXA },
                  shading: { fill: idx % 2 === 1 ? MID_GREY : WHITE, type: ShadingType.CLEAR }, borders: allBorders(),
                  margins: { top: 60, bottom: 60, left: 120, right: 120 },
                  children: [new Paragraph({ children: [new TextRun({ text: assoc.ref ? `${assoc.ref}     ${assoc.title}` : '', size: 14, font: 'Arial' })] })],
                }),
              ]})
            }),
          ],
        }),

        spacer(80),

        // â”€â”€ RESOURCE DETAILS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        new Table({
          width: { size: PAGE_W, type: WidthType.DXA },
          columnWidths: [PAGE_W],
          rows: [new TableRow({ children: [new TableCell({
            width: { size: PAGE_W, type: WidthType.DXA },
            shading: { fill: TEAL, type: ShadingType.CLEAR }, borders: allBorders(TEAL),
            margins: { top: 70, bottom: 70, left: 120, right: 120 },
            children: [new Paragraph({ children: [new TextRun({ text: 'RESOURCE DETAILS - All plant, equipment, materials and temporary works identified as being required to perform activity shall be recorded.', bold: true, color: WHITE, size: 14, font: 'Arial' })] })],
          })]},)],
        }),
        new Table({
          width: { size: PAGE_W, type: WidthType.DXA },
          columnWidths: [Math.floor(PAGE_W/3), Math.floor(PAGE_W/3), PAGE_W - Math.floor(PAGE_W/3)*2],
          rows: [
            new TableRow({ children: [
              hdrCell('Plant and Equipment', Math.floor(PAGE_W/3)),
              hdrCell('Safety / Emergency Equipment', Math.floor(PAGE_W/3)),
              hdrCell('Permits Required', PAGE_W - Math.floor(PAGE_W/3)*2),
            ]}),
            ...Array.from({ length: Math.max(resourceRows.length, 4) }, (_, idx) => {
              const r = resourceRows[idx] ?? { plant: '', safety: '', permits: '' }
              return new TableRow({ children: [
                dataCell(r.plant || '', Math.floor(PAGE_W/3), { shade: idx % 2 === 1 }),
                dataCell(r.safety || '', Math.floor(PAGE_W/3), { shade: idx % 2 === 1 }),
                dataCell(r.permits || '', PAGE_W - Math.floor(PAGE_W/3)*2, { shade: idx % 2 === 1 }),
              ]})
            }),
          ],
        }),

        spacer(80),

        spacer(120),

        // â”€â”€ PPE REQUIREMENTS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        ...(ppe.length > 0 ? [
          new Table({
            width: { size: PAGE_W, type: WidthType.DXA },
            columnWidths: [PAGE_W],
            rows: [
              new TableRow({ children: [new TableCell({
                width: { size: PAGE_W, type: WidthType.DXA },
                shading: { fill: TEAL, type: ShadingType.CLEAR },
                borders: allBorders(TEAL),
                margins: { top: 80, bottom: 80, left: 120, right: 120 },
                children: [new Paragraph({ children: [new TextRun({ text: 'PPE REQUIREMENTS', bold: true, color: WHITE, size: 18, font: 'Arial' })] })],
              })]},),
              new TableRow({ children: [new TableCell({
                width: { size: PAGE_W, type: WidthType.DXA },
                shading: { fill: WHITE, type: ShadingType.CLEAR },
                borders: allBorders(),
                margins: { top: 80, bottom: 80, left: 120, right: 120 },
                children: ppe.map(item => new Paragraph({
                  numbering: { reference: 'bullets', level: 0 },
                  children: [new TextRun({ text: item, size: 16, font: 'Arial' })],
                })),
              })]},),
            ],
          }),
          spacer(100),
        ] : []),


        // â”€â”€ TRAINING & COMPETENCY â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        ...(training.length > 0 ? [
          new Paragraph({ children: [new PageBreak()] }),
          new Table({
            width: { size: PAGE_W, type: WidthType.DXA },
            columnWidths: [PAGE_W],
            rows: [
              new TableRow({ children: [new TableCell({
                width: { size: PAGE_W, type: WidthType.DXA },
                shading: { fill: TEAL, type: ShadingType.CLEAR },
                borders: allBorders(TEAL),
                margins: { top: 80, bottom: 80, left: 120, right: 120 },
                children: [new Paragraph({ children: [new TextRun({ text: 'TRAINING AND COMPETENCY DETAILS', bold: true, color: WHITE, size: 18, font: 'Arial' })] })],
              })]},),
              ...training.map((t: any) => new TableRow({ children: [
                new TableCell({
                  width: { size: PAGE_W, type: WidthType.DXA },
                  shading: { fill: WHITE, type: ShadingType.CLEAR },
                  borders: allBorders(),
                  margins: { top: 80, bottom: 80, left: 120, right: 120 },
                  children: [
                    new Paragraph({ children: [new TextRun({ text: t.role || '', bold: true, size: 16, font: 'Arial' })] }),
                    ...(t.requirements ?? []).map((r: string) => new Paragraph({
                      numbering: { reference: 'bullets', level: 0 },
                      children: [new TextRun({ text: r, size: 15, font: 'Arial' })],
                    })),
                  ],
                }),
              ]})),
            ],
          }),
          spacer(80),
        ] : []),

        // â”€â”€ RESOURCE DETAILS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        ...(plantEquipment.length > 0 || safetyEquipment.length > 0 || permitsRequired.length > 0 ? [
          new Table({
            width: { size: PAGE_W, type: WidthType.DXA },
            columnWidths: [PAGE_W],
            rows: [
              new TableRow({ children: [new TableCell({
                width: { size: PAGE_W, type: WidthType.DXA },
                shading: { fill: TEAL, type: ShadingType.CLEAR },
                borders: allBorders(TEAL),
                margins: { top: 80, bottom: 80, left: 120, right: 120 },
                children: [new Paragraph({ children: [new TextRun({ text: 'RESOURCE DETAILS', bold: true, color: WHITE, size: 18, font: 'Arial' })] })],
              })]},),
            ],
          }),
          new Table({
            width: { size: PAGE_W, type: WidthType.DXA },
            columnWidths: [Math.floor(PAGE_W/3), Math.floor(PAGE_W/3), PAGE_W - Math.floor(PAGE_W/3)*2],
            rows: [
              new TableRow({ children: [
                hdrCell('Plant and Equipment', Math.floor(PAGE_W/3)),
                hdrCell('Safety / Emergency Equipment', Math.floor(PAGE_W/3)),
                hdrCell('Permits Required', PAGE_W - Math.floor(PAGE_W/3)*2),
              ]}),
              new TableRow({ children: [
                new TableCell({
                  width: { size: Math.floor(PAGE_W/3), type: WidthType.DXA },
                  shading: { fill: WHITE, type: ShadingType.CLEAR },
                  borders: allBorders(),
                  margins: { top: 80, bottom: 80, left: 120, right: 120 },
                  children: plantEquipment.map((item: string) => new Paragraph({
                    numbering: { reference: 'bullets', level: 0 },
                    children: [new TextRun({ text: item, size: 15, font: 'Arial' })],
                  })),
                }),
                new TableCell({
                  width: { size: Math.floor(PAGE_W/3), type: WidthType.DXA },
                  shading: { fill: WHITE, type: ShadingType.CLEAR },
                  borders: allBorders(),
                  margins: { top: 80, bottom: 80, left: 120, right: 120 },
                  children: safetyEquipment.map((item: string) => new Paragraph({
                    numbering: { reference: 'bullets', level: 0 },
                    children: [new TextRun({ text: item, size: 15, font: 'Arial' })],
                  })),
                }),
                new TableCell({
                  width: { size: PAGE_W - Math.floor(PAGE_W/3)*2, type: WidthType.DXA },
                  shading: { fill: WHITE, type: ShadingType.CLEAR },
                  borders: allBorders(),
                  margins: { top: 80, bottom: 80, left: 120, right: 120 },
                  children: permitsRequired.map((item: string) => new Paragraph({
                    numbering: { reference: 'bullets', level: 0 },
                    children: [new TextRun({ text: item, size: 15, font: 'Arial' })],
                  })),
                }),
              ]}),
            ],
          }),
          spacer(80),
        ] : []),

        // â”€â”€ HAZARDOUS SUBSTANCES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        ...(hazardousSubstances.length > 0 ? [
          new Table({
            width: { size: PAGE_W, type: WidthType.DXA },
            columnWidths: [PAGE_W],
            rows: [
              new TableRow({ children: [new TableCell({
                width: { size: PAGE_W, type: WidthType.DXA },
                shading: { fill: TEAL, type: ShadingType.CLEAR },
                borders: allBorders(TEAL),
                margins: { top: 80, bottom: 80, left: 120, right: 120 },
                children: [new Paragraph({ children: [new TextRun({ text: 'HAZARDOUS SUBSTANCES', bold: true, color: WHITE, size: 18, font: 'Arial' })] })],
              })]},),
            ],
          }),
          new Table({
            width: { size: PAGE_W, type: WidthType.DXA },
            columnWidths: [500, 1800, 800, 800, 2000, 3500, 4558],
            rows: [
              new TableRow({ children: [
                hdrCell('Item #', 500),
                hdrCell('Substance', 1800),
                hdrCell('Hazardous', 800),
                hdrCell('Dangerous', 800),
                hdrCell('PPE Requirements', 2000),
                hdrCell('Hazards', 3500),
                hdrCell('Control Measures', 4558),
              ]}),
              ...hazardousSubstances.map((s: any, idx: number) => new TableRow({ children: [
                dataCell(String(s.item ?? idx + 1), 500, { shade: idx % 2 === 1, center: true }),
                dataCell(s.substance ?? '', 1800, { shade: idx % 2 === 1 }),
                dataCell(s.hazardous ? 'â˜’' : 'â˜', 800, { shade: idx % 2 === 1, center: true }),
                dataCell(s.dangerous ? 'â˜’' : 'â˜', 800, { shade: idx % 2 === 1, center: true }),
                dataCell(s.ppe_requirements ?? '', 2000, { shade: idx % 2 === 1, fontSize: 14 }),
                dataCell(s.hazards ?? '', 3500, { shade: idx % 2 === 1, fontSize: 14 }),
                dataCell(s.controls ?? '', 4558, { shade: idx % 2 === 1, fontSize: 14 }),
              ]})),
            ],
          }),
          spacer(80),
        ] : []),

        // â”€â”€ ENVIRONMENT & SUSTAINABILITY â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        ...(environmentRisks.length > 0 ? [
          new Table({
            width: { size: PAGE_W, type: WidthType.DXA },
            columnWidths: [PAGE_W],
            rows: [
              new TableRow({ children: [new TableCell({
                width: { size: PAGE_W, type: WidthType.DXA },
                shading: { fill: TEAL, type: ShadingType.CLEAR },
                borders: allBorders(TEAL),
                margins: { top: 80, bottom: 80, left: 120, right: 120 },
                children: [new Paragraph({ children: [new TextRun({ text: 'ENVIRONMENT AND SUSTAINABILITY â€” RISK AND OPPORTUNITIES', bold: true, color: WHITE, size: 18, font: 'Arial' })] })],
              })]},),
            ],
          }),
          new Table({
            width: { size: PAGE_W, type: WidthType.DXA },
            columnWidths: [600, 2500, 3500, 5000, 2358],
            rows: [
              new TableRow({ children: [
                hdrCell('Item #', 600),
                hdrCell('Job Items', 2500),
                hdrCell('Risk / Opportunity', 3500),
                hdrCell('Actions', 5000),
                hdrCell('Responsible Person', 2358),
              ]}),
              ...environmentRisks.map((r: any, idx: number) => new TableRow({ children: [
                dataCell(String(r.item ?? idx + 1), 600, { shade: idx % 2 === 1, center: true }),
                dataCell(r.job_item ?? '', 2500, { shade: idx % 2 === 1 }),
                dataCell(r.risk ?? '', 3500, { shade: idx % 2 === 1, fontSize: 14 }),
                dataCell(r.actions ?? '', 5000, { shade: idx % 2 === 1, fontSize: 14 }),
                dataCell(r.responsible ?? '', 2358, { shade: idx % 2 === 1, fontSize: 14 }),
              ]})),
            ],
          }),
          spacer(80),
        ] : []),

        // â”€â”€ STAKEHOLDERS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        ...(stakeholders.length > 0 ? [
          new Table({
            width: { size: PAGE_W, type: WidthType.DXA },
            columnWidths: [PAGE_W],
            rows: [
              new TableRow({ children: [new TableCell({
                width: { size: PAGE_W, type: WidthType.DXA },
                shading: { fill: TEAL, type: ShadingType.CLEAR },
                borders: allBorders(TEAL),
                margins: { top: 80, bottom: 80, left: 120, right: 120 },
                children: [new Paragraph({ children: [new TextRun({ text: 'STAKEHOLDERS', bold: true, color: WHITE, size: 18, font: 'Arial' })] })],
              })]},),
            ],
          }),
          new Table({
            width: { size: PAGE_W, type: WidthType.DXA },
            columnWidths: [2500, 3000, 5500, 2958],
            rows: [
              new TableRow({ children: [
                hdrCell('Stakeholder', 2500),
                hdrCell('Consideration', 3000),
                hdrCell('Actions Required', 5500),
                hdrCell('Responsible Person', 2958),
              ]}),
              ...stakeholders.map((s: any, idx: number) => new TableRow({ children: [
                dataCell(s.stakeholder ?? '', 2500, { shade: idx % 2 === 1 }),
                dataCell(s.consideration ?? '', 3000, { shade: idx % 2 === 1, fontSize: 14 }),
                dataCell(s.actions ?? '', 5500, { shade: idx % 2 === 1, fontSize: 14 }),
                dataCell(s.responsible ?? '', 2958, { shade: idx % 2 === 1, fontSize: 14 }),
              ]})),
            ],
          }),
          spacer(80),
        ] : []),

        // â”€â”€ HAZARD IDENTIFICATION MATRIX â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        new Paragraph({ children: [new PageBreak()] }),
        new Table({
          width: { size: PAGE_W, type: WidthType.DXA },
          columnWidths: [PAGE_W],
          rows: [
            new TableRow({ children: [new TableCell({
              width: { size: PAGE_W, type: WidthType.DXA },
              shading: { fill: TEAL, type: ShadingType.CLEAR },
              borders: allBorders(TEAL),
              margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [new Paragraph({ children: [new TextRun({ text: 'HAZARD IDENTIFICATION - Below are examples of typical hazards that may be present. If any item is ticked, the step in the task that presents the hazard MUST be included in the following Task Breakdown section.', bold: true, color: WHITE, size: 16, font: 'Arial' })] })],
            })]},),
          ],
        }),
        // Column headers
        new Table({
          width: { size: PAGE_W, type: WidthType.DXA },
          columnWidths: [160, 1800, 160, 1800, 160, 1800, 160, 1800, 160, 1800, 160, 1800, 160, 1758],
          rows: [
            new TableRow({ children: [
              new TableCell({ columnSpan: 2, width: { size: 1960, type: WidthType.DXA }, shading: { fill: TEAL, type: ShadingType.CLEAR }, borders: allBorders(TEAL), margins: { top: 60, bottom: 60, left: 60, right: 60 }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'HIGH RISK', bold: true, color: WHITE, size: 14, font: 'Arial' })] })] }),
              new TableCell({ columnSpan: 2, width: { size: 1960, type: WidthType.DXA }, shading: { fill: TEAL, type: ShadingType.CLEAR }, borders: allBorders(TEAL), margins: { top: 60, bottom: 60, left: 60, right: 60 }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'HIGH RISK', bold: true, color: WHITE, size: 14, font: 'Arial' })] })] }),
              new TableCell({ columnSpan: 2, width: { size: 1960, type: WidthType.DXA }, shading: { fill: TEAL, type: ShadingType.CLEAR }, borders: allBorders(TEAL), margins: { top: 60, bottom: 60, left: 60, right: 60 }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'HIGH RISK', bold: true, color: WHITE, size: 14, font: 'Arial' })] })] }),
              new TableCell({ columnSpan: 2, width: { size: 1960, type: WidthType.DXA }, shading: { fill: TEAL, type: ShadingType.CLEAR }, borders: allBorders(TEAL), margins: { top: 60, bottom: 60, left: 60, right: 60 }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'WORK CONDITIONS', bold: true, color: WHITE, size: 14, font: 'Arial' })] })] }),
              new TableCell({ columnSpan: 2, width: { size: 1960, type: WidthType.DXA }, shading: { fill: TEAL, type: ShadingType.CLEAR }, borders: allBorders(TEAL), margins: { top: 60, bottom: 60, left: 60, right: 60 }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'ENVIRONMENTAL', bold: true, color: WHITE, size: 14, font: 'Arial' })] })] }),
              new TableCell({ columnSpan: 2, width: { size: 1960, type: WidthType.DXA }, shading: { fill: TEAL, type: ShadingType.CLEAR }, borders: allBorders(TEAL), margins: { top: 60, bottom: 60, left: 60, right: 60 }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'ADDITIONAL PPE', bold: true, color: WHITE, size: 14, font: 'Arial' })] })] }),
              new TableCell({ columnSpan: 2, width: { size: 1918, type: WidthType.DXA }, shading: { fill: TEAL, type: ShadingType.CLEAR }, borders: allBorders(TEAL), margins: { top: 60, bottom: 60, left: 60, right: 60 }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'ADDITIONAL EQUIP', bold: true, color: WHITE, size: 14, font: 'Arial' })] })] }),
            ]}),
            // Data rows â€” tick X if AI identified it
            ...([
              ['Work Location', 'work_location', 'Working at Heights', 'working_at_heights', 'Live Equipment', 'live_equipment', 'Trip Hazards', 'trip_hazards', 'Air Pollution (dust)', 'air_pollution_dust', 'Gloves', 'gloves', 'Signage', 'signage'],
              ['Difficult Entry/Exit', 'difficult_entry_exit', 'Scaffolding', 'scaffolding', 'Plant Room Hazards', 'plant_room_hazards', 'Slippery Surfaces', 'slippery_surfaces', 'Air Pollution (fumes)', 'air_pollution_fumes', 'Goggles', 'goggles', 'Barricades', 'barricades'],
              ['Oxygen Deficiency', 'oxygen_deficiency', 'Elevated Work Platforms', 'elevated_work_platforms', 'Live Rails', 'live_rails', 'Poor Lighting', 'poor_lighting', 'Soil Erosion', 'soil_erosion', 'Face Shield', 'face_shield', 'Ventilation', 'ventilation'],
              ['Oxygen Excess', 'oxygen_excess', 'Ladders Being Used', 'ladders', 'Moving Machinery', 'moving_machinery', 'High Noise Area', 'high_noise', 'Removal of Vegetation', 'vegetation_removal', 'Dust Mask', 'dust_mask', 'Personal Locks', 'personal_locks'],
              ['Engulfment', 'engulfment', 'Fall Restraint Needed', 'fall_restraint', 'Pressurised Fluids', 'pressurised_fluids', 'Housekeeping', 'housekeeping', 'Water Pollution (Sediment)', 'water_pollution', 'Hearing PPE', 'hearing_ppe', 'Rescue Plans', 'rescue_plans'],
              ['Toxic Gas Present', 'toxic_gas', 'Fall Arrest Needed', 'fall_arrest', 'Pneumatics', 'pneumatics', 'Moving Traffic / Rail', 'moving_traffic', 'Chemical Spills to Land', 'chemical_spills', 'Harnesses', 'harnesses', 'Extra Lighting', 'extra_lighting'],
              ['Explosive Gas Present', 'explosive_gas', 'Falling Objects', 'falling_objects', 'Automated Controls', 'automated_controls', 'Extreme Temps', 'extreme_temps', 'Pesticides / Chemicals', 'pesticides', 'Hi-vis Clothing', 'hi_vis', '', ''],
              ['Potentially Difficult Rescue', 'difficult_rescue', 'Work Near Excavations', 'work_near_excavations', 'Radiation', 'radiation', 'Remote Area', 'remote_area', 'Community Impact', 'community_impact', '', '', '', ''],
              ['Confined Space Permit Y/N', 'confined_space_permit', 'Work at Heights Permit Y/N', 'work_at_heights_permit', 'Isolation Plan Y/N', 'isolation_plan', 'Inhalation Dust/Fibres', 'dust_fibres', 'Spills to Drains/Waterbodies', 'spills_drains', 'Erosion & Sediment Control', 'erosion_control', '', ''],
              ['Hot Work Permit Y/N', 'hot_work_permit', 'Demolition Permit Y/N', 'demolition_permit', 'Electrical Permit Y/N', 'electrical_permit', 'Suspended Loads', 'suspended_loads', 'Work in/near Waterbody', 'near_waterbody', 'Reduced Driving Speeds', 'reduced_speeds', '', ''],
            ].map((row, idx) => new TableRow({ children: [
              ...Array.from({ length: 7 }, (_, col) => {
                const label = row[col * 2] as string
                const key = row[col * 2 + 1] as string
                const isChecked = false // Engineer ticks manually in Word
                const w = col === 6 ? 1918 : 1960
                return [
                  new TableCell({
                    width: { size: 160, type: WidthType.DXA },
                    shading: { fill: isChecked ? 'FFD700' : (idx % 2 === 1 ? MID_GREY : WHITE), type: ShadingType.CLEAR },
                    borders: allBorders(),
                    margins: { top: 40, bottom: 40, left: 40, right: 40 },
                    verticalAlign: VerticalAlign.CENTER,
                    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: isChecked ? 'X' : '', bold: true, size: 16, font: 'Arial' })] })],
                  }),
                  new TableCell({
                    width: { size: w - 160, type: WidthType.DXA },
                    shading: { fill: idx % 2 === 1 ? MID_GREY : WHITE, type: ShadingType.CLEAR },
                    borders: allBorders(),
                    margins: { top: 40, bottom: 40, left: 80, right: 80 },
                    children: [new Paragraph({ children: [new TextRun({ text: label, size: 13, font: 'Arial' })] })],
                  }),
                ]
              }).flat(),
            ]}))),
          ],
        }),
        spacer(80),

        // â”€â”€ EMERGENCY RESPONSE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        new Table({
          width: { size: PAGE_W, type: WidthType.DXA },
          columnWidths: [PAGE_W],
          rows: [
            new TableRow({ children: [new TableCell({
              width: { size: PAGE_W, type: WidthType.DXA },
              shading: { fill: TEAL, type: ShadingType.CLEAR },
              borders: allBorders(TEAL),
              margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [new Paragraph({ children: [new TextRun({ text: 'EMERGENCY RESPONSE - List any additional emergency response considerations relevant to this activity and emergency equipment, resources, plans or other that are required.', bold: true, color: WHITE, size: 14, font: 'Arial' })] })],
            })]},),
            new TableRow({ children: [new TableCell({
              width: { size: PAGE_W, type: WidthType.DXA },
              shading: { fill: WHITE, type: ShadingType.CLEAR },
              borders: allBorders(),
              margins: { top: 200, bottom: 200, left: 120, right: 120 },
              children: [new Paragraph({ children: [new TextRun({ text: '', size: 16, font: 'Arial' })] })],
            })]},),
          ],
        }),
        spacer(80),

        // â”€â”€ PAGE BREAK before activities â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        new Paragraph({ children: [new PageBreak()] }),

        // â”€â”€ ACTIVITIES TABLE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        // Columns: Item# | Job Step | Hazards | Risks | Initial L | Initial C | Initial R | Controls | Res L | Res C | Res R | Responsible
        new Table({
          width: { size: PAGE_W, type: WidthType.DXA },
          columnWidths: [500, 1800, 1600, 1400, 400, 400, 400, 3500, 400, 400, 400, 1258],
          rows: [
            // Main header
            new TableRow({
              tableHeader: true,
              children: [
                hdrCell('ITEM #', 500),
                hdrCell('JOB STEP', 1800),
                hdrCell('HAZARDS', 1600),
                hdrCell('RISKS', 1400),
                // Initial risk score - merged header
                new TableCell({
                  columnSpan: 3,
                  width: { size: 1200, type: WidthType.DXA },
                  shading: { fill: TEAL, type: ShadingType.CLEAR },
                  borders: allBorders(TEAL),
                  margins: { top: 60, bottom: 60, left: 60, right: 60 },
                  verticalAlign: VerticalAlign.CENTER,
                  children: [new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [new TextRun({ text: 'INITIAL RISK SCORE', bold: true, color: WHITE, size: 14, font: 'Arial' })],
                  })],
                }),
                hdrCell('CONTROL MEASURES', 3500),
                // Residual risk score - merged header
                new TableCell({
                  columnSpan: 3,
                  width: { size: 1200, type: WidthType.DXA },
                  shading: { fill: TEAL, type: ShadingType.CLEAR },
                  borders: allBorders(TEAL),
                  margins: { top: 60, bottom: 60, left: 60, right: 60 },
                  verticalAlign: VerticalAlign.CENTER,
                  children: [new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [new TextRun({ text: 'RESIDUAL RISK SCORE', bold: true, color: WHITE, size: 14, font: 'Arial' })],
                  })],
                }),
                hdrCell('RESPONSIBLE PERSON', 1258),
              ],
            }),
            // Sub-header for L C R
            new TableRow({
              tableHeader: true,
              children: [
                new TableCell({ width: { size: 500, type: WidthType.DXA }, shading: { fill: TEAL, type: ShadingType.CLEAR }, borders: allBorders(TEAL), children: [new Paragraph({ children: [] })] }),
                new TableCell({ width: { size: 1800, type: WidthType.DXA }, shading: { fill: TEAL, type: ShadingType.CLEAR }, borders: allBorders(TEAL), children: [new Paragraph({ children: [] })] }),
                new TableCell({ width: { size: 1600, type: WidthType.DXA }, shading: { fill: TEAL, type: ShadingType.CLEAR }, borders: allBorders(TEAL), children: [new Paragraph({ children: [] })] }),
                new TableCell({ width: { size: 1400, type: WidthType.DXA }, shading: { fill: TEAL, type: ShadingType.CLEAR }, borders: allBorders(TEAL), children: [new Paragraph({ children: [] })] }),
                ...[['L', 400], ['C', 400], ['R', 400], ['', 3500], ['L', 400], ['C', 400], ['R', 400], ['', 1258]].map(([t, w]) =>
                  new TableCell({
                    width: { size: Number(w), type: WidthType.DXA },
                    shading: { fill: TEAL_LIGHT, type: ShadingType.CLEAR },
                    borders: allBorders(TEAL),
                    margins: { top: 40, bottom: 40, left: 60, right: 60 },
                    children: [new Paragraph({
                      alignment: AlignmentType.CENTER,
                      children: [new TextRun({ text: String(t), bold: true, color: DARK_BLUE, size: 14, font: 'Arial' })],
                    })],
                  })
                ),
              ],
            }),

            // Activity rows
            ...acts.map((act, idx) => {
              const hazards = Array.isArray(act.hazards) ? act.hazards : []
              const controls = Array.isArray(act.control_measures) ? act.control_measures : []
              const shade = idx % 2 === 1

              const hazardText = hazards.map((h: { description?: string } | string) =>
                typeof h === 'string' ? h : h?.description || ''
              ).join('\n')

              // Map rating to LÃ—C=R
              const ratingToL: Record<string, number> = { low: 1, medium: 2, high: 3, critical: 4 }
              const ratingToC: Record<string, number> = { low: 2, medium: 3, high: 4, critical: 5 }
              const iL = ratingToL[act.initial_risk_rating] ?? 2
              const iC = ratingToC[act.initial_risk_rating] ?? 3
              const iR = iL * iC
              const rL = ratingToL[act.residual_risk_rating] ?? 1
              const rC = ratingToC[act.residual_risk_rating] ?? 2
              const rR = rL * rC

              const iFill = riskFill(iR)
              const rFill = riskFill(rR)
              const iColor = riskColor(iR)
              const rColor = riskColor(rR)

              return new TableRow({
                children: [
                  dataCell(act.step_number || String(idx + 1), 500, { shade, center: true, bold: true }),
                  dataCell(act.activity_description || '', 1800, { shade }),
                  // Hazards cell â€” each on its own line
                  new TableCell({
                    width: { size: 1600, type: WidthType.DXA },
                    shading: { fill: shade ? MID_GREY : WHITE, type: ShadingType.CLEAR },
                    borders: allBorders(),
                    margins: { top: 60, bottom: 60, left: 100, right: 100 },
                    children: hazards.length > 0
                      ? hazards.map((h: { description?: string } | string) => new Paragraph({
                          numbering: { reference: 'bullets', level: 0 },
                          children: [new TextRun({ text: typeof h === 'string' ? h : h?.description || '', size: 14, font: 'Arial' })],
                        }))
                      : [new Paragraph({ children: [new TextRun({ text: 'â€”', size: 14, font: 'Arial' })] })],
                  }),
                  // Risks (derived from hazards)
                  dataCell(act.activity_description ? `Injury or harm if exposed to identified hazards` : 'â€”', 1400, { shade, fontSize: 14 }),
                  // Initial L C R
                  new TableCell({ width: { size: 400, type: WidthType.DXA }, shading: { fill: iFill, type: ShadingType.CLEAR }, borders: allBorders(), margins: { top: 60, bottom: 60, left: 60, right: 60 }, verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(iL), bold: true, size: 16, font: 'Arial', color: iColor })] })] }),
                  new TableCell({ width: { size: 400, type: WidthType.DXA }, shading: { fill: iFill, type: ShadingType.CLEAR }, borders: allBorders(), margins: { top: 60, bottom: 60, left: 60, right: 60 }, verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(iC), bold: true, size: 16, font: 'Arial', color: iColor })] })] }),
                  new TableCell({ width: { size: 400, type: WidthType.DXA }, shading: { fill: iFill, type: ShadingType.CLEAR }, borders: allBorders(), margins: { top: 60, bottom: 60, left: 60, right: 60 }, verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(iR), bold: true, size: 18, font: 'Arial', color: iColor })] })] }),
                  // Controls
                  new TableCell({
                    width: { size: 3500, type: WidthType.DXA },
                    shading: { fill: shade ? MID_GREY : WHITE, type: ShadingType.CLEAR },
                    borders: allBorders(),
                    margins: { top: 60, bottom: 60, left: 100, right: 100 },
                    children: controls.length > 0
                      ? controls.map((c: string) => new Paragraph({
                          numbering: { reference: 'bullets', level: 0 },
                          children: [new TextRun({ text: c, size: 14, font: 'Arial' })],
                        }))
                      : [new Paragraph({ children: [new TextRun({ text: 'â€”', size: 14, font: 'Arial' })] })],
                  }),
                  // Residual L C R
                  new TableCell({ width: { size: 400, type: WidthType.DXA }, shading: { fill: rFill, type: ShadingType.CLEAR }, borders: allBorders(), margins: { top: 60, bottom: 60, left: 60, right: 60 }, verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(rL), bold: true, size: 16, font: 'Arial', color: rColor })] })] }),
                  new TableCell({ width: { size: 400, type: WidthType.DXA }, shading: { fill: rFill, type: ShadingType.CLEAR }, borders: allBorders(), margins: { top: 60, bottom: 60, left: 60, right: 60 }, verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(rC), bold: true, size: 16, font: 'Arial', color: rColor })] })] }),
                  new TableCell({ width: { size: 400, type: WidthType.DXA }, shading: { fill: rFill, type: ShadingType.CLEAR }, borders: allBorders(), margins: { top: 60, bottom: 60, left: 60, right: 60 }, verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(rR), bold: true, size: 18, font: 'Arial', color: rColor })] })] }),
                  dataCell(act.responsible_person || 'â€”', 1258, { shade, fontSize: 14 }),
                ],
              })
            }),
          ],
        }),

        spacer(160),

        // â”€â”€ PAGE BREAK before sign-off â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        new Paragraph({ children: [new PageBreak()] }),

        // â”€â”€ CONSULTATION AND SIGN-OFF â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        new Table({
          width: { size: PAGE_W, type: WidthType.DXA },
          columnWidths: [PAGE_W],
          rows: [
            new TableRow({ children: [new TableCell({
              width: { size: PAGE_W, type: WidthType.DXA },
              shading: { fill: TEAL, type: ShadingType.CLEAR },
              borders: allBorders(TEAL),
              margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [new Paragraph({ children: [new TextRun({ text: 'CONSULTATION AND SIGN-OFF RECORD', bold: true, color: WHITE, size: 20, font: 'Arial' })] })],
            })]},),
            new TableRow({ children: [new TableCell({
              width: { size: PAGE_W, type: WidthType.DXA },
              shading: { fill: WHITE, type: ShadingType.CLEAR },
              borders: allBorders(),
              margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [new Paragraph({ children: [new TextRun({ text: 'My signature below confirms that I have participated in the development and briefing on the requirements of the attached SWMS. I have reviewed copies of Permits, SDS\'s and other attachments as applicable. My signature also indicates that I shall perform the work in the manner detailed.', size: 16, font: 'Arial' })] })],
            })]},),
          ],
        }),

        spacer(60),

        // Sign-off table header
        new Table({
          width: { size: PAGE_W, type: WidthType.DXA },
          columnWidths: [800, 800, 5000, 800, 5000, 1558],
          rows: [
            new TableRow({ children: [
              hdrCell('ACTIVITY:', 800),
              new TableCell({
                columnSpan: 2,
                width: { size: 5800, type: WidthType.DXA },
                shading: { fill: WHITE, type: ShadingType.CLEAR },
                borders: allBorders(),
                margins: { top: 60, bottom: 60, left: 100, right: 100 },
                children: [new Paragraph({ children: [new TextRun({ text: swms.title || '', size: 16, font: 'Arial' })] })],
              }),
              hdrCell('SWMS NO:', 800),
              dataCell(swms.swms_number || '', 5000),
              dataCell(`REV: ${swms.revision || '1.0'}`, 1558),
            ]}),
            new TableRow({ children: [
              hdrCell('NAME (PLEASE PRINT)', 800),
              new TableCell({
                columnSpan: 2,
                width: { size: 5800, type: WidthType.DXA },
                shading: { fill: MID_GREY, type: ShadingType.CLEAR },
                borders: allBorders(),
                margins: { top: 60, bottom: 60, left: 100, right: 100 },
                children: [new Paragraph({ children: [new TextRun({ text: 'SIGNATURE', bold: true, size: 16, font: 'Arial' })] })],
              }),
              new TableCell({
                columnSpan: 3,
                width: { size: 7358, type: WidthType.DXA },
                shading: { fill: MID_GREY, type: ShadingType.CLEAR },
                borders: allBorders(),
                margins: { top: 60, bottom: 60, left: 100, right: 100 },
                children: [new Paragraph({ children: [new TextRun({ text: 'DATE', bold: true, size: 16, font: 'Arial' })] })],
              }),
            ]}),
            // 20 blank sign-off rows
            ...Array.from({ length: 20 }, (_, i) => new TableRow({
              children: [
                dataCell('', 800, { shade: i % 2 === 1 }),
                new TableCell({
                  columnSpan: 2,
                  width: { size: 5800, type: WidthType.DXA },
                  shading: { fill: i % 2 === 1 ? MID_GREY : WHITE, type: ShadingType.CLEAR },
                  borders: allBorders(),
                  margins: { top: 60, bottom: 60, left: 100, right: 100 },
                  children: [new Paragraph({ children: [new TextRun({ text: '', size: 20, font: 'Arial' })] })],
                }),
                new TableCell({
                  columnSpan: 3,
                  width: { size: 7358, type: WidthType.DXA },
                  shading: { fill: i % 2 === 1 ? MID_GREY : WHITE, type: ShadingType.CLEAR },
                  borders: allBorders(),
                  margins: { top: 60, bottom: 60, left: 100, right: 100 },
                  children: [new Paragraph({ children: [new TextRun({ text: '', size: 20, font: 'Arial' })] })],
                }),
              ],
            })),
          ],
        }),

        spacer(160),

        // â”€â”€ PAGE BREAK before appendix â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        new Paragraph({ children: [new PageBreak()] }),

        // â”€â”€ HIERARCHY OF CONTROL â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        new Paragraph({
          spacing: { before: 0, after: 100 },
          children: [new TextRun({ text: 'HIERARCHY OF CONTROL (HOC)', bold: true, size: 26, color: TEAL, font: 'Arial' })],
        }),
        new Table({
          width: { size: PAGE_W, type: WidthType.DXA },
          columnWidths: [3000, PAGE_W - 3000],
          rows: [
            new TableRow({ children: [
              new TableCell({
                width: { size: 3000, type: WidthType.DXA },
                shading: { fill: TEAL, type: ShadingType.CLEAR },
                borders: allBorders(TEAL),
                margins: { top: 120, bottom: 120, left: 120, right: 120 },
                verticalAlign: VerticalAlign.CENTER,
                children: [
                  new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Most Preferred', bold: true, color: WHITE, size: 18, font: 'Arial' })] }),
                  new Paragraph({ spacing: { before: 40, after: 40 }, children: [] }),
                  new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Least Preferred', bold: true, color: WHITE, size: 18, font: 'Arial' })] }),
                ],
              }),
              new TableCell({
                width: { size: PAGE_W - 3000, type: WidthType.DXA },
                shading: { fill: WHITE, type: ShadingType.CLEAR },
                borders: allBorders(),
                margins: { top: 100, bottom: 100, left: 160, right: 160 },
                children: [
                  ...[
                    '1.  Eliminate any risk to health or safety associated with construction work.',
                    '2.  Substitute a new activity, procedure, plant, process or substance.',
                    '3.  Isolate persons from the hazard, such as barricading, fencing or guard railing.',
                    '4.  Use engineering controls, such as mechanical or electrical devices.',
                    '5.  Use administrative controls, such as changing the way the work is done.',
                    '6.  Provide appropriate personal protective equipment.',
                  ].map((t, i) => new Paragraph({
                    spacing: { before: 80, after: 80 },
                    children: [new TextRun({ text: t, size: 16, font: 'Arial', bold: i === 0 })],
                  })),
                ],
              }),
            ]}),
          ],
        }),

        spacer(120),

        // â”€â”€ LIKELIHOOD MATRIX â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        new Paragraph({
          spacing: { before: 0, after: 80 },
          children: [new TextRun({ text: 'LIKELIHOOD MATRIX', bold: true, size: 22, color: TEAL, font: 'Arial' })],
        }),
        new Paragraph({
          spacing: { before: 0, after: 80 },
          children: [new TextRun({ text: 'The various levels of probability of an event occurring. Consider how frequently the activity is conducted when assessing likelihood.', size: 14, font: 'Arial', italics: true })],
        }),
        new Table({
          width: { size: PAGE_W, type: WidthType.DXA },
          columnWidths: [1400, 1200, 2200, 2200, 2200, 2200, 2558],
          rows: [
            new TableRow({ children: [
              hdrCell('', 1400), hdrCell('', 1200),
              hdrCell('1', 2200), hdrCell('2', 2200), hdrCell('3', 2200), hdrCell('4', 2200), hdrCell('5', 2558),
            ]}),
            new TableRow({ children: [
              labelCell('Ranking', 1400), labelCell('Rating', 1200),
              ...['1 - Rare','2 - Unlikely','3 - Possible','4 - Likely','5 - Almost Certain'].map((l, i) =>
                new TableCell({ width: { size: i === 4 ? 2558 : 2200, type: WidthType.DXA }, shading: { fill: MID_GREY, type: ShadingType.CLEAR }, borders: allBorders(), margins: { top: 60, bottom: 60, left: 80, right: 80 }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: l, bold: true, size: 14, font: 'Arial' })] })] })
              ),
            ]}),
            new TableRow({ children: [
              labelCell('Description', 1400),
              new TableCell({ width: { size: 1200, type: WidthType.DXA }, shading: { fill: WHITE, type: ShadingType.CLEAR }, borders: allBorders(), margins: { top: 60, bottom: 60, left: 80, right: 80 }, children: [new Paragraph({ children: [] })] }),
              ...['Little chance of occurring. Would require a combination of factors. Not known to have happened.',
                'Conceivable but not typically expected. Occurrence would require multiple failures of systems and controls.',
                'Could happen, easy to imagine a feasible scenario. An event has probably occurred in the past.',
                'Not a certainty but a good chance the situation could occur. Known to have occurred.',
                'Almost inevitable. The event is expected to occur in most circumstances. Has arisen several times.'].map((t, i) =>
                new TableCell({ width: { size: i === 4 ? 2558 : 2200, type: WidthType.DXA }, shading: { fill: WHITE, type: ShadingType.CLEAR }, borders: allBorders(), margins: { top: 60, bottom: 60, left: 80, right: 80 }, children: [new Paragraph({ children: [new TextRun({ text: t, size: 13, font: 'Arial' })] })] })
              ),
            ]}),
            new TableRow({ children: [
              labelCell('Probability', 1400),
              new TableCell({ width: { size: 1200, type: WidthType.DXA }, shading: { fill: WHITE, type: ShadingType.CLEAR }, borders: allBorders(), margins: { top: 60, bottom: 60, left: 80, right: 80 }, children: [new Paragraph({ children: [] })] }),
              ...['<= 10%','> 10-25%','> 25-50%','> 50-75%','> 75%'].map((t, i) =>
                new TableCell({ width: { size: i === 4 ? 2558 : 2200, type: WidthType.DXA }, shading: { fill: MID_GREY, type: ShadingType.CLEAR }, borders: allBorders(), margins: { top: 60, bottom: 60, left: 80, right: 80 }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: t, bold: true, size: 14, font: 'Arial' })] })] })
              ),
            ]}),
            new TableRow({ children: [
              labelCell('Frequency', 1400),
              new TableCell({ width: { size: 1200, type: WidthType.DXA }, shading: { fill: WHITE, type: ShadingType.CLEAR }, borders: allBorders(), margins: { top: 60, bottom: 60, left: 80, right: 80 }, children: [new Paragraph({ children: [] })] }),
              ...['Less than once in a period exceeding 10 years','At least once in a period of 5-10 years','At least once in a period of 1-5 years','At least once in a period of weeks to a year','At least once in a period of days to weeks'].map((t, i) =>
                new TableCell({ width: { size: i === 4 ? 2558 : 2200, type: WidthType.DXA }, shading: { fill: WHITE, type: ShadingType.CLEAR }, borders: allBorders(), margins: { top: 60, bottom: 60, left: 80, right: 80 }, children: [new Paragraph({ children: [new TextRun({ text: t, size: 13, font: 'Arial' })] })] })
              ),
            ]}),
          ],
        }),

        spacer(120),

        // â”€â”€ CONSEQUENCE MATRIX â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        new Paragraph({
          spacing: { before: 0, after: 80 },
          children: [new TextRun({ text: 'CONSEQUENCE MATRIX', bold: true, size: 22, color: TEAL, font: 'Arial' })],
        }),
        new Paragraph({
          spacing: { before: 0, after: 80 },
          children: [new TextRun({ text: 'Details the potential consequences after being exposed to a hazard. Rating selected should be a reasonable outcome of the hazard selected (not rated too high and not too low).', size: 14, font: 'Arial', italics: true })],
        }),
        new Table({
          width: { size: PAGE_W, type: WidthType.DXA },
          columnWidths: [1600, 1200, 2200, 2200, 2200, 2200, 2358],
          rows: [
            new TableRow({ children: [
              hdrCell('Ranking', 1600), hdrCell('Base Category', 1200),
              hdrCell('1 - Insignificant', 2200), hdrCell('2 - Low', 2200),
              hdrCell('3 - Moderate', 2200), hdrCell('4 - High', 2200), hdrCell('5 - Extreme', 2358),
            ]}),
            new TableRow({ children: [
              labelCell('Health & Safety', 1600),
              new TableCell({ width: { size: 1200, type: WidthType.DXA }, shading: { fill: WHITE, type: ShadingType.CLEAR }, borders: allBorders(), margins: { top: 60, bottom: 60, left: 80, right: 80 }, children: [new Paragraph({ children: [] })] }),
              new TableCell({ width: { size: 2200, type: WidthType.DXA }, shading: { fill: '90EE90', type: ShadingType.CLEAR }, borders: allBorders(), margins: { top: 60, bottom: 60, left: 80, right: 80 }, children: [new Paragraph({ children: [new TextRun({ text: 'Recoverable injury or irritant requiring first aid only, no LTI', size: 13, font: 'Arial' })] })] }),
              new TableCell({ width: { size: 2200, type: WidthType.DXA }, shading: { fill: '90EE90', type: ShadingType.CLEAR }, borders: allBorders(), margins: { top: 60, bottom: 60, left: 80, right: 80 }, children: [new Paragraph({ children: [new TextRun({ text: 'Recoverable injury or irritant requiring medical treatment only, no LTI', size: 13, font: 'Arial' })] })] }),
              new TableCell({ width: { size: 2200, type: WidthType.DXA }, shading: { fill: 'FFD700', type: ShadingType.CLEAR }, borders: allBorders(), margins: { top: 60, bottom: 60, left: 80, right: 80 }, children: [new Paragraph({ children: [new TextRun({ text: 'Recoverable injury requiring medical treatment only, LTI < 1 month', size: 13, font: 'Arial' })] })] }),
              new TableCell({ width: { size: 2200, type: WidthType.DXA }, shading: { fill: 'FFA07A', type: ShadingType.CLEAR }, borders: allBorders(), margins: { top: 60, bottom: 60, left: 80, right: 80 }, children: [new Paragraph({ children: [new TextRun({ text: 'Injury or permanent disability requiring longer term (> 1 month) hospitalisation and specialist treatment', size: 13, font: 'Arial' })] })] }),
              new TableCell({ width: { size: 2358, type: WidthType.DXA }, shading: { fill: 'FF6B6B', type: ShadingType.CLEAR }, borders: allBorders(), margins: { top: 60, bottom: 60, left: 80, right: 80 }, children: [new Paragraph({ children: [new TextRun({ text: 'Fatality or multiple disability injuries requiring permanent hospitalisation and specialist treatment', size: 13, font: 'Arial', color: WHITE })] })] }),
            ]}),
            new TableRow({ children: [
              labelCell('Environment (Incl. ISCA)', 1600),
              new TableCell({ width: { size: 1200, type: WidthType.DXA }, shading: { fill: MID_GREY, type: ShadingType.CLEAR }, borders: allBorders(), margins: { top: 60, bottom: 60, left: 80, right: 80 }, children: [new Paragraph({ children: [] })] }),
              new TableCell({ width: { size: 2200, type: WidthType.DXA }, shading: { fill: '90EE90', type: ShadingType.CLEAR }, borders: allBorders(), margins: { top: 60, bottom: 60, left: 80, right: 80 }, children: [new Paragraph({ children: [new TextRun({ text: 'Insignificant environmental damage contained on site, simple clean up by site team', size: 13, font: 'Arial' })] })] }),
              new TableCell({ width: { size: 2200, type: WidthType.DXA }, shading: { fill: '90EE90', type: ShadingType.CLEAR }, borders: allBorders(), margins: { top: 60, bottom: 60, left: 80, right: 80 }, children: [new Paragraph({ children: [new TextRun({ text: 'Minor environmental impact onsite or extending beyond site, clean up by site team or non-specialist suppliers', size: 13, font: 'Arial' })] })] }),
              new TableCell({ width: { size: 2200, type: WidthType.DXA }, shading: { fill: 'FFD700', type: ShadingType.CLEAR }, borders: allBorders(), margins: { top: 60, bottom: 60, left: 80, right: 80 }, children: [new Paragraph({ children: [new TextRun({ text: 'Moderate environmental impact onsite or extending beyond site. Specialist resources required, possible permanent damage', size: 13, font: 'Arial' })] })] }),
              new TableCell({ width: { size: 2200, type: WidthType.DXA }, shading: { fill: 'FFA07A', type: ShadingType.CLEAR }, borders: allBorders(), margins: { top: 60, bottom: 60, left: 80, right: 80 }, children: [new Paragraph({ children: [new TextRun({ text: 'High but reversible environmental damage, long term and specialist remediation required. Minor permanent damage to items of cultural, ecological or regional significance', size: 13, font: 'Arial' })] })] }),
              new TableCell({ width: { size: 2358, type: WidthType.DXA }, shading: { fill: 'FF6B6B', type: ShadingType.CLEAR }, borders: allBorders(), margins: { top: 60, bottom: 60, left: 80, right: 80 }, children: [new Paragraph({ children: [new TextRun({ text: 'Extreme irreparable environmental damage, long term or toxic release with detrimental long term effects. Significant permanent damage to items of cultural, ecological or national significance', size: 13, font: 'Arial', color: WHITE })] })] }),
            ]}),
          ],
        }),

        spacer(120),

        // â”€â”€ RISK MATRIX â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        new Paragraph({
          spacing: { before: 0, after: 80 },
          children: [new TextRun({ text: 'RISK MATRIX â€” Likelihood x Consequence = Risk Score', bold: true, size: 22, color: TEAL, font: 'Arial' })],
        }),
        new Table({
          width: { size: PAGE_W, type: WidthType.DXA },
          columnWidths: [1400, 1400, 2100, 2100, 2100, 2100, 2758],
          rows: [
            new TableRow({ children: [
              new TableCell({ width: { size: 1400, type: WidthType.DXA }, shading: { fill: TEAL, type: ShadingType.CLEAR }, borders: allBorders(TEAL), children: [new Paragraph({ children: [] })] }),
              new TableCell({ width: { size: 1400, type: WidthType.DXA }, shading: { fill: TEAL, type: ShadingType.CLEAR }, borders: allBorders(TEAL), children: [new Paragraph({ children: [] })] }),
              new TableCell({ columnSpan: 5, width: { size: 11058, type: WidthType.DXA }, shading: { fill: TEAL, type: ShadingType.CLEAR }, borders: allBorders(TEAL), margins: { top: 60, bottom: 60, left: 80, right: 80 }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Threat / Hazard (Consequence)', bold: true, color: WHITE, size: 16, font: 'Arial' })] })] }),
            ]}),
            new TableRow({ children: [
              hdrCell('', 1400), hdrCell('', 1400),
              hdrCell('Insignificant', 2100), hdrCell('Low', 2100), hdrCell('Moderate', 2100), hdrCell('High', 2100), hdrCell('Extreme', 2758),
            ]}),
            ...([
              { l: 5, label: '5\nAlmost Certain', scores: [8, 13, 20, 23, 25] },
              { l: 4, label: '4\nLikely',          scores: [6, 11, 17, 21, 24] },
              { l: 3, label: '3\nPossible',         scores: [4,  9, 14, 18, 22] },
              { l: 2, label: '2\nUnlikely',         scores: [2,  5, 10, 15, 19] },
              { l: 1, label: '1\nRare',             scores: [1,  3,  7, 12, 16] },
            ].map(({ l, label, scores }) => new TableRow({
              children: [
                ...(l === 5 ? [new TableCell({
                  rowSpan: 5,
                  width: { size: 1400, type: WidthType.DXA },
                  shading: { fill: TEAL, type: ShadingType.CLEAR },
                  borders: allBorders(TEAL),
                  margins: { top: 60, bottom: 60, left: 60, right: 60 },
                  verticalAlign: VerticalAlign.CENTER,
                  children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Likelihood (L)', bold: true, color: WHITE, size: 14, font: 'Arial' })] })],
                })] : []),
                new TableCell({
                  width: { size: 1400, type: WidthType.DXA },
                  shading: { fill: TEAL_LIGHT, type: ShadingType.CLEAR },
                  borders: allBorders(TEAL),
                  margins: { top: 60, bottom: 60, left: 60, right: 60 },
                  verticalAlign: VerticalAlign.CENTER,
                  children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: label, bold: true, size: 13, font: 'Arial', color: DARK_BLUE })] })],
                }),
                ...scores.map((score, colIdx) => {
                  const fill = score >= 20 ? 'FF6B6B' : score >= 17 ? 'FFA07A' : score >= 8 ? 'FFD700' : '90EE90'
                  const textColor = score >= 17 ? 'FFFFFF' : '000000'
                  return new TableCell({
                    width: { size: colIdx === 4 ? 2758 : 2100, type: WidthType.DXA },
                    shading: { fill, type: ShadingType.CLEAR },
                    borders: allBorders(),
                    margins: { top: 80, bottom: 80, left: 80, right: 80 },
                    verticalAlign: VerticalAlign.CENTER,
                    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(score), bold: true, size: 24, font: 'Arial', color: textColor })] })],
                  })
                }),
              ],
            }))),
          ],
        }),

        spacer(80),

        new Table({
          width: { size: PAGE_W, type: WidthType.DXA },
          columnWidths: [600, 2000, 600, 2100, 600, 2100, 600, 5752],
          rows: [new TableRow({ children: [
            new TableCell({ width: { size: 600, type: WidthType.DXA }, shading: { fill: '90EE90', type: ShadingType.CLEAR }, borders: allBorders(), margins: { top: 60, bottom: 60, left: 60, right: 60 }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '1-7', bold: true, size: 14, font: 'Arial' })] })] }),
            new TableCell({ width: { size: 2000, type: WidthType.DXA }, shading: { fill: MID_GREY, type: ShadingType.CLEAR }, borders: allBorders(), margins: { top: 60, bottom: 60, left: 60, right: 60 }, children: [new Paragraph({ children: [new TextRun({ text: 'LOW', bold: true, size: 13, font: 'Arial' })] })] }),
            new TableCell({ width: { size: 600, type: WidthType.DXA }, shading: { fill: 'FFD700', type: ShadingType.CLEAR }, borders: allBorders(), margins: { top: 60, bottom: 60, left: 60, right: 60 }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '8-16', bold: true, size: 14, font: 'Arial' })] })] }),
            new TableCell({ width: { size: 2100, type: WidthType.DXA }, shading: { fill: MID_GREY, type: ShadingType.CLEAR }, borders: allBorders(), margins: { top: 60, bottom: 60, left: 60, right: 60 }, children: [new Paragraph({ children: [new TextRun({ text: 'MEDIUM / HIGH', bold: true, size: 13, font: 'Arial' })] })] }),
            new TableCell({ width: { size: 600, type: WidthType.DXA }, shading: { fill: 'FFA07A', type: ShadingType.CLEAR }, borders: allBorders(), margins: { top: 60, bottom: 60, left: 60, right: 60 }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '17-19', bold: true, size: 14, font: 'Arial' })] })] }),
            new TableCell({ width: { size: 2100, type: WidthType.DXA }, shading: { fill: MID_GREY, type: ShadingType.CLEAR }, borders: allBorders(), margins: { top: 60, bottom: 60, left: 60, right: 60 }, children: [new Paragraph({ children: [new TextRun({ text: 'HIGH', bold: true, size: 13, font: 'Arial' })] })] }),
            new TableCell({ width: { size: 600, type: WidthType.DXA }, shading: { fill: 'FF6B6B', type: ShadingType.CLEAR }, borders: allBorders(), margins: { top: 60, bottom: 60, left: 60, right: 60 }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '20-25', bold: true, size: 14, font: 'Arial', color: WHITE })] })] }),
            new TableCell({ width: { size: 5752, type: WidthType.DXA }, shading: { fill: MID_GREY, type: ShadingType.CLEAR }, borders: allBorders(), margins: { top: 60, bottom: 60, left: 60, right: 60 }, children: [new Paragraph({ children: [new TextRun({ text: 'EXTREME - Work Cannot Proceed', bold: true, size: 13, font: 'Arial' })] })] }),
          ]})]
        }),

        spacer(120),

        // â”€â”€ RESPONSE MATRIX â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        new Paragraph({
          spacing: { before: 0, after: 80 },
          children: [new TextRun({ text: 'RISK RESPONSE - THREATS/HAZARDS', bold: true, size: 22, color: TEAL, font: 'Arial' })],
        }),
        new Table({
          width: { size: PAGE_W, type: WidthType.DXA },
          columnWidths: [580, 900, 1800, 580, 900, 1800, 1200, 900, 900, 900, 900, 900, 2598],
          rows: [
            new TableRow({ children: [
              new TableCell({ columnSpan: 3, width: { size: 3280, type: WidthType.DXA }, shading: { fill: TEAL, type: ShadingType.CLEAR }, borders: allBorders(TEAL), margins: { top: 60, bottom: 60, left: 80, right: 80 }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Inherent Rating', bold: true, color: WHITE, size: 15, font: 'Arial' })] })] }),
              new TableCell({ columnSpan: 3, width: { size: 3280, type: WidthType.DXA }, shading: { fill: TEAL, type: ShadingType.CLEAR }, borders: allBorders(TEAL), margins: { top: 60, bottom: 60, left: 80, right: 80 }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Residual Rating', bold: true, color: WHITE, size: 15, font: 'Arial' })] })] }),
              new TableCell({ columnSpan: 7, width: { size: 8398, type: WidthType.DXA }, shading: { fill: TEAL, type: ShadingType.CLEAR }, borders: allBorders(TEAL), margins: { top: 60, bottom: 60, left: 80, right: 80 }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Approval Level Required', bold: true, color: WHITE, size: 15, font: 'Arial' })] })] }),
            ]}),
            new TableRow({ children: [
              hdrCell('Score', 580), hdrCell('Rating', 900), hdrCell('Min Risk Response', 1800),
              hdrCell('Score', 580), hdrCell('Rating', 900), hdrCell('Actions Required', 1800),
              hdrCell('Health & Safety', 1200), hdrCell('Quality', 900), hdrCell('Reputation', 900), hdrCell('Legal / Reg', 900), hdrCell('Environmental', 900), hdrCell('Cost', 900), hdrCell('Programme', 2598),
            ]}),
            ...([
              ['23-25','Extreme','FF6B6B',WHITE,'Task/activity cannot proceed. Eliminate hazards or implement controls.','23-25','Extreme','Task/activity cannot proceed at this rating.','Work cannot proceed','Work cannot proceed','Work cannot proceed','Work cannot proceed','Work cannot proceed','Project Director','Project Director'],
              ['20-22','Very High','FF8C69',WHITE,'Action and exceptional approval required. Manage using multiple specific controls. Risk requires action plan with clear individual responsibilities. Only approved on exceptional occasions.','20-22','Very High','Action and exceptional approval required before work can proceed.','Project Director and Contracts Manager','Project Director and key relationships manager','Project Director and key relationships manager','Project Director and Contracts Manager','Project Director and Environmental manager','Project Director','Project Director'],
              ['17-19','High','FFA07A','000000','Action and approval required. Manage preferably using multiple controls. Risk requires action plan with clear assignment of responsibilities and time frames.','17-19','High','Actions and approval required before work can proceed.','Project Director or Construction Manager','Construction Manager and key relationships manager','Project Director or Construction Manager','Construction Manager','Construction Manager and Environmental manager','Project Director','Project Director'],
              ['8-16','Medium','FFD700','000000','Action and approval required. Manage using specific identified controls. Risk requires ongoing monitoring and review.','8-16','Medium','Action and approval required before work can proceed.','Superintendent and Sr Project Engineer','Project Engineer','Project Engineer and Key relationships manager','Project Engineer and Contracts manager','Project Engineer and Environmental Manager','Project Director','Project Director'],
              ['1-7','Low','90EE90','000000','Approval required. Manage using controls appropriate for low level risk/hazard.','1-7','Low','Approval required before work can proceed.','Supervisor and Site Engineer in charge of work area','Supervisor and Site Engineer in charge of work area','Supervisor and Site Engineer in charge of work area','Supervisor and Site Engineer of work area','Supervisor and Site Engineer in charge of work area','Project Director or Construction and Commercial Manager','Project Director or Construction and Commercial Manager'],
            ].map((r, idx) => new TableRow({ children: [
              new TableCell({ width: { size: 580, type: WidthType.DXA }, shading: { fill: r[2] as string, type: ShadingType.CLEAR }, borders: allBorders(), margins: { top: 60, bottom: 60, left: 60, right: 60 }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: r[0] as string, bold: true, size: 13, font: 'Arial', color: r[3] as string })] })] }),
              new TableCell({ width: { size: 900, type: WidthType.DXA }, shading: { fill: r[2] as string, type: ShadingType.CLEAR }, borders: allBorders(), margins: { top: 60, bottom: 60, left: 60, right: 60 }, children: [new Paragraph({ children: [new TextRun({ text: r[1] as string, bold: true, size: 13, font: 'Arial', color: r[3] as string })] })] }),
              dataCell(r[4] as string, 1800, { shade: idx % 2 === 1, fontSize: 12 }),
              new TableCell({ width: { size: 580, type: WidthType.DXA }, shading: { fill: r[2] as string, type: ShadingType.CLEAR }, borders: allBorders(), margins: { top: 60, bottom: 60, left: 60, right: 60 }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: r[5] as string, bold: true, size: 13, font: 'Arial', color: r[3] as string })] })] }),
              new TableCell({ width: { size: 900, type: WidthType.DXA }, shading: { fill: r[2] as string, type: ShadingType.CLEAR }, borders: allBorders(), margins: { top: 60, bottom: 60, left: 60, right: 60 }, children: [new Paragraph({ children: [new TextRun({ text: r[6] as string, bold: true, size: 13, font: 'Arial', color: r[3] as string })] })] }),
              dataCell(r[7] as string, 1800, { shade: idx % 2 === 1, fontSize: 12 }),
              dataCell(r[8] as string, 1200, { shade: idx % 2 === 1, fontSize: 11 }),
              dataCell(r[9] as string, 900, { shade: idx % 2 === 1, fontSize: 11 }),
              dataCell(r[10] as string, 900, { shade: idx % 2 === 1, fontSize: 11 }),
              dataCell(r[11] as string, 900, { shade: idx % 2 === 1, fontSize: 11 }),
              dataCell(r[12] as string, 900, { shade: idx % 2 === 1, fontSize: 11 }),
              dataCell(r[13] as string, 900, { shade: idx % 2 === 1, fontSize: 11 }),
              dataCell(r[14] as string, 2598, { shade: idx % 2 === 1, fontSize: 11 }),
            ]}))),
          ],
        }),

        spacer(160),

        // â”€â”€ FOOTER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({
            text: `DOCUMENT UNCONTROLLED WHEN PRINTED  Â·  ${swms.swms_number}  Â·  Rev ${swms.revision}  Â·  Generated ${formattedDate}`,
            size: 14, color: '888888', font: 'Arial',
          })],
        }),
      ],
    }],
  })

  const buffer = await Packer.toBuffer(doc)
  const filename = `${swms.swms_number}_Rev${swms.revision}.docx`

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length.toString(),
    },
  })
}