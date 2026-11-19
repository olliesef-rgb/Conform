'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  PageShell, PageHeader, Card, Button, LoadingPage, colors
} from '@/components/ui'

interface Notice { id: string; type: string; notice_number: string; title: string; status: string; raised_at: string }
interface Itp { id: string; itp_number: string; title: string; status: string; created_at: string }
interface Swms { id: string; swms_number: string; title: string; status: string; created_at: string }
interface Observation { id: string; observation_number: string; category: string; description: string; status: string; raised_at: string }
interface Prestart { id: string; date: string }

function todayLocal(): string {
  return new Date().toLocaleDateString('en-CA')
}
function startOfWeekLocal(): string {
  const d = new Date()
  const day = d.getDay()
  const diff = (day === 0 ? -6 : 1) - day
  d.setDate(d.getDate() + diff)
  return d.toLocaleDateString('en-CA')
}
function startOfMonthLocal(): string {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toLocaleDateString('en-CA')
}
function addDaysLocal(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toLocaleDateString('en-CA')
}
function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('en-NZ', { day: '2-digit', month: 'short', year: 'numeric' })
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
  return Array.from(map.values())
    .map(e => ({ role: e.role, people: e.people.size, hours: e.hours, cost: e.cost }))
    .sort((a, b) => b.hours - a.hours)
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

type Preset = 'week' | 'month' | 'custom'
const STATUS_LABELS: Record<string, string> = { open: 'Open', pending_response: 'Pending Response', closed: 'Closed' }

export default function ReportsPage() {
  const params = useParams()
  const projectId = params.id as string
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [projectName, setProjectName] = useState('')
  const [preset, setPreset] = useState<Preset>('month')
  const [dateFrom, setDateFrom] = useState(startOfMonthLocal())
  const [dateTo, setDateTo] = useState(todayLocal())

  const [prestarts, setPrestarts] = useState<Prestart[]>([])
  const [itps, setItps] = useState<Itp[]>([])
  const [itpCompletion, setItpCompletion] = useState({ complete: 0, total: 0 })
  const [swmsList, setSwmsList] = useState<Swms[]>([])
  const [observations, setObservations] = useState<Observation[]>([])
  const [notices, setNotices] = useState<Notice[]>([])
  const [labourRaw, setLabourRaw] = useState<any[]>([])
  const [plantRaw, setPlantRaw] = useState<any[]>([])
  const [materialRaw, setMaterialRaw] = useState<any[]>([])

  useEffect(() => { load() }, [projectId, dateFrom, dateTo])

  function applyPreset(p: Preset) {
    setPreset(p)
    if (p === 'week') { setDateFrom(startOfWeekLocal()); setDateTo(todayLocal()) }
    if (p === 'month') { setDateFrom(startOfMonthLocal()); setDateTo(todayLocal()) }
  }

  async function load() {
    setLoading(true)
    const toExclusive = addDaysLocal(dateTo, 1)

    const { data: proj } = await supabase.from('projects').select('name').eq('id', projectId).single()
    setProjectName(proj?.name ?? 'Project')

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

    setPrestarts(prestartData ?? [])
    setItps(itpData ?? [])
    setSwmsList(swmsData ?? [])
    setObservations(obsData ?? [])
    setNotices(noticeData ?? [])

    if (itpData && itpData.length > 0) {
      const { data: activities } = await supabase
        .from('itp_activities')
        .select('is_complete')
        .in('itp_id', itpData.map(i => i.id))
      setItpCompletion({
        total: activities?.length ?? 0,
        complete: activities?.filter(a => a.is_complete).length ?? 0,
      })
    } else {
      setItpCompletion({ total: 0, complete: 0 })
    }

    const allocationIds = (allocData ?? []).map(a => a.id)
    if (allocationIds.length > 0) {
      const [{ data: labour }, { data: plant }, { data: materials }] = await Promise.all([
        supabase.from('daily_labour').select('person_name, company, is_subcontractor, role, hours, rate, allocation_id').in('allocation_id', allocationIds),
        supabase.from('daily_plant').select('description, unit_id, company, is_subcontractor, hours, rate, allocation_id').in('allocation_id', allocationIds),
        supabase.from('daily_materials').select('material_name, unit, quantity, rate, allocation_id').in('allocation_id', allocationIds),
      ])
      setLabourRaw((labour ?? []).map((r: any) => ({ ...r, cost: (r.hours != null && r.rate != null) ? r.hours * r.rate : null })))
      setPlantRaw((plant ?? []).map((r: any) => ({ ...r, cost: (r.hours != null && r.rate != null) ? r.hours * r.rate : null })))
      setMaterialRaw((materials ?? []).map((r: any) => ({ ...r, cost: (r.quantity != null && r.rate != null) ? r.quantity * r.rate : null })))
    } else {
      setLabourRaw([]); setPlantRaw([]); setMaterialRaw([])
    }

    setLoading(false)
  }

  const daysInRange = daysBetweenInclusive(dateFrom, dateTo)
  const prestartDays = new Set(prestarts.map(p => p.date)).size

  const itpCompletePct = itpCompletion.total > 0 ? Math.round((itpCompletion.complete / itpCompletion.total) * 100) : 0

  const obsOpen = observations.filter(o => o.status === 'open').length
  const obsClosed = observations.filter(o => o.status === 'closed').length
  const obsSorted = [...observations].sort((a, b) => (a.status === 'open' ? -1 : 1) - (b.status === 'open' ? -1 : 1))

  const swmsSorted = [...swmsList].sort((a, b) => a.swms_number.localeCompare(b.swms_number))

  const noticeTypes = Array.from(new Set(notices.map(n => n.type))).sort()
  const noticeStatuses = ['open', 'pending_response', 'closed']
  const noticeTable = noticeTypes.map(type => {
    const row: Record<string, number> = {}
    noticeStatuses.forEach(s => { row[s] = notices.filter(n => n.type === type && n.status === s).length })
    const total = notices.filter(n => n.type === type).length
    return { type, ...row, total }
  })
  const noticesSorted = [...notices].sort((a, b) => {
    const order: Record<string, number> = { open: 0, pending_response: 1, closed: 2 }
    return (order[a.status] ?? 9) - (order[b.status] ?? 9)
  })

  const labourByRole = groupByRole(labourRaw)
  const plantByType = groupByPlantType(plantRaw)
  const subcontractors = groupByCompany(labourRaw, plantRaw)

  const labourCost = labourRaw.reduce((s, r) => s + (r.cost ?? 0), 0)
  const plantCost = plantRaw.reduce((s, r) => s + (r.cost ?? 0), 0)
  const materialCost = materialRaw.reduce((s, r) => s + (r.cost ?? 0), 0)
  const labourHours = labourRaw.reduce((s, r) => s + (r.hours ?? 0), 0)
  const plantHours = plantRaw.reduce((s, r) => s + (r.hours ?? 0), 0)
  const materialQty = materialRaw.reduce((s, r) => s + (r.quantity ?? 0), 0)
  const resourcingTotalCost = labourCost + plantCost + materialCost
  const distinctPeople = new Set(labourRaw.map(r => (r.person_name || '').trim().toLowerCase()).filter(Boolean)).size

  return (
    <PageShell projectId={projectId} activeSection="reports">
      <PageHeader
        title="Reports"
        subtitle={`Summary of quality, safety, notices and resourcing for ${projectName}`}
        actions={
          <Button
            variant="secondary"
            href={`/api/projects/${projectId}/reports/export?from=${dateFrom}&to=${dateTo}`}
            download
          >
            Export to Word
          </Button>
        }
      />

      <div style={{ padding: '24px 32px', maxWidth: 1000 }}>
        <Card style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 4, background: colors.bg, padding: 4, borderRadius: 8 }}>
              {(['week', 'month', 'custom'] as Preset[]).map(p => (
                <button
                  key={p}
                  onClick={() => applyPreset(p)}
                  style={{
                    padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                    background: preset === p ? '#fff' : 'transparent',
                    color: preset === p ? colors.textPrimary : colors.textMuted,
                    boxShadow: preset === p ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                  }}
                >
                  {p === 'week' ? 'This Week' : p === 'month' ? 'This Month' : 'Custom'}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: colors.textMuted, textTransform: 'uppercase' }}>From</label>
              <input
                type="date"
                value={dateFrom}
                onChange={e => { setDateFrom(e.target.value); setPreset('custom') }}
                style={{ padding: '8px 10px', borderRadius: 8, border: `1px solid ${colors.border}`, fontSize: 13, fontFamily: 'inherit' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: colors.textMuted, textTransform: 'uppercase' }}>To</label>
              <input
                type="date"
                value={dateTo}
                onChange={e => { setDateTo(e.target.value); setPreset('custom') }}
                style={{ padding: '8px 10px', borderRadius: 8, border: `1px solid ${colors.border}`, fontSize: 13, fontFamily: 'inherit' }}
              />
            </div>
          </div>
          <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 10 }}>
            {formatDate(dateFrom)} - {formatDate(dateTo)} ({daysInRange} day{daysInRange === 1 ? '' : 's'})
          </div>
        </Card>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: colors.textMuted, fontSize: 13 }}>Loading report...</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            <Card>
              <SectionHeader>Days Worked</SectionHeader>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{prestartDays}</div>
              <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>
                day{prestartDays === 1 ? '' : 's'} with a pre-start recorded, {formatDate(dateFrom)} - {formatDate(dateTo)}
              </div>
            </Card>

            <Card>
              <SectionHeader>Quality - ITPs</SectionHeader>
              <div style={{ display: 'flex', gap: 24, marginBottom: 14 }}>
                <Stat label="ITPs created" value={itps.length} />
                <Stat label="Activities signed off" value={`${itpCompletion.complete} / ${itpCompletion.total}`} />
                <Stat label="Completion" value={`${itpCompletePct}%`} />
              </div>
              {itps.length > 0 ? (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>ITP No.</th>
                      <th style={thStyle}>Title</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itps.map(i => (
                      <tr key={i.id}>
                        <td style={tdStyle}>{i.itp_number}</td>
                        <td style={tdStyle}>{i.title}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', textTransform: 'capitalize' }}>{i.status || 'draft'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <EmptyNote>No ITPs created in this period.</EmptyNote>}
            </Card>

            <Card>
              <SectionHeader>Safety - SWMS</SectionHeader>
              <Stat label="SWMS created" value={swmsList.length} />
              {swmsSorted.length > 0 ? (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 14 }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>SWMS No.</th>
                      <th style={thStyle}>Title</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {swmsSorted.map(s => (
                      <tr key={s.id}>
                        <td style={tdStyle}>{s.swms_number}</td>
                        <td style={tdStyle}>{s.title}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', textTransform: 'capitalize' }}>{s.status || 'draft'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <EmptyNote>No SWMS created in this period.</EmptyNote>}
            </Card>

            <Card>
              <SectionHeader>Safety Observations</SectionHeader>
              <div style={{ display: 'flex', gap: 24, marginBottom: 14 }}>
                <Stat label="Raised" value={observations.length} />
                <Stat label="Open" value={obsOpen} />
                <Stat label="Closed" value={obsClosed} />
              </div>
              {obsSorted.length > 0 ? (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>No.</th>
                      <th style={thStyle}>Category</th>
                      <th style={thStyle}>Description</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {obsSorted.map(o => (
                      <tr key={o.id}>
                        <td style={tdStyle}>{o.observation_number}</td>
                        <td style={tdStyle}>{o.category}</td>
                        <td style={tdStyle}>{o.description}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, color: o.status === 'open' ? colors.danger : colors.textSecondary }}>
                          {o.status === 'open' ? 'Open' : 'Closed'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <EmptyNote>No safety observations raised in this period.</EmptyNote>}
            </Card>

            <Card>
              <SectionHeader>Notices (RFIs, NCRs, EWNs, etc.)</SectionHeader>
              <div style={{ display: 'flex', gap: 24, marginBottom: 14 }}>
                <Stat label="Raised" value={notices.length} />
                <Stat label="Open" value={notices.filter(n => n.status === 'open').length} />
                <Stat label="Pending Response" value={notices.filter(n => n.status === 'pending_response').length} />
                <Stat label="Closed" value={notices.filter(n => n.status === 'closed').length} />
              </div>
              {noticeTable.length > 0 && (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 16 }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Type</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Open</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Pending</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Closed</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {noticeTable.map((row: any) => (
                      <tr key={row.type}>
                        <td style={{ ...tdStyle, fontWeight: 600 }}>{row.type}</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>{row.open}</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>{row.pending_response}</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>{row.closed}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>{row.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {noticesSorted.length > 0 ? (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Type</th>
                      <th style={thStyle}>No.</th>
                      <th style={thStyle}>Title</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {noticesSorted.map(n => (
                      <tr key={n.id}>
                        <td style={tdStyle}>{n.type}</td>
                        <td style={tdStyle}>{n.notice_number}</td>
                        <td style={tdStyle}>{n.title}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, color: n.status === 'open' ? colors.danger : n.status === 'pending_response' ? colors.warning : colors.textSecondary }}>
                          {STATUS_LABELS[n.status] ?? n.status}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <EmptyNote>No notices raised in this period.</EmptyNote>}
            </Card>

            <Card>
              <SectionHeader>Resourcing</SectionHeader>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
                <MiniStatCard label="Labour" cost={labourCost} sub={`${distinctPeople} people - ${labourHours.toFixed(1)} hrs`} />
                <MiniStatCard label="Plant" cost={plantCost} sub={`${plantHours.toFixed(1)} hrs`} />
                <MiniStatCard label="Materials" cost={materialCost} sub={`${materialQty.toFixed(1)} units`} />
                <MiniStatCard label="Total" cost={resourcingTotalCost} sub="Labour + plant + materials" highlight />
              </div>

              <SubHeader>Labour by Trade</SubHeader>
              {labourByRole.length > 0 ? (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 18 }}>
                  <colgroup>
                    <col />
                    <col style={countColStyle} />
                    <col style={hoursColStyle} />
                    <col style={costColStyle} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th style={thStyle}>Trade / Role</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>People</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Hours</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {labourByRole.map(r => (
                      <tr key={r.role}>
                        <td style={tdStyle}>{r.role}</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>{r.people}</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>{r.hours.toFixed(1)}</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>${r.cost.toFixed(0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <EmptyNote>No labour recorded in this period.</EmptyNote>}

              <SubHeader>Plant on Site</SubHeader>
              {plantByType.length > 0 ? (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 18 }}>
                  <colgroup>
                    <col />
                    <col style={countColStyle} />
                    <col style={hoursColStyle} />
                    <col style={costColStyle} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th style={thStyle}>Plant / Machine</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Units</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Hours</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plantByType.map(p => (
                      <tr key={p.description}>
                        <td style={tdStyle}>{p.description}</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>{p.units ?? '-'}</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>{p.hours.toFixed(1)}</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>${p.cost.toFixed(0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <EmptyNote>No plant recorded in this period.</EmptyNote>}

              <SubHeader>Subcontractors on Site</SubHeader>
              {subcontractors.length > 0 ? (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <colgroup>
                    <col />
                    <col />
                    <col style={peopleUnitsColStyle} />
                    <col style={hoursColStyle} />
                    <col style={costColStyle} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th style={thStyle}>Company</th>
                      <th style={thStyle}>Trades / Plant</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>People / Units</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Hours</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subcontractors.map(s => (
                      <tr key={s.company}>
                        <td style={tdStyle}>{s.company}</td>
                        <td style={tdStyle}>{s.types}</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>{peopleUnitsLabel(s.peopleCount, s.unitsCount)}</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>{s.hours.toFixed(1)}</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>${s.cost.toFixed(0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <EmptyNote>No subcontractor labour or plant recorded in this period.</EmptyNote>}
            </Card>

          </div>
        )}
      </div>
    </PageShell>
  )
}

const thStyle: React.CSSProperties = { textAlign: 'left', padding: '8px 12px', color: colors.textMuted, fontSize: 11, textTransform: 'uppercase' }
const tdStyle: React.CSSProperties = { padding: '8px 12px', borderTop: `1px solid ${colors.border}` }
const countColStyle: React.CSSProperties = { width: 70 }
const hoursColStyle: React.CSSProperties = { width: 80 }
const costColStyle: React.CSSProperties = { width: 90 }
const peopleUnitsColStyle: React.CSSProperties = { width: 120 }

function SectionHeader({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 14, fontWeight: 700, color: colors.textPrimary, marginBottom: 14 }}>{children}</div>
}

function SubHeader({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, fontWeight: 700, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>{children}</div>
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 700 }}>{value}</div>
      <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>{label}</div>
    </div>
  )
}

function MiniStatCard({ label, cost, sub, highlight }: { label: string; cost: number; sub: string; highlight?: boolean }) {
  return (
    <div style={{ padding: 14, borderRadius: 10, background: highlight ? colors.bg : 'transparent', border: `1px solid ${colors.border}` }}>
      <div style={{ fontSize: 12, color: colors.textMuted }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700 }}>${cost.toFixed(0)}</div>
      <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>{sub}</div>
    </div>
  )
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 8 }}>{children}</div>
}
