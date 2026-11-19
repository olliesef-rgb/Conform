import { NextRequest, NextResponse } from 'next/server'
import { requireProjectOrg, authErrorResponse } from '@/lib/auth/apiAuth'

const { createClient } = require('@supabase/supabase-js')
const ExcelJS = require('exceljs')

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function typeLabel(isSub: boolean | null): string {
  return isSub === null ? '' : isSub ? 'Subcontractor' : 'Internal'
}

function addSheet(workbook: any, name: string, headers: string[], rows: any[][]) {
  const sheet = workbook.addWorksheet(name)
  sheet.addRow(headers)
  sheet.getRow(1).font = { bold: true }
  rows.forEach(r => sheet.addRow(r))
  sheet.columns.forEach((col: any) => { col.width = 18 })
}

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const projectId = params.id

  const auth = await requireProjectOrg(projectId)
  if (!auth.ok) return authErrorResponse(auth)

  const supabase = createServiceClient()

  const [{ data: labour }, { data: plant }, { data: materials }] = await Promise.all([
    supabase.from('daily_labour').select('person_name, company, is_subcontractor, role, hours, rate, daily_allocations!inner(project_id, date)').eq('daily_allocations.project_id', projectId),
    supabase.from('daily_plant').select('description, company, is_subcontractor, hours, rate, daily_allocations!inner(project_id, date)').eq('daily_allocations.project_id', projectId),
    supabase.from('daily_materials').select('material_name, unit, quantity, rate, daily_allocations!inner(project_id, date)').eq('daily_allocations.project_id', projectId),
  ])

  const workbook = new ExcelJS.Workbook()

  const labourRows = (labour ?? [])
    .sort((a: any, b: any) => (a.daily_allocations?.date ?? '').localeCompare(b.daily_allocations?.date ?? ''))
    .map((r: any) => [
      r.daily_allocations?.date ?? '',
      r.person_name,
      r.company ?? '',
      typeLabel(r.is_subcontractor),
      r.role ?? '',
      r.hours ?? '',
      r.rate ?? '',
      r.hours != null && r.rate != null ? r.hours * r.rate : '',
    ])
  addSheet(workbook, 'Labour', ['Date', 'Name', 'Company', 'Type', 'Role', 'Hours', 'Rate', 'Cost'], labourRows)

  const plantRows = (plant ?? [])
    .sort((a: any, b: any) => (a.daily_allocations?.date ?? '').localeCompare(b.daily_allocations?.date ?? ''))
    .map((r: any) => [
      r.daily_allocations?.date ?? '',
      r.description,
      r.company ?? '',
      typeLabel(r.is_subcontractor),
      r.hours ?? '',
      r.rate ?? '',
      r.hours != null && r.rate != null ? r.hours * r.rate : '',
    ])
  addSheet(workbook, 'Plant', ['Date', 'Description', 'Company', 'Type', 'Hours', 'Rate', 'Cost'], plantRows)

  const materialRows = (materials ?? [])
    .sort((a: any, b: any) => (a.daily_allocations?.date ?? '').localeCompare(b.daily_allocations?.date ?? ''))
    .map((r: any) => [
      r.daily_allocations?.date ?? '',
      r.material_name,
      r.unit ?? '',
      r.quantity ?? '',
      r.rate ?? '',
      r.quantity != null && r.rate != null ? r.quantity * r.rate : '',
    ])
  addSheet(workbook, 'Materials', ['Date', 'Material', 'Unit', 'Quantity', 'Rate', 'Cost'], materialRows)

  const buffer = await workbook.xlsx.writeBuffer()

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="resourcing-export.xlsx"',
      'Cache-Control': 'no-store',
    },
  })
}
