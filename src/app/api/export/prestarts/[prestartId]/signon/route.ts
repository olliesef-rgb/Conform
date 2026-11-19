import { createClient } from '@supabase/supabase-js'
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, HeadingLevel, AlignmentType, WidthType } from 'docx'
import { NextRequest } from 'next/server'
import { requireRecordProjectAccess, authErrorResponse } from '@/lib/auth/apiAuth'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest, { params }: { params: { prestartId: string } }) {
  const prestartId = params.prestartId

  const auth = await requireRecordProjectAccess('prestarts', 'id', prestartId)
  if (!auth.ok) return authErrorResponse(auth)

  const { data: prestart, error: prestartError } = await supabase
    .from('prestarts')
    .select('*, projects(name)')
    .eq('id', prestartId)
    .single()

  if (prestartError || !prestart) {
    return new Response('Pre-start not found', { status: 404 })
  }

  const { data: signons } = await supabase
    .from('prestart_signons')
    .select('name, company, signed_at')
    .eq('prestart_id', prestartId)
    .order('signed_at', { ascending: true })

  const dateLabel = new Date(prestart.date).toLocaleDateString('en-NZ', {
    weekday: 'long', day: '2-digit', month: 'short', year: 'numeric',
  })

  const headerRow = new TableRow({
    children: [
      new TableCell({ width: { size: 35, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: 'Name', bold: true })] })] }),
      new TableCell({ width: { size: 20, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: 'Company', bold: true })] })] }),
      new TableCell({ width: { size: 25, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: 'Signature', bold: true })] })] }),
      new TableCell({ width: { size: 20, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: 'Time', bold: true })] })] }),
    ],
  })

  const signedRows = (signons ?? []).map(s => new TableRow({
    children: [
      new TableCell({ children: [new Paragraph(s.name)] }),
      new TableCell({ children: [new Paragraph(s.company || '')] }),
      new TableCell({ children: [new Paragraph('(signed online)')] }),
      new TableCell({ children: [new Paragraph(new Date(s.signed_at).toLocaleTimeString('en-NZ'))] }),
    ],
  }))

  const blankRowCount = 15
  const blankRows = Array.from({ length: blankRowCount }).map(() => new TableRow({
    children: [
      new TableCell({ children: [new Paragraph('')] }),
      new TableCell({ children: [new Paragraph('')] }),
      new TableCell({ children: [new Paragraph('')] }),
      new TableCell({ children: [new Paragraph('')] }),
    ],
  }))

  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({ text: 'Pre-Start Sign-On Sheet', heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER }),
        new Paragraph({ text: (prestart.projects as any)?.name || '', alignment: AlignmentType.CENTER, spacing: { after: 100 } }),
        new Paragraph({ text: dateLabel, alignment: AlignmentType.CENTER, spacing: { after: 300 } }),
        new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [headerRow, ...signedRows, ...blankRows] }),
      ],
    }],
  })

  const buffer = await Packer.toBuffer(doc)

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': 'attachment; filename="prestart-signon-' + prestart.date + '.docx"',
    },
  })
}
