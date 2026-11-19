import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle } from 'docx'
import { requireRecordProjectAccess, authErrorResponse } from '@/lib/auth/apiAuth'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest, { params }: { params: { swmsId: string } }) {
  const auth = await requireRecordProjectAccess('swms', 'id', params.swmsId)
  if (!auth.ok) return authErrorResponse(auth)

  const { data: swms, error } = await supabase.from('swms').select('*').eq('id', params.swmsId).single()

  if (error || !swms) {
    return NextResponse.json({ error: 'SWMS not found' }, { status: 404 })
  }

  const borders = {
    top: { style: BorderStyle.SINGLE, size: 2, color: '999999' },
    bottom: { style: BorderStyle.SINGLE, size: 2, color: '999999' },
    left: { style: BorderStyle.SINGLE, size: 2, color: '999999' },
    right: { style: BorderStyle.SINGLE, size: 2, color: '999999' },
  }

  function headerCell(text: string, width: number) {
    return new TableCell({
      width: { size: width, type: WidthType.PERCENTAGE },
      borders,
      shading: { fill: '163300' },
      children: [new Paragraph({ children: [new TextRun({ text, bold: true, color: 'FFFFFF', size: 18 })] })],
    })
  }

  function blankCell(width: number) {
    return new TableCell({
      width: { size: width, type: WidthType.PERCENTAGE },
      borders,
      children: [new Paragraph({ text: '' })],
    })
  }

  const headerRow = new TableRow({
    children: [
      headerCell('Name (Printed)', 20),
      headerCell('Company', 18),
      headerCell('Role / Trade', 16),
      headerCell('I have read, understood, and agree to comply with this SWMS', 26),
      headerCell('Signature', 12),
      headerCell('Date', 8),
    ],
  })

  const blankRows = Array.from({ length: 20 }).map(() =>
    new TableRow({
      children: [blankCell(20), blankCell(18), blankCell(16), blankCell(26), blankCell(12), blankCell(8)],
    })
  )

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            children: [new TextRun({ text: 'SWMS Sign-On Sheet', bold: true, size: 32, color: '163300' })],
          }),
          new Paragraph({
            spacing: { after: 100 },
            children: [
              new TextRun({ text: `${swms.swms_number}  -  ${swms.title}`, bold: true, size: 24 }),
            ],
          }),
          new Paragraph({
            spacing: { after: 100 },
            children: [
              new TextRun({ text: `Revision ${swms.revision}   |   Work Location: ${swms.work_location || '-'}   |   Principal Contractor: ${swms.principal_contractor || '-'}`, size: 20, color: '52637A' }),
            ],
          }),
          new Paragraph({
            spacing: { after: 200 },
            children: [
              new TextRun({ text: 'Every person undertaking this work must sign below before starting work. If this SWMS is revised, all workers must re-sign against the new revision.', italics: true, size: 18, color: 'B3261E' }),
            ],
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [headerRow, ...blankRows],
          }),
        ],
      },
    ],
  })

  const buffer = await Packer.toBuffer(doc)

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${swms.swms_number}-signon-rev${swms.revision}.docx"`,
    },
  })
}
