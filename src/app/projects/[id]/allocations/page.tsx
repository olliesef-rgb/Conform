'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  PageShell, PageHeader, Card, Button, LoadingPage, SkeletonCard, colors
} from '@/components/ui'

interface AllocationSummary { id: string; date: string }
type ResourceTab = 'labour' | 'plant' | 'materials'
type ViewMode = 'totals' | 'daily'
interface FilterColumn { key: string; label: string; value: (r: any) => string }

function typeLabel(r: any): string {
  return r.is_subcontractor === null || r.is_subcontractor === undefined ? '(unspecified)' : r.is_subcontractor ? 'Subcontractor' : 'Internal'
}

function formatDate(d: string): string {
  if (!d) return '(no date)'
  return new Date(d).toLocaleDateString('en-NZ', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
}

// Local calendar date (YYYY-MM-DD) - NOT toISOString(), which is UTC and rolls over
// to the wrong day for NZ timezones in the morning/evening.
function todayLocal(): string {
  return new Date().toLocaleDateString('en-CA')
}

const LABOUR_FILTERS: FilterColumn[] = [
  { key: 'date', label: 'Date', value: r => formatDate(r.date) },
  { key: 'person_name', label: 'Name', value: r => r.person_name || '(blank)' },
  { key: 'company', label: 'Company', value: r => r.company || '(none)' },
  { key: 'role', label: 'Role', value: r => r.role || '(none)' },
  { key: 'type', label: 'Type', value: typeLabel },
]
const PLANT_FILTERS: FilterColumn[] = [
  { key: 'date', label: 'Date', value: r => formatDate(r.date) },
  { key: 'description', label: 'Plant / Machine', value: r => r.description || '(blank)' },
  { key: 'unit_id', label: 'Unit ID', value: r => r.unit_id || '(none)' },
  { key: 'company', label: 'Company', value: r => r.company || '(none)' },
  { key: 'type', label: 'Type', value: typeLabel },
]
const MATERIAL_FILTERS: FilterColumn[] = [
  { key: 'date', label: 'Date', value: r => formatDate(r.date) },
  { key: 'material_name', label: 'Material', value: r => r.material_name || '(blank)' },
  { key: 'unit', label: 'Unit', value: r => r.unit || '(none)' },
]

function applyFilters(rows: any[], columns: FilterColumn[], filters: Record<string, string[]>): any[] {
  return rows.filter(r => columns.every(c => {
    const selected = filters[c.key]
    return !selected || selected.length === 0 || selected.includes(c.value(r))
  }))
}

// When exactly one date is picked in the Date filter, a Date column in the Daily
// table is redundant - every row is that date - so drop it and the table matches
// the Day Snapshot's column set.
function dateColumnIfNeeded(filters: Record<string, string[]>): ColumnDef[] {
  if ((filters.date?.length ?? 0) === 1) return []
  return [{ key: 'date', label: 'Date', format: formatDate }]
}

export default function AllocationsReportPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [allocations, setAllocations] = useState<AllocationSummary[]>([])
  const [labourRaw, setLabourRaw] = useState<any[]>([])
  const [plantRaw, setPlantRaw] = useState<any[]>([])
  const [materialRaw, setMaterialRaw] = useState<any[]>([])

  const [tab, setTab] = useState<ResourceTab>('labour')
  const [view, setView] = useState<ViewMode>('daily')

  const [labourFilters, setLabourFilters] = useState<Record<string, string[]>>({})
  const [plantFilters, setPlantFilters] = useState<Record<string, string[]>>({})
  const [materialFilters, setMaterialFilters] = useState<Record<string, string[]>>({})

  const [pickDate, setPickDate] = useState(todayLocal())
  const [snapshotDate, setSnapshotDate] = useState('')

  useEffect(() => { load() }, [projectId])

  async function load() {
    setLoading(true)

    const { data: allocs } = await supabase
      .from('daily_allocations')
      .select('id, date')
      .eq('project_id', projectId)
      .order('date', { ascending: false })
    setAllocations(allocs ?? [])

    const [{ data: labour }, { data: plant }, { data: materials }] = await Promise.all([
      supabase.from('daily_labour').select('person_name, company, is_subcontractor, role, hours, rate, daily_allocations!inner(project_id, date)').eq('daily_allocations.project_id', projectId),
      supabase.from('daily_plant').select('description, unit_id, company, is_subcontractor, hours, rate, daily_allocations!inner(project_id, date)').eq('daily_allocations.project_id', projectId),
      supabase.from('daily_materials').select('material_name, unit, quantity, rate, daily_allocations!inner(project_id, date)').eq('daily_allocations.project_id', projectId),
    ])

    setLabourRaw((labour ?? []).map((r: any) => ({
      ...r, date: r.daily_allocations?.date,
      cost: (r.hours != null && r.rate != null) ? r.hours * r.rate : null,
    })))
    setPlantRaw((plant ?? []).map((r: any) => ({
      ...r, date: r.daily_allocations?.date,
      cost: (r.hours != null && r.rate != null) ? r.hours * r.rate : null,
    })))
    setMaterialRaw((materials ?? []).map((r: any) => ({
      ...r, date: r.daily_allocations?.date,
      cost: (r.quantity != null && r.rate != null) ? r.quantity * r.rate : null,
    })))

    setLoading(false)
  }

  function aggregate(rows: any[], keyFn: (r: any) => string, metaFn: (r: any) => any, qtyField: 'hours' | 'quantity') {
    const map = new Map<string, any>()
    rows.forEach(r => {
      const key = keyFn(r)
      const qty = r[qtyField] ?? 0
      const cost = r.cost ?? 0
      const hasRate = r.rate !== null && r.rate !== undefined
      if (!map.has(key)) map.set(key, { ...metaFn(r), totalQty: 0, totalCost: 0, hasAnyRate: false, unitIds: new Set<string>() })
      const entry = map.get(key)
      entry.totalQty += qty
      entry.totalCost += cost
      if (hasRate) entry.hasAnyRate = true
      if (r.unit_id && r.unit_id.trim()) entry.unitIds.add(r.unit_id.trim().toLowerCase())
    })
    return Array.from(map.values()).sort((a, b) => b.totalQty - a.totalQty)
  }

  if (loading) {
    return (
      <PageShell projectId={projectId} activeSection="allocations">
        <PageHeader
          title="Resourcing"
          subtitle="Labour, plant and materials tracked against daily pre-starts"
        />
        <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </PageShell>
    )
  }

  const labourFiltered = applyFilters(labourRaw, LABOUR_FILTERS, labourFilters)
  const plantFiltered = applyFilters(plantRaw, PLANT_FILTERS, plantFilters)
  const materialFiltered = applyFilters(materialRaw, MATERIAL_FILTERS, materialFilters)

  const labourTotals = aggregate(labourFiltered, (r: any) => `${r.person_name}|${r.company ?? ''}|${r.role ?? ''}`, (r: any) => ({
    label: r.person_name, company: r.company, role: r.role, is_subcontractor: r.is_subcontractor
  }), 'hours')
  const plantTotals = aggregate(plantFiltered, (r: any) => `${r.description}|${r.company ?? ''}`, (r: any) => ({
    label: r.description, company: r.company, is_subcontractor: r.is_subcontractor
  }), 'hours')
  const materialTotals = aggregate(materialFiltered, (r: any) => `${r.material_name}|${r.unit ?? ''}`, (r: any) => ({
    label: r.material_name, unit: r.unit
  }), 'quantity')

  const totalLabourCost = labourFiltered.reduce((s, r) => s + (r.cost ?? 0), 0)
  const totalPlantCost = plantFiltered.reduce((s, r) => s + (r.cost ?? 0), 0)
  const totalMaterialCost = materialFiltered.reduce((s, r) => s + (r.cost ?? 0), 0)
  const grandTotalCost = totalLabourCost + totalPlantCost + totalMaterialCost

  const totalLabourHours = labourFiltered.reduce((s, r) => s + (r.hours ?? 0), 0)
  const totalPlantHours = plantFiltered.reduce((s, r) => s + (r.hours ?? 0), 0)
  const totalMaterialQty = materialFiltered.reduce((s, r) => s + (r.quantity ?? 0), 0)

  const daySnapshotLabour = labourRaw.filter(r => r.date === snapshotDate)
  const daySnapshotPlant = plantRaw.filter(r => r.date === snapshotDate)
  const daySnapshotMaterials = materialRaw.filter(r => r.date === snapshotDate)
  const daySnapshotTotalCost = [...daySnapshotLabour, ...daySnapshotPlant, ...daySnapshotMaterials].reduce((s, r) => s + (r.cost ?? 0), 0)

  const tabs: { key: ResourceTab; label: string }[] = [
    { key: 'labour', label: 'Labour' },
    { key: 'plant', label: 'Plant' },
    { key: 'materials', label: 'Materials' },
  ]

  return (
    <PageShell projectId={projectId} activeSection="allocations">
      <PageHeader
        title="Resourcing"
        subtitle="Labour, plant and materials tracked against daily pre-starts"
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Button variant="secondary" href={`/api/projects/${projectId}/allocations/export`} download>Export to Excel</Button>
            <input
              type="date"
              value={pickDate}
              onChange={e => setPickDate(e.target.value)}
              style={{ padding: '8px 10px', borderRadius: 8, border: `1px solid ${colors.border}`, fontSize: 13, fontFamily: 'inherit' }}
            />
            <Button onClick={() => router.push(`/projects/${projectId}/allocations/${pickDate}`)}>
              + Allocation
            </Button>
          </div>
        }
      />
      <div style={{ padding: '24px 32px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
          <Card>
            <div style={{ fontSize: 12, color: colors.textMuted }}>Labour cost</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>${totalLabourCost.toFixed(0)}</div>
            <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>{totalLabourHours.toFixed(1)} hrs</div>
          </Card>
          <Card>
            <div style={{ fontSize: 12, color: colors.textMuted }}>Plant cost</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>${totalPlantCost.toFixed(0)}</div>
            <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>{totalPlantHours.toFixed(1)} hrs</div>
          </Card>
          <Card>
            <div style={{ fontSize: 12, color: colors.textMuted }}>Materials cost</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>${totalMaterialCost.toFixed(0)}</div>
            <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>{totalMaterialQty.toFixed(1)} units</div>
          </Card>
          <Card style={{ background: colors.bg }}>
            <div style={{ fontSize: 12, color: colors.textMuted }}>Total cost</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>${grandTotalCost.toFixed(0)}</div>
            <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>Labour + plant + materials</div>
          </Card>
        </div>

        <Card style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Day Snapshot</div>
          <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 10 }}>Pick one date to see every person, plant item and material recorded for it, all together.</div>
          <select
            value={snapshotDate}
            onChange={e => setSnapshotDate(e.target.value)}
            style={{ width: '100%', maxWidth: 320, padding: '9px 12px', borderRadius: 8, border: `1px solid ${colors.border}`, fontSize: 13, fontFamily: 'inherit' }}
          >
            <option value="">Select a date...</option>
            {allocations.map(a => (
              <option key={a.id} value={a.date}>{formatDate(a.date)}</option>
            ))}
          </select>

          {snapshotDate && (
            <div style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>
                  Total for {formatDate(snapshotDate)}: ${daySnapshotTotalCost.toFixed(0)}
                </div>
                <Button variant="secondary" onClick={() => router.push(`/projects/${projectId}/allocations/${snapshotDate}`)}>
                  Edit this day
                </Button>
              </div>

              <SectionLabel>Labour</SectionLabel>
              <DailyTable rows={daySnapshotLabour} showTotals columns={[
                { key: 'person_name', label: 'Name' },
                { key: 'company', label: 'Company' },
                { key: 'role', label: 'Role' },
                { key: 'is_subcontractor', label: 'Type', format: (v: boolean | null) => v === null ? '-' : v ? 'Subcontractor' : 'Internal' },
                { key: 'hours', label: 'Hours', align: 'right' },
                { key: 'rate', label: 'Rate', align: 'right' },
                { key: 'cost', label: 'Cost', align: 'right', format: (v: number | null) => v != null ? `$${v.toFixed(0)}` : '-' },
              ]} />

              <SectionLabel>Plant</SectionLabel>
              <DailyTable rows={daySnapshotPlant} showTotals columns={[
                { key: 'description', label: 'Plant / Machine' },
                { key: 'company', label: 'Company' },
                { key: 'unit_id', label: 'Unit ID' },
                { key: 'is_subcontractor', label: 'Type', format: (v: boolean | null) => v === null ? '-' : v ? 'Subcontractor' : 'Internal' },
                { key: 'hours', label: 'Hours', align: 'right' },
                { key: 'rate', label: 'Rate', align: 'right' },
                { key: 'cost', label: 'Cost', align: 'right', format: (v: number | null) => v != null ? `$${v.toFixed(0)}` : '-' },
              ]} />

              <SectionLabel>Materials</SectionLabel>
              <DailyTable rows={daySnapshotMaterials} showTotals columns={[
                { key: 'material_name', label: 'Material' },
                MATERIALS_SPACER,
                { key: 'quantity', label: 'Quantity', align: 'right' },
                { key: 'unit', label: 'Unit' },
                { key: 'rate', label: 'Rate', align: 'right' },
                { key: 'cost', label: 'Cost', align: 'right', format: (v: number | null) => v != null ? `$${v.toFixed(0)}` : '-' },
              ]} />

              <div style={{ marginTop: 16, paddingTop: 12, paddingRight: 16, borderTop: `2px solid ${colors.border}`, display: 'flex', justifyContent: 'flex-end', gap: 8, fontSize: 14, fontWeight: 700 }}>
                <span>Total (Labour + Plant + Materials):</span>
                <span style={{ display: 'inline-block', minWidth: 110 - 16, textAlign: 'right' }}>${daySnapshotTotalCost.toFixed(0)}</span>
              </div>
            </div>
          )}
        </Card>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 4, background: colors.bg, padding: 4, borderRadius: 8 }}>
            {tabs.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                style={{
                  padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                  background: tab === t.key ? '#fff' : 'transparent',
                  color: tab === t.key ? colors.textPrimary : colors.textMuted,
                  boxShadow: tab === t.key ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 4, background: colors.bg, padding: 4, borderRadius: 8 }}>
            {(['totals', 'daily'] as ViewMode[]).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                style={{
                  padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                  background: view === v ? '#fff' : 'transparent',
                  color: view === v ? colors.textPrimary : colors.textMuted,
                  boxShadow: view === v ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                }}
              >
                {v === 'totals' ? 'Totals' : 'Daily'}
              </button>
            ))}
          </div>
        </div>

        {tab === 'labour' && <FilterBar rows={labourRaw} columns={LABOUR_FILTERS} filters={labourFilters} setFilters={setLabourFilters} />}
        {tab === 'plant' && <FilterBar rows={plantRaw} columns={PLANT_FILTERS} filters={plantFilters} setFilters={setPlantFilters} />}
        {tab === 'materials' && <FilterBar rows={materialRaw} columns={MATERIAL_FILTERS} filters={materialFilters} setFilters={setMaterialFilters} />}

        <Card style={{ marginBottom: 16 }}>
          {tab === 'labour' && (
            view === 'totals'
              ? <SummaryTable rows={labourTotals} qtyLabel="Hours" showRole />
              : <DailyTable rows={labourFiltered} showTotals columns={[
                  ...dateColumnIfNeeded(labourFilters),
                  { key: 'person_name', label: 'Name' },
                  { key: 'company', label: 'Company' },
                  { key: 'role', label: 'Role' },
                  { key: 'is_subcontractor', label: 'Type', format: (v: boolean | null) => v === null ? '-' : v ? 'Subcontractor' : 'Internal' },
                  { key: 'hours', label: 'Hours', align: 'right' },
                  { key: 'rate', label: 'Rate', align: 'right' },
                  { key: 'cost', label: 'Cost', align: 'right', format: (v: number | null) => v != null ? `$${v.toFixed(0)}` : '-' },
                ]} />
          )}
          {tab === 'plant' && (
            view === 'totals'
              ? <SummaryTable rows={plantTotals} qtyLabel="Hours" showUnits />
              : <DailyTable rows={plantFiltered} showTotals columns={[
                  ...dateColumnIfNeeded(plantFilters),
                  { key: 'description', label: 'Plant / Machine' },
                  { key: 'company', label: 'Company' },
                  { key: 'unit_id', label: 'Unit ID' },
                  { key: 'is_subcontractor', label: 'Type', format: (v: boolean | null) => v === null ? '-' : v ? 'Subcontractor' : 'Internal' },
                  { key: 'hours', label: 'Hours', align: 'right' },
                  { key: 'rate', label: 'Rate', align: 'right' },
                  { key: 'cost', label: 'Cost', align: 'right', format: (v: number | null) => v != null ? `$${v.toFixed(0)}` : '-' },
                ]} />
          )}
          {tab === 'materials' && (
            view === 'totals'
              ? <SummaryTable rows={materialTotals} qtyLabel="Quantity" isMaterial />
              : <DailyTable rows={materialFiltered} showTotals columns={[
                  ...dateColumnIfNeeded(materialFilters),
                  { key: 'material_name', label: 'Material' },
                  MATERIALS_SPACER,
                  { key: 'quantity', label: 'Quantity', align: 'right' },
                  { key: 'unit', label: 'Unit' },
                  { key: 'rate', label: 'Rate', align: 'right' },
                  { key: 'cost', label: 'Cost', align: 'right', format: (v: number | null) => v != null ? `$${v.toFixed(0)}` : '-' },
                ]} />
          )}
        </Card>

        <Card>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>Daily entries</div>
          {allocations.length === 0 ? (
            <div style={{ padding: '0 16px 16px', fontSize: 13, color: colors.textMuted }}>No daily allocations recorded yet.</div>
          ) : allocations.map(a => (
            <div
              key={a.id}
              onClick={() => router.push(`/projects/${projectId}/allocations/${a.date}`)}
              style={{ padding: '10px 16px', borderTop: `1px solid ${colors.border}`, cursor: 'pointer', fontSize: 13, color: colors.textPrimary }}
            >
              {formatDate(a.date)}
            </div>
          ))}
        </Card>
      </div>
    </PageShell>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 14, marginBottom: 6 }}>
      {children}
    </div>
  )
}

function MultiSelectFilter({ label, options, selected, onChange }: {
  label: string; options: string[]; selected: string[]; onChange: (v: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  function toggle(v: string) {
    onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v])
  }

  const summary = selected.length === 0 ? 'All' : selected.length === 1 ? selected[0] : `${selected.length} selected`

  return (
    <div ref={ref} style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</label>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          padding: '7px 10px', borderRadius: 7, border: `1px solid ${colors.border}`, fontSize: 12, fontFamily: 'inherit',
          minWidth: 140, maxWidth: 200, textAlign: 'left', background: '#fff', cursor: 'pointer',
          color: selected.length > 0 ? colors.textPrimary : colors.textMuted,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}
      >
        {summary}
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 4, background: '#fff', border: `1px solid ${colors.border}`,
          borderRadius: 8, boxShadow: '0 4px 14px rgba(0,0,0,0.12)', zIndex: 20, maxHeight: 240, overflowY: 'auto', minWidth: 190, padding: 6,
        }}>
          {options.length === 0 ? (
            <div style={{ padding: '6px 8px', fontSize: 12, color: colors.textMuted }}>No values</div>
          ) : (
            <>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', fontSize: 12, fontWeight: 600, cursor: 'pointer', borderRadius: 5, color: colors.textPrimary }}>
                <input type="checkbox" checked={selected.length === 0} onChange={() => onChange([])} />
                All
              </label>
              <div style={{ borderTop: `1px solid ${colors.border}`, margin: '4px 2px' }} />
              {options.map(o => (
                <label key={o} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', fontSize: 12, cursor: 'pointer', borderRadius: 5, color: colors.textPrimary }}>
                  <input type="checkbox" checked={selected.includes(o)} onChange={() => toggle(o)} />
                  {o}
                </label>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function FilterBar({ rows, columns, filters, setFilters }: {
  rows: any[]; columns: FilterColumn[]; filters: Record<string, string[]>; setFilters: (f: Record<string, string[]>) => void
}) {
  const activeCount = Object.values(filters).reduce((s, v) => s + (v?.length ?? 0), 0)
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 12, flexWrap: 'wrap' }}>
      {columns.map(c => {
        const options = Array.from(new Set(rows.map(c.value))).sort()
        return (
          <MultiSelectFilter
            key={c.key}
            label={c.label}
            options={options}
            selected={filters[c.key] ?? []}
            onChange={v => setFilters({ ...filters, [c.key]: v })}
          />
        )
      })}
      {activeCount > 0 && (
        <button
          onClick={() => setFilters({})}
          style={{ marginTop: 18, padding: '7px 12px', borderRadius: 7, border: `1px solid ${colors.border}`, background: '#fff', fontSize: 12, cursor: 'pointer', color: colors.textSecondary }}
        >
          Clear filters ({activeCount})
        </button>
      )}
    </div>
  )
}

function SummaryTable({ rows, qtyLabel, isMaterial, showRole, showUnits }: { rows: any[]; qtyLabel: string; isMaterial?: boolean; showRole?: boolean; showUnits?: boolean }) {
  if (rows.length === 0) return <div style={{ padding: 20, fontSize: 13, color: colors.textMuted }}>No entries yet.</div>
  const totalQty = rows.reduce((s, r) => s + (r.totalQty ?? 0), 0)
  const totalCost = rows.reduce((s, r) => s + (r.totalCost ?? 0), 0)
  const colSpanBeforeQty = 1 + (!isMaterial ? 1 : 0) + (showRole ? 1 : 0) + (!isMaterial ? 1 : 0) + (showUnits ? 1 : 0)
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
      <thead>
        <tr>
          <th style={{ textAlign: 'left', padding: '10px 16px', color: colors.textMuted, fontSize: 11, textTransform: 'uppercase' }}>Name</th>
          {!isMaterial && <th style={{ textAlign: 'left', padding: '10px 16px', color: colors.textMuted, fontSize: 11, textTransform: 'uppercase' }}>Company</th>}
          {showRole && <th style={{ textAlign: 'left', padding: '10px 16px', color: colors.textMuted, fontSize: 11, textTransform: 'uppercase' }}>Role</th>}
          {!isMaterial && <th style={{ textAlign: 'left', padding: '10px 16px', color: colors.textMuted, fontSize: 11, textTransform: 'uppercase' }}>Type</th>}
          {showUnits && <th style={{ textAlign: 'right', padding: '10px 16px', color: colors.textMuted, fontSize: 11, textTransform: 'uppercase' }}>Units</th>}
          <th style={{ textAlign: 'right', padding: '10px 16px', color: colors.textMuted, fontSize: 11, textTransform: 'uppercase' }}>{qtyLabel}</th>
          <th style={{ textAlign: 'right', padding: '10px 16px', color: colors.textMuted, fontSize: 11, textTransform: 'uppercase' }}>Cost</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td style={{ padding: '8px 16px', borderTop: `1px solid ${colors.border}` }}>{r.label}{isMaterial && r.unit ? ` (${r.unit})` : ''}</td>
            {!isMaterial && <td style={{ padding: '8px 16px', borderTop: `1px solid ${colors.border}`, color: colors.textSecondary }}>{r.company ?? '-'}</td>}
            {showRole && <td style={{ padding: '8px 16px', borderTop: `1px solid ${colors.border}`, color: colors.textSecondary }}>{r.role ?? '-'}</td>}
            {!isMaterial && <td style={{ padding: '8px 16px', borderTop: `1px solid ${colors.border}`, color: colors.textSecondary }}>{r.is_subcontractor === null ? '-' : r.is_subcontractor ? 'Subcontractor' : 'Internal'}</td>}
            {showUnits && <td style={{ padding: '8px 16px', borderTop: `1px solid ${colors.border}`, textAlign: 'right', color: colors.textSecondary }}>{r.unitIds && r.unitIds.size > 0 ? r.unitIds.size : '-'}</td>}
            <td style={{ padding: '8px 16px', borderTop: `1px solid ${colors.border}`, textAlign: 'right' }}>{r.totalQty.toFixed(1)}</td>
            <td style={{ padding: '8px 16px', borderTop: `1px solid ${colors.border}`, textAlign: 'right' }}>{r.hasAnyRate ? `$${r.totalCost.toFixed(0)}` : '-'}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td colSpan={colSpanBeforeQty} style={{ padding: '10px 16px', borderTop: `2px solid ${colors.border}`, fontWeight: 700 }}>Total</td>
          <td style={{ padding: '10px 16px', borderTop: `2px solid ${colors.border}`, textAlign: 'right', fontWeight: 700 }}>{totalQty.toFixed(1)}</td>
          <td style={{ padding: '10px 16px', borderTop: `2px solid ${colors.border}`, textAlign: 'right', fontWeight: 700 }}>${totalCost.toFixed(0)}</td>
        </tr>
      </tfoot>
    </table>
  )
}

interface ColumnDef { key: string; label: string; align?: 'left' | 'right'; format?: (v: any) => string; spacer?: boolean }

// Only the trailing numeric columns get a fixed pixel width. Every table is forced
// to width:100%, so pinning just these - always the rightmost columns - means Rate
// and Cost line up at the same x position across Labour / Plant / Materials no
// matter how many leading (name/company/etc.) columns a given table has. Leading
// columns are left unset so table-layout:fixed shares the remaining width equally
// between them - which also makes Company line up between Labour and Plant, since
// both have the same number of leading columns.
//
// Materials has far fewer leading columns than Labour/Plant (just Material, vs
// Company/Role-or-UnitID/Type), so giving it a fixed width and a blank spacer
// column (see MATERIALS_SPACER below) keeps the Material name from ballooning to
// fill all the leftover space - the gap before Quantity becomes deliberate spacer
// space instead of an oversized text cell, while Rate/Cost stay pinned exactly as
// they are for Labour/Plant.
const FIXED_COLUMN_WIDTHS: Record<string, number> = {
  material_name: 240,
  hours: 90,
  quantity: 90,
  unit: 80,
  rate: 90,
  cost: 110,
}
const MATERIALS_SPACER: ColumnDef = { key: '_spacer', label: '', spacer: true }

function DailyTable({ rows, columns, showTotals }: { rows: any[]; columns: ColumnDef[]; showTotals?: boolean }) {
  const sorted = [...rows].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
  if (sorted.length === 0) return <div style={{ padding: 16, fontSize: 13, color: colors.textMuted }}>No entries yet.</div>

  const summableKeys = ['hours', 'quantity', 'cost']
  const totals: Record<string, number> = {}
  columns.forEach(c => {
    if (summableKeys.includes(c.key)) {
      totals[c.key] = rows.reduce((s, r) => s + (typeof r[c.key] === 'number' ? r[c.key] : 0), 0)
    }
  })
  const firstSummableIdx = columns.findIndex(c => summableKeys.includes(c.key))

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, tableLayout: 'fixed' }}>
      <colgroup>
        {columns.map(c => (
          <col key={c.key} style={FIXED_COLUMN_WIDTHS[c.key] ? { width: FIXED_COLUMN_WIDTHS[c.key] } : undefined} />
        ))}
      </colgroup>
      <thead>
        <tr>
          {columns.map(c => (
            <th key={c.key} style={{ textAlign: c.align ?? 'left', padding: '10px 16px', color: colors.textMuted, fontSize: 11, textTransform: 'uppercase' }}>{c.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {sorted.map((r, i) => (
          <tr key={i}>
            {columns.map(c => {
              if (c.spacer) return <td key={c.key} style={{ padding: '8px 16px', borderTop: `1px solid ${colors.border}` }} />
              const raw = r[c.key]
              const value = c.format ? c.format(raw) : (raw ?? '-')
              return (
                <td key={c.key} style={{ padding: '8px 16px', borderTop: `1px solid ${colors.border}`, textAlign: c.align ?? 'left', color: colors.textSecondary }}>
                  {value === null || value === undefined || value === '' ? '-' : value}
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
      {showTotals && firstSummableIdx !== -1 && (
        <tfoot>
          <tr>
            {columns.map((c, i) => {
              if (i === 0) return <td key={c.key} style={{ padding: '10px 16px', borderTop: `2px solid ${colors.border}`, fontWeight: 700 }}>Total</td>
              if (c.spacer || !summableKeys.includes(c.key)) return <td key={c.key} style={{ padding: '10px 16px', borderTop: `2px solid ${colors.border}` }} />
              const isCost = c.key === 'cost'
              return (
                <td key={c.key} style={{ padding: '10px 16px', borderTop: `2px solid ${colors.border}`, textAlign: 'right', fontWeight: 700 }}>
                  {isCost ? `$${totals[c.key].toFixed(0)}` : totals[c.key].toFixed(1)}
                </td>
              )
            })}
          </tr>
        </tfoot>
      )}
    </table>
  )
}
