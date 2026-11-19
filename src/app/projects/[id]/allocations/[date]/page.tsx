'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  PageShell, PageHeader, Card, Button, Input, Select, Alert, LoadingPage, colors
} from '@/components/ui'

interface LabourRow { id?: string; person_name: string; company: string; is_subcontractor: boolean | null; role: string; hours: string; rate: string; notice_id?: string | null }
interface PlantRow { id?: string; description: string; unit_id: string; company: string; is_subcontractor: boolean | null; hours: string; rate: string; notice_id?: string | null }
interface MaterialRow { id?: string; material_name: string; unit: string; quantity: string; rate: string; notice_id?: string | null }

export default function DailyAllocationPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string
  const date = params.date as string
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [prestartNote, setPrestartNote] = useState('')
  const [allocationId, setAllocationId] = useState<string | null>(null)

  const [labour, setLabour] = useState<LabourRow[]>([])
  const [plant, setPlant] = useState<PlantRow[]>([])
  const [materials, setMaterials] = useState<MaterialRow[]>([])

  const [companySuggestions, setCompanySuggestions] = useState<Record<string, boolean>>({})
  const [ceNotices, setCeNotices] = useState<{ id: string; title: string }[]>([])

  const [previousAllocations, setPreviousAllocations] = useState<{ id: string; date: string }[]>([])
  const [copyFromId, setCopyFromId] = useState('')
  const [copying, setCopying] = useState(false)

  useEffect(() => { load() }, [projectId, date])

  async function load() {
    setLoading(true)

    const { data: prestarts } = await supabase
      .from('prestarts')
      .select('id, planned_works, crew')
      .eq('project_id', projectId)
      .eq('date', date)
      .order('created_at', { ascending: false })
      .limit(1)
    const prestart = prestarts?.[0] ?? null
    setPrestartNote(prestart?.planned_works ?? '')

    const { data: notices } = await supabase
      .from('notices')
      .select('id, title')
      .eq('project_id', projectId)
      .eq('type', 'CE')
      .eq('status', 'open')
      .order('raised_at', { ascending: false })
    setCeNotices(notices ?? [])

    const { data: allocation } = await supabase
      .from('daily_allocations')
      .select('id')
      .eq('project_id', projectId)
      .eq('date', date)
      .maybeSingle()

    let haveExistingRows = false

    if (allocation) {
      setAllocationId(allocation.id)
      const [{ data: l }, { data: p }, { data: m }] = await Promise.all([
        supabase.from('daily_labour').select('*').eq('allocation_id', allocation.id).order('sort_order'),
        supabase.from('daily_plant').select('*').eq('allocation_id', allocation.id).order('sort_order'),
        supabase.from('daily_materials').select('*').eq('allocation_id', allocation.id).order('sort_order'),
      ])
      haveExistingRows = (l?.length ?? 0) > 0 || (p?.length ?? 0) > 0
      setLabour((l ?? []).map((r: any) => ({
        id: r.id, person_name: r.person_name ?? '', company: r.company ?? '',
        is_subcontractor: r.is_subcontractor, role: r.role ?? '',
        hours: r.hours?.toString() ?? '', rate: r.rate?.toString() ?? '', notice_id: r.notice_id ?? null
      })))
      setPlant((p ?? []).map((r: any) => ({
        id: r.id, description: r.description ?? '', unit_id: r.unit_id ?? '', company: r.company ?? '',
        is_subcontractor: r.is_subcontractor, hours: r.hours?.toString() ?? '', rate: r.rate?.toString() ?? '', notice_id: r.notice_id ?? null
      })))
      setMaterials((m ?? []).map((r: any) => ({
        id: r.id, material_name: r.material_name ?? '', unit: r.unit ?? '',
        quantity: r.quantity?.toString() ?? '', rate: r.rate?.toString() ?? '', notice_id: r.notice_id ?? null
      })))
    }

    // build company -> is_subcontractor map from past entries on this project (for autocomplete / suggestion)
    const [{ data: pastLabour }, { data: pastPlant }] = await Promise.all([
      supabase.from('daily_labour').select('person_name, company, is_subcontractor, daily_allocations!inner(project_id)').eq('daily_allocations.project_id', projectId),
      supabase.from('daily_plant').select('company, is_subcontractor, daily_allocations!inner(project_id)').eq('daily_allocations.project_id', projectId),
    ])
    const map: Record<string, boolean> = {}
    ;[...(pastLabour ?? []), ...(pastPlant ?? [])].forEach((r: any) => {
      if (r.company && typeof r.is_subcontractor === 'boolean') map[r.company.trim().toLowerCase()] = r.is_subcontractor
    })
    setCompanySuggestions(map)

    // pre-fill from the pre-start's structured labour/plant lists (preferred) if nothing's been entered yet for this day
    if (!haveExistingRows && prestart?.id) {
      const [{ data: prestartLabour }, { data: prestartPlant }] = await Promise.all([
        supabase.from('prestart_labour').select('*').eq('prestart_id', prestart.id).order('sort_order'),
        supabase.from('prestart_plant').select('*').eq('prestart_id', prestart.id).order('sort_order'),
      ])

      if (prestartLabour && prestartLabour.length > 0) {
        setLabour(prestartLabour.map((r: any) => ({
          person_name: r.person_name ?? '', company: r.company ?? '',
          is_subcontractor: r.is_subcontractor, role: r.role ?? '', hours: '', rate: '',
        })))
      } else if (prestart?.crew) {
        // fallback for older pre-starts saved before crew/plant were structured - one name per line, free text
        const nameCompany: Record<string, { company: string; is_subcontractor: boolean | null }> = {}
        ;(pastLabour ?? []).forEach((r: any) => {
          if (r.person_name) {
            nameCompany[r.person_name.trim().toLowerCase()] = {
              company: r.company ?? '',
              is_subcontractor: typeof r.is_subcontractor === 'boolean' ? r.is_subcontractor : null,
            }
          }
        })
        const crewLines = prestart.crew.split('\n').map((l: string) => l.trim()).filter(Boolean)
        if (crewLines.length) {
          setLabour(crewLines.map((name: string) => {
            const known = nameCompany[name.toLowerCase()]
            return {
              person_name: name, company: known?.company ?? '',
              is_subcontractor: known?.is_subcontractor ?? null, role: '', hours: '', rate: '',
            }
          }))
        }
      }

      if (prestartPlant && prestartPlant.length > 0) {
        setPlant(prestartPlant.map((r: any) => ({
          description: r.description ?? '', unit_id: '', company: r.company ?? '',
          is_subcontractor: r.is_subcontractor, hours: '', rate: '',
        })))
      }
    }

    const { data: pastAllocations } = await supabase
      .from('daily_allocations')
      .select('id, date')
      .eq('project_id', projectId)
      .neq('date', date)
      .order('date', { ascending: false })
      .limit(30)
    setPreviousAllocations(pastAllocations ?? [])

    setLoading(false)
  }

  async function copyFromPreviousAllocation(sourceId: string) {
    setCopyFromId(sourceId)
    if (!sourceId) return
    setCopying(true)
    try {
      const [{ data: l }, { data: p }, { data: m }] = await Promise.all([
        supabase.from('daily_labour').select('*').eq('allocation_id', sourceId).order('sort_order'),
        supabase.from('daily_plant').select('*').eq('allocation_id', sourceId).order('sort_order'),
        supabase.from('daily_materials').select('*').eq('allocation_id', sourceId).order('sort_order'),
      ])
      setLabour((l ?? []).map((r: any) => ({
        person_name: r.person_name ?? '', company: r.company ?? '',
        is_subcontractor: r.is_subcontractor, role: r.role ?? '',
        hours: '', rate: r.rate?.toString() ?? '',
      })))
      setPlant((p ?? []).map((r: any) => ({
        description: r.description ?? '', unit_id: r.unit_id ?? '', company: r.company ?? '',
        is_subcontractor: r.is_subcontractor, hours: '', rate: r.rate?.toString() ?? '',
      })))
      setMaterials((m ?? []).map((r: any) => ({
        material_name: r.material_name ?? '', unit: r.unit ?? '',
        quantity: '', rate: r.rate?.toString() ?? '',
      })))
    } finally {
      setCopying(false)
    }
  }

  function lookupSubcontractor(company: string): boolean | null {
    const key = company.trim().toLowerCase()
    return key in companySuggestions ? companySuggestions[key] : null
  }

  function addLabour() {
    setLabour([...labour, { person_name: '', company: '', is_subcontractor: null, role: '', hours: '', rate: '' }])
  }
  function addPlant() {
    setPlant([...plant, { description: '', unit_id: '', company: '', is_subcontractor: null, hours: '', rate: '' }])
  }
  function addMaterial() {
    setMaterials([...materials, { material_name: '', unit: '', quantity: '', rate: '' }])
  }

  function updateLabour(i: number, patch: Partial<LabourRow>) {
    setLabour(labour.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  }
  function updatePlant(i: number, patch: Partial<PlantRow>) {
    setPlant(plant.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  }
  function updateMaterial(i: number, patch: Partial<MaterialRow>) {
    setMaterials(materials.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  }

  function removeLabour(i: number) { setLabour(labour.filter((_, idx) => idx !== i)) }
  function removePlant(i: number) { setPlant(plant.filter((_, idx) => idx !== i)) }
  function removeMaterial(i: number) { setMaterials(materials.filter((_, idx) => idx !== i)) }

  async function save() {
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const { data: { user } } = await supabase.auth.getUser()

      let id = allocationId
      if (!id) {
        const { data: newAllocation, error: allocError } = await supabase
          .from('daily_allocations')
          .insert({ project_id: projectId, date, created_by: user?.id })
          .select('id')
          .single()
        if (allocError) throw new Error(allocError.message)
        id = newAllocation.id
        setAllocationId(id)
      }

      await Promise.all([
        supabase.from('daily_labour').delete().eq('allocation_id', id),
        supabase.from('daily_plant').delete().eq('allocation_id', id),
        supabase.from('daily_materials').delete().eq('allocation_id', id),
      ])

      const labourRows = labour.filter(r => r.person_name.trim()).map((r, i) => ({
        allocation_id: id,
        person_name: r.person_name,
        company: r.company || null,
        is_subcontractor: r.is_subcontractor,
        role: r.role || null,
        hours: r.hours ? parseFloat(r.hours) : null,
        rate: r.rate ? parseFloat(r.rate) : null,
        sort_order: i,
        notice_id: r.notice_id || null,
      }))
      const plantRows = plant.filter(r => r.description.trim()).map((r, i) => ({
        allocation_id: id,
        description: r.description,
        unit_id: r.unit_id || null,
        company: r.company || null,
        is_subcontractor: r.is_subcontractor,
        hours: r.hours ? parseFloat(r.hours) : null,
        rate: r.rate ? parseFloat(r.rate) : null,
        sort_order: i,
        notice_id: r.notice_id || null,
      }))
      const materialRows = materials.filter(r => r.material_name.trim()).map((r, i) => ({
        allocation_id: id,
        material_name: r.material_name,
        unit: r.unit || null,
        quantity: r.quantity ? parseFloat(r.quantity) : null,
        rate: r.rate ? parseFloat(r.rate) : null,
        sort_order: i,
        notice_id: r.notice_id || null,
      }))

      if (labourRows.length) await supabase.from('daily_labour').insert(labourRows)
      if (plantRows.length) await supabase.from('daily_plant').insert(plantRows)
      if (materialRows.length) await supabase.from('daily_materials').insert(materialRows)

      setSuccess('Saved')
    } catch (e: any) {
      setError(e.message ?? 'Save failed')
    }
    setSaving(false)
  }

  if (loading) return <LoadingPage message="Loading daily allocation..." />

  const rowStyle: React.CSSProperties = { display: 'grid', gap: 8, alignItems: 'center', marginBottom: 8 }

  return (
    <PageShell projectId={projectId} activeSection="allocations">
      <PageHeader
        title={`Daily Allocation - ${date}`}
        subtitle="Labour, plant and materials used on site this day"
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary" onClick={() => router.push(`/projects/${projectId}/allocations`)}>Back to Report</Button>
            <Button onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
          </div>
        }
      />
      <div style={{ padding: '24px 32px', maxWidth: 1060 }}>
        {previousAllocations.length > 0 && (
          <Card style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Copy From a Previous Day</div>
            <select
              value={copyFromId}
              onChange={e => copyFromPreviousAllocation(e.target.value)}
              disabled={copying}
              style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: `1px solid ${colors.border}`, fontSize: 13, fontFamily: 'inherit' }}
            >
              <option value="">Use pre-start pre-fill (or start blank)</option>
              {previousAllocations.map(a => (
                <option key={a.id} value={a.id}>
                  {new Date(a.date).toLocaleDateString('en-NZ', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
                </option>
              ))}
            </select>
            <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 6 }}>
              Useful when the same crew/plant has been on site for several days in a row - carries over names, companies, roles and rates; hours and quantities start blank for you to fill in today's figures.
            </div>
          </Card>
        )}

        {prestartNote && (
          <Card>
            <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>From this day's pre-start</div>
            <div style={{ fontSize: 13, color: colors.textSecondary }}>{prestartNote}</div>
          </Card>
        )}

        {error && <div style={{ marginTop: 16 }}><Alert variant="error">{error}</Alert></div>}
        {success && <div style={{ marginTop: 16 }}><Alert variant="success">{success}</Alert></div>}

        <Card style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Labour</div>
          {labour.length > 0 && <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 12 }}>Pre-filled from the pre-start's crew list - fill in hours and rate for each person.</div>}
          {labour.map((r, i) => (
            <div key={i} style={{ ...rowStyle, gridTemplateColumns: '1.4fr 1.2fr 0.9fr 1fr 0.7fr 0.7fr 1.1fr auto' }}>
              <Input value={r.person_name} onChange={(v: string) => updateLabour(i, { person_name: v })} placeholder="Name" />
              <Input
                value={r.company}
                onChange={(v: string) => {
                  const guess = lookupSubcontractor(v)
                  updateLabour(i, { company: v, is_subcontractor: guess !== null ? guess : r.is_subcontractor })
                }}
                placeholder="Company"
              />
              <Select
                value={r.is_subcontractor === null ? '' : r.is_subcontractor ? 'sub' : 'internal'}
                onChange={(v: string) => updateLabour(i, { is_subcontractor: v === '' ? null : v === 'sub' })}
                options={[{ value: '', label: '-' }, { value: 'internal', label: 'Internal' }, { value: 'sub', label: 'Subcontractor' }]}
              />
              <Input value={r.role} onChange={(v: string) => updateLabour(i, { role: v })} placeholder="Role/trade" />
              <Input value={r.hours} onChange={(v: string) => updateLabour(i, { hours: v })} placeholder="Hours" />
              <Input value={r.rate} onChange={(v: string) => updateLabour(i, { rate: v })} placeholder="Rate $/hr" />
              <Select
                value={r.notice_id ?? ''}
                onChange={(v: string) => updateLabour(i, { notice_id: v || null })}
                options={[{ value: '', label: 'No variation' }, ...ceNotices.map(n => ({ value: n.id, label: n.title }))]}
              />
              <Button variant="secondary" size="sm" onClick={() => removeLabour(i)}>Remove</Button>
            </div>
          ))}
          <Button variant="secondary" size="sm" onClick={addLabour}>+ Add person</Button>
        </Card>

        <Card style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Plant</div>
          {plant.length > 0 && <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 12 }}>Pre-filled from the pre-start's plant list - fill in hours and rate. Unit ID is optional but lets the reports tell two of the same machine apart (e.g. "EX01", "EX02").</div>}
          {plant.map((r, i) => (
            <div key={i} style={{ ...rowStyle, gridTemplateColumns: '1.3fr 0.7fr 1.1fr 0.9fr 0.7fr 0.7fr 1.1fr auto' }}>
              <Input value={r.description} onChange={(v: string) => updatePlant(i, { description: v })} placeholder="Plant / machine" />
              <Input value={r.unit_id} onChange={(v: string) => updatePlant(i, { unit_id: v })} placeholder="Unit ID" />
              <Input
                value={r.company}
                onChange={(v: string) => {
                  const guess = lookupSubcontractor(v)
                  updatePlant(i, { company: v, is_subcontractor: guess !== null ? guess : r.is_subcontractor })
                }}
                placeholder="Company"
              />
              <Select
                value={r.is_subcontractor === null ? '' : r.is_subcontractor ? 'sub' : 'internal'}
                onChange={(v: string) => updatePlant(i, { is_subcontractor: v === '' ? null : v === 'sub' })}
                options={[{ value: '', label: '-' }, { value: 'internal', label: 'Internal' }, { value: 'sub', label: 'Subcontractor' }]}
              />
              <Input value={r.hours} onChange={(v: string) => updatePlant(i, { hours: v })} placeholder="Hours" />
              <Input value={r.rate} onChange={(v: string) => updatePlant(i, { rate: v })} placeholder="Rate $/hr" />
              <Select
                value={r.notice_id ?? ''}
                onChange={(v: string) => updatePlant(i, { notice_id: v || null })}
                options={[{ value: '', label: 'No variation' }, ...ceNotices.map(n => ({ value: n.id, label: n.title }))]}
              />
              <Button variant="secondary" size="sm" onClick={() => removePlant(i)}>Remove</Button>
            </div>
          ))}
          <Button variant="secondary" size="sm" onClick={addPlant}>+ Add plant</Button>
        </Card>

        <Card style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>Materials</div>
          {materials.map((r, i) => (
            <div key={i} style={{ ...rowStyle, gridTemplateColumns: '1.6fr 0.8fr 0.8fr 0.8fr 1.1fr auto' }}>
              <Input value={r.material_name} onChange={(v: string) => updateMaterial(i, { material_name: v })} placeholder="Material" />
              <Input value={r.unit} onChange={(v: string) => updateMaterial(i, { unit: v })} placeholder="Unit" />
              <Input value={r.quantity} onChange={(v: string) => updateMaterial(i, { quantity: v })} placeholder="Quantity" />
              <Input value={r.rate} onChange={(v: string) => updateMaterial(i, { rate: v })} placeholder="Rate $/unit" />
              <Select
                value={r.notice_id ?? ''}
                onChange={(v: string) => updateMaterial(i, { notice_id: v || null })}
                options={[{ value: '', label: 'No variation' }, ...ceNotices.map(n => ({ value: n.id, label: n.title }))]}
              />
              <Button variant="secondary" size="sm" onClick={() => removeMaterial(i)}>Remove</Button>
            </div>
          ))}
          <Button variant="secondary" size="sm" onClick={addMaterial}>+ Add material</Button>
        </Card>
      </div>
    </PageShell>
  )
}
