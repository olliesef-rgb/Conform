import { NextRequest, NextResponse } from 'next/server'
import { requireProjectOrg, authErrorResponse } from '@/lib/auth/apiAuth'

const { createClient } = require('@supabase/supabase-js')
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, WidthType,
} = require('docx')

export const dynamic = 'force-dynamic'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const STATUS_LABELS: Record<string, string> = { open: 'Open', pending_response: 'Pending Response', closed: 'Closed' }

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('en-NZ', { day: '2-digit', month: 'short', year: 'numeric' })
}

function addDaysLocal(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toLocaleDateString('en-CA')
}

function daysBetweenInclusive(from: string, to: string): number {
  const a = new Date(from + 'T00:00:00')
  const b = new Date(to + 'T00:00:00')
  return Math.round((b.getTime() - a.getTime()) / 86400000) + 1
}

function groupByRole(rows: any[]) {
  const map = new Map<string, { role: string; people: Set<string>; hours: number; cost: number }>()
  rows.forEach(r => {
    const role = r.role || '(no role / trade set)'
    if (!map.has(role)) map.set(role, { role, people: new Set(), hours: 0, cost: 0 })
    const e = map.get(role)!
    if (r.person_name) e.people.add(r.person_name.trim().toLowerCase())
    e.hours += r.hours ?? 0
    e.cost += r.cost ?? 0
  })
  return Array.from(map.values()).map(e => ({ role: e.role, people: e.people.size, hours: e.hours, cost: e.cost })).sort((a, b) => b.hours - a.hours)
}

function groupByPlantType(rows: any[]) {
  const map = new Map<string, { description: string; units: Set<string>; hours: number; cost: number }>()
  rows.forEach(r => {
    const desc = r.description || '(no description)'
    if (!map.has(desc)) map.set(desc, { description: desc, units: new Set(), hours: 0, cost: 0 })
    const e = map.get(desc)!
    if (r.unit_id && r.unit_id.trim()) e.units.add(r.unit_id.trim().toLowerCase())
    e.hours += r.hours ?? 0
    e.cost += r.cost ?? 0
  })
  return Array.from(map.values())
    .map(e => ({ description: e.description, units: e.units.size > 0 ? e.units.size : null, hours: e.hours, cost: e.cost }))
    .sort((a, b) => b.hours - a.hours)
}

function groupByCompany(labourRows: any[], plantRows: any[]) {
  const map = new Map<string, { company: string; hours: number; cost: number; types: Set<string>; people: Set<string>; units: Set<string> }>()
  labourRows.forEach(r => {
    if (!r.is_subcontractor || !r.company) return
    const company = r.company.trim()
    if (!map.has(company)) map.set(company, { company, hours: 0, cost: 0, types: new Set(), people: new Set(), units: new Set() })
    const e = map.get(company)!
    e.hours += r.hours ?? 0
    e.cost += r.cost ?? 0
    e.types.add(r.role || 'Labour')
    if (r.person_name) e.people.add(r.person_name.trim().toLowerCase())
  })
  plantRows.forEach(r => {
    if (!r.is_subcontractor || !r.company) return
    const company = r.company.trim()
    if (!map.has(company)) map.set(company, { company, hours: 0, cost: 0, types: new Set(), people: new Set(), units: new Set() })
    const e = map.get(company)!
    e.hours += r.hours ?? 0
    e.cost += r.cost ?? 0
    e.types.add(r.description || 'Plant')
    if (r.unit_id && r.unit_id.trim()) e.units.add(r.unit_id.trim().toLowerCase())
  })
  return Array.from(map.values())
    .map(e => ({
      company: e.company,
      hours: e.hours,
      cost: e.cost,
      types: Array.from(e.types).join(', '),
      peopleCount: e.people.size > 0 ? e.people.size : null,
      unitsCount: e.units.size > 0 ? e.units.size : null,
    }))
    .sort((a, b) => b.hours - a.hours)
}

function peopleUnitsLabel(peopleCount: number | null, unitsCount: number | null): string {
  const parts: string[] = []
  if (peopleCount) parts.push(`${peopleCount} ${peopleCount === 1 ? 'person' : 'people'}`)
  if (unitsCount) parts.push(`${unitsCount} ${unitsCount === 1 ? 'unit' : 'units'}`)
  return parts.length > 0 ? parts.join(', ') : '-'
}

function heading(text: string) {
  return new Paragraph({ text, heading: HeadingLevel.HEADING_2, spacing: { before: 300, after: 150 } })
}
function subHeading(text: string) {
  return new Paragraph({ children: [new TextRun({ text, bold: true })], spacing: { before: 200, after: 100 } })
}
function statLine(text: string) {
  return new Paragraph({ children: [new TextRun({ text })], spacing: { after: 100 } })
}
function makeTable(headers: string[], rows: string[][]) {
  const headerRow = new TableRow({
    children: headers.map((h: string) => new TableCell({
      width: { size: Math.floor(100 / headers.length), type: WidthType.PERCENTAGE },
      children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })],
    })),
  })
  const bodyRows = rows.map((r: string[]) => new TableRow({
    children: r.map((cell: string) => new TableCell({
      width: { size: Math.floor(100 / headers.length), type: WidthType.PERCENTAGE },
      children: [new Paragraph(cell)],
    })),
  }))
  return new Table({ rows: [headerRow, ...bodyRows], width: { size: 100, type: WidthType.PERCENTAGE } })
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const projectId = params.id

  const auth = await requireProjectOrg(projectId)
  if (!auth.ok) return authErrorResponse(auth)

  const supabase = createServiceClient()
  const { searchParams } = new URL(req.url)

  const today = new Date().toLocaleDateString('en-CA')
  const dateFrom = searchParams.get('from') || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toLocaleDateString('en-CA')
  const dateTo = searchParams.get('to') || today
  const toExclusive = addDaysLocal(dateTo, 1)

  const { data: proj } = await supabase.from('projects').select('name').eq('id', projectId).single()
  const projectName = proj?.name ?? 'Project'

  const [
    { data: prestartData },
    { data: itpData },
    { data: swmsData },
    { data: obsData },
    { data: noticeData },
    { data: allocData },
  ] = await Promise.all([
    supabase.from('prestarts').select('id, date').eq('project_id', projectId).gte('date', dateFrom).lte('date', dateTo),
    supabase.from('itps').select('id, itp_number, title, status, created_at').eq('project_id', projectId).gte('created_at', dateFrom).lt('created_at', toExclusive),
    supabase.from('swms').select('id, swms_number, title, status, created_at').eq('project_id', projectId).gte('created_at', dateFrom).lt('created_at', toExclusive),
    supabase.from('safety_observations').select('id, observation_number, category, description, status, raised_at').eq('project_id', projectId).gte('raised_at', dateFrom).lt('raised_at', toExclusive),
    supabase.from('notices').select('id, type, notice_number, title, status, raised_at').eq('project_id', projectId).gte('raised_at', dateFrom).lt('raised_at', toExclusive),
    supabase.from('daily_allocations').select('id, date').eq('project_id', projectId).gte('date', dateFrom).lte('date', dateTo),
  ])

  const prestarts = prestartData ?? []
  const itps = itpData ?? []
  const swmsList = (swmsData ?? []).sort((a: any, b: any) => a.swms_number.localeCompare(b.swms_number))
  const observations = (obsData ?? []).sort((a: any, b: any) => (a.status === 'open' ? -1 : 1) - (b.status === 'open' ? -1 : 1))
  const notices = (noticeData ?? []).sort((a: any, b: any) => {
    const order: Record<string, number> = { open: 0, pending_response: 1, closed: 2 }
    return (order[a.status] ?? 9) - (order[b.status] ?? 9)
  })

  let itpComplete = 0, itpTotal = 0
  if (itps.length > 0) {
    const { data: activities } = await supabase.from('itp_activities').select('is_complete').in('itp_id', itps.map((i: any) => i.id))
    itpTotal = activities?.length ?? 0
    itpComplete = activities?.filter((a: any) => a.is_complete).length ?? 0
  }

  const allocationIds = (allocData ?? []).map((a: any) => a.id)
  let labourRaw: any[] = [], plantRaw: any[] = [], materialRaw: any[] = []
  if (allocationIds.length > 0) {
    const [{ data: labour }, { data: plant }, { data: materials }] = await Promise.all([
      supabase.from('daily_labour').select('person_name, company, is_subcontractor, role, hours, rate').in('allocation_id', allocationIds),
      supabase.from('daily_plant').select('description, unit_id, company, is_subcontractor, hours, rate').in('allocation_id', allocationIds),
      supabase.from('daily_materials').select('material_name, unit, quantity, rate').in('allocation_id', allocationIds),
    ])
    labourRaw = (labour ?? []).map((r: any) => ({ ...r, cost: (r.hours != null && r.rate != null) ? r.hours * r.rate : null }))
    plantRaw = (plant ?? []).map((r: any) => ({ ...r, cost: (r.hours != null && r.rate != null) ? r.hours * r.rate : null }))
    materialRaw = (materials ?? []).map((r: any) => ({ ...r, cost: (r.quantity != null && r.rate != null) ? r.quantity * r.rate : null }))
  }

  const daysInRange = daysBetweenInclusive(dateFrom, dateTo)
  const prestartDays = new Set(prestarts.map((p: any) => p.date)).size
  const itpCompletePct = itpTotal > 0 ? Math.round((itpComplete / itpTotal) * 100) : 0

  const noticeTypes = Array.from(new Set(notices.map((n: any) => n.type))).sort() as string[]
  const noticeCrosstab = noticeTypes.map((type: string) => {
    const open = notices.filter((n: any) => n.type === type && n.status === 'open').length
    const pending = notices.filter((n: any) => n.type === type && n.status === 'pending_response').length
    const closed = notices.filter((n: any) => n.type === type && n.status === 'closed').length
    const total = notices.filter((n: any) => n.type === type).length
    return [type, String(open), String(pending), String(closed), String(total)]
  })

  const labourByRole = groupByRole(labourRaw)
  const plantByType = groupByPlantType(plantRaw)
  const subcontractors = groupByCompany(labourRaw, plantRaw)

  const sum = (rows: any[], field: string) => rows.reduce((s, r) => s + (r[field] ?? 0), 0)
  const labourHours = sum(labourRaw, 'hours')
  const plantHours = sum(plantRaw, 'hours')
  const materialQty = sum(materialRaw, 'quantity')
  const labourCost = sum(labourRaw, 'cost')
  const plantCost = sum(plantRaw, 'cost')
  const materialCost = sum(materialRaw, 'cost')
  const totalCost = labourCost + plantCost + materialCost
  const distinctPeople = new Set(labourRaw.map((r: any) => (r.person_name || '').trim().toLowerCase()).filter(Boolean)).size

  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({ text: `Project Report - ${projectName}`, heading: HeadingLevel.HEADING_1, spacing: { after: 100 } }),
        new Paragraph({
          children: [new TextRun({ text: `${formatDate(dateFrom)} - ${formatDate(dateTo)} (${daysInRange} day${daysInRange === 1 ? '' : 's'})`, italics: true })],
          spacing: { after: 300 },
        }),

        heading('Days Worked'),
        statLine(`${prestartDays} day${prestartDays === 1 ? '' : 's'} with a pre-start recorded.`),

        heading('Quality - ITPs'),
        statLine(`ITPs created: ${itps.length}`),
        statLine(`Activities signed off: ${itpComplete} / ${itpTotal} (${itpCompletePct}%)`),
        ...(itps.length > 0 ? [makeTable(['ITP No.', 'Title', 'Status'], itps.map((i: any) => [i.itp_number, i.title, i.status || 'draft']))] : [statLine('No ITPs created in this period.')]),

        heading('Safety - SWMS'),
        statLine(`SWMS created: ${swmsList.length}`),
        ...(swmsList.length > 0 ? [makeTable(['SWMS No.', 'Title', 'Status'], swmsList.map((s: any) => [s.swms_number, s.title, s.status || 'draft']))] : [statLine('No SWMS created in this period.')]),

        heading('Safety Observations'),
        statLine(`Raised: ${observations.length}   Open: ${observations.filter((o: any) => o.status === 'open').length}   Closed: ${observations.filter((o: any) => o.status === 'closed').length}`),
        ...(observations.length > 0 ? [makeTable(['No.', 'Category', 'Description', 'Status'], observations.map((o: any) => [o.observation_number, o.category, o.description, o.status === 'open' ? 'Open' : 'Closed']))] : [statLine('No safety observations raised in this period.')]),

        heading('Notices (RFIs, NCRs, EWNs, etc.)'),
        statLine(`Total raised: ${notices.length}`),
        ...(noticeCrosstab.length > 0 ? [subHeading('By type'), makeTable(['Type', 'Open', 'Pending', 'Closed', 'Total'], noticeCrosstab)] : []),
        ...(notices.length > 0 ? [subHeading('All notices'), makeTable(['Type', 'No.', 'Title', 'Status'], notices.map((n: any) => [n.type, n.notice_number, n.title, STATUS_LABELS[n.status] ?? n.status]))] : [statLine('No notices raised in this period.')]),

        heading('Resourcing'),
        makeTable(
          ['Category', 'Hours / Units', 'Cost'],
          [
            ['Labour', `${distinctPeople} people, ${labourHours.toFixed(1)} hrs`, `$${labourCost.toFixed(0)}`],
            ['Plant', `${plantHours.toFixed(1)} hrs`, `$${plantCost.toFixed(0)}`],
            ['Materials', `${materialQty.toFixed(1)} units`, `$${materialCost.toFixed(0)}`],
            ['Total', '', `$${totalCost.toFixed(0)}`],
          ]
        ),
        ...(labourByRole.length > 0 ? [subHeading('Labour by trade'), makeTable(['Trade / Role', 'People', 'Hours', 'Cost'], labourByRole.map(r => [r.role, String(r.people), r.hours.toFixed(1), `$${r.cost.toFixed(0)}`]))] : []),
        ...(plantByType.length > 0 ? [subHeading('Plant on site'), makeTable(['Plant / Machine', 'Units', 'Hours', 'Cost'], plantByType.map(p => [p.description, p.units != null ? String(p.units) : '-', p.hours.toFixed(1), `$${p.cost.toFixed(0)}`]))] : []),
        ...(subcontractors.length > 0 ? [subHeading('Subcontractors on site'), makeTable(['Company', 'Trades / Plant', 'People / Units', 'Hours', 'Cost'], subcontractors.map(s => [s.company, s.types, peopleUnitsLabel(s.peopleCount, s.unitsCount), s.hours.toFixed(1), `$${s.cost.toFixed(0)}`]))] : []),
      ],
    }],
  })

  const buffer = await Packer.toBuffer(doc)

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="report-${dateFrom}-to-${dateTo}.docx"`,
      'Cache-Control': 'no-store',
    },
  })
}
