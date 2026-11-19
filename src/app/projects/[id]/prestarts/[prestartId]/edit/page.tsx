'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { PageShell, PageHeader, Card, Button, colors } from '@/components/ui'

const PERMIT_TYPES = [
  'Hot Works', 'Excavation', 'Confined Space', 'Working at Height',
  'Electrical Isolation', 'Lifting / Crane', 'Traffic Management', 'Other',
]

interface SwmsOption { id: string; swms_number: string; title: string }
interface DeliveryRow { supplier: string; description: string; expected_time: string; quantity: string; status: string }
interface PermitRow { status: string; reference: string; notes: string }
interface LabourRow { person_name: string; company: string; is_subcontractor: string; role: string }
interface PlantRow { description: string; company: string; is_subcontractor: string }

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 8,
  border: '1px solid ' + colors.border, fontSize: 13, fontFamily: 'inherit',
}
const labelStyle: React.CSSProperties = {
  fontSize: 13, fontWeight: 600, color: colors.textPrimary, marginBottom: 6, display: 'block',
}

export default function EditPrestartPage() {
  const router = useRouter()
  const params = useParams()
  const projectId = params.id as string
  const prestartId = params.prestartId as string
  const supabase = createClient()

  const [swmsOptions, setSwmsOptions] = useState<SwmsOption[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [date, setDate] = useState('')
  const [siteArea, setSiteArea] = useState('')
  const [weather, setWeather] = useState('')
  const [plannedWorks, setPlannedWorks] = useState('')
  const [nominatedSupervisor, setNominatedSupervisor] = useState('')
  const [nominatedFirstAiders, setNominatedFirstAiders] = useState('')
  const [selectedSwmsIds, setSelectedSwmsIds] = useState<string[]>([])
  const [criticalRisks, setCriticalRisks] = useState('')
  const [siteLayoutFile, setSiteLayoutFile] = useState<File | null>(null)
  const [existingSiteLayoutUrl, setExistingSiteLayoutUrl] = useState<string | null>(null)
  const [siteLayoutNotes, setSiteLayoutNotes] = useState('')
  const [emergencyProcedures, setEmergencyProcedures] = useState('')
  const [nearestMedical, setNearestMedical] = useState('')
  const [siteConstraints, setSiteConstraints] = useState('')
  const [simops, setSimops] = useState('')
  const [notes, setNotes] = useState('')
  const [signedBy, setSignedBy] = useState('')
  const [confirmSignOff, setConfirmSignOff] = useState(false)

  const [permits, setPermits] = useState<Record<string, PermitRow>>(
    Object.fromEntries(PERMIT_TYPES.map(t => [t, { status: 'not_required', reference: '', notes: '' }]))
  )
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([])
  const [labour, setLabour] = useState<LabourRow[]>([])
  const [plant, setPlant] = useState<PlantRow[]>([])

  async function rebuildCriticalRisks(ids: string[], options: SwmsOption[]) {
    if (ids.length === 0) { setCriticalRisks(''); return }
    const blocks: string[] = []
    for (const id of ids) {
      const swms = options.find(s => s.id === id)
      const label = swms ? (swms.swms_number + ' - ' + swms.title) : id

      const { data } = await supabase
        .from('swms_activities')
        .select('activity_description, hazards, control_measures, initial_risk_rating, residual_risk_rating')
        .eq('swms_id', id)
        .in('initial_risk_rating', ['high', 'critical'])
        .order('sort_order', { ascending: true })

      const rows = data ?? []
      let body: string
      if (rows.length === 0) {
        body = 'No activities were rated High/Critical before controls on this SWMS.'
      } else {
        body = rows.map((a: any) => {
          const hazardsText = (a.hazards ?? []).map((h: any) => h.description).filter(Boolean).join('; ')
          const controlsText = (a.control_measures ?? []).filter(Boolean).join('; ')
          return '[' + String(a.initial_risk_rating).toUpperCase() + ' -> residual ' + String(a.residual_risk_rating).toUpperCase() + '] ' + a.activity_description + '\nHazards: ' + hazardsText + '\nControls: ' + controlsText
        }).join('\n\n')
      }
      blocks.push('=== ' + label + ' ===\n' + body)
    }
    setCriticalRisks(blocks.join('\n\n'))
  }

  function toggleSwms(id: string) {
    const next = selectedSwmsIds.includes(id) ? selectedSwmsIds.filter(x => x !== id) : [...selectedSwmsIds, id]
    setSelectedSwmsIds(next)
    rebuildCriticalRisks(next, swmsOptions)
  }

  useEffect(() => {
    async function load() {
      const { data: swmsData } = await supabase.from('swms').select('id, swms_number, title').eq('project_id', projectId).order('created_at', { ascending: false })
      setSwmsOptions(swmsData ?? [])

      const { data: src } = await supabase.from('prestarts').select('*').eq('id', prestartId).single()
      if (!src) { setLoading(false); return }

      setDate(src.date ?? '')
      setSiteArea(src.site_area ?? '')
      setWeather(src.weather ?? '')
      setPlannedWorks(src.planned_works ?? '')
      setNominatedSupervisor(src.nominated_supervisor ?? '')
      setNominatedFirstAiders(src.nominated_first_aiders ?? '')
      setExistingSiteLayoutUrl(src.site_layout_url ?? null)
      setSiteLayoutNotes(src.site_layout_notes ?? '')
      setEmergencyProcedures(src.emergency_procedures ?? '')
      setNearestMedical(src.nearest_medical_facility ?? '')
      setSiteConstraints(src.site_constraints ?? '')
      setSimops(src.simultaneous_operations ?? '')
      setNotes(src.notes ?? '')
      setSignedBy(src.signed_by ?? '')
      setConfirmSignOff(!!src.signed_at)

      const { data: srcSwms } = await supabase.from('prestart_swms').select('swms_id').eq('prestart_id', prestartId)
      const swmsIds = ((srcSwms ?? []) as any[]).map(r => r.swms_id)
      setSelectedSwmsIds(swmsIds)
      // Use whatever critical-risk text was already saved rather than silently
      // recomputing it from the linked SWMS - someone may have hand-edited it,
      // and recomputing on every load would clobber that.
      setCriticalRisks(src.critical_risks_snapshot ?? '')

      const { data: srcPermits } = await supabase.from('prestart_permits').select('*').eq('prestart_id', prestartId)
      if (srcPermits && srcPermits.length > 0) {
        setPermits(prev => {
          const next = { ...prev }
          for (const p of srcPermits as any[]) {
            next[p.permit_type] = { status: p.status, reference: p.reference ?? '', notes: p.notes ?? '' }
          }
          return next
        })
      }

      const { data: srcDeliveries } = await supabase.from('prestart_deliveries').select('*').eq('prestart_id', prestartId)
      setDeliveries(((srcDeliveries ?? []) as any[]).map(d => ({
        supplier: d.supplier ?? '', description: d.description, expected_time: d.expected_time ?? '', quantity: d.quantity ?? '', status: d.status,
      })))

      const { data: srcLabour } = await supabase.from('prestart_labour').select('*').eq('prestart_id', prestartId).order('sort_order')
      setLabour(((srcLabour ?? []) as any[]).map(l => ({
        person_name: l.person_name ?? '', company: l.company ?? '',
        is_subcontractor: l.is_subcontractor === null ? '' : l.is_subcontractor ? 'sub' : 'internal',
        role: l.role ?? '',
      })))

      const { data: srcPlant } = await supabase.from('prestart_plant').select('*').eq('prestart_id', prestartId).order('sort_order')
      setPlant(((srcPlant ?? []) as any[]).map(p => ({
        description: p.description ?? '', company: p.company ?? '',
        is_subcontractor: p.is_subcontractor === null ? '' : p.is_subcontractor ? 'sub' : 'internal',
      })))

      setLoading(false)
    }
    load()
  }, [projectId, prestartId])

  function updatePermit(type: string, field: keyof PermitRow, value: string) {
    setPermits(prev => ({ ...prev, [type]: { ...prev[type], [field]: value } }))
  }

  function addDelivery() {
    setDeliveries(prev => [...prev, { supplier: '', description: '', expected_time: '', quantity: '', status: 'expected' }])
  }
  function updateDelivery(index: number, field: keyof DeliveryRow, value: string) {
    setDeliveries(prev => prev.map((d, i) => i === index ? { ...d, [field]: value } : d))
  }
  function removeDelivery(index: number) {
    setDeliveries(prev => prev.filter((_, i) => i !== index))
  }

  function addLabour() {
    setLabour(prev => [...prev, { person_name: '', company: '', is_subcontractor: '', role: '' }])
  }
  function updateLabour(index: number, field: keyof LabourRow, value: string) {
    setLabour(prev => prev.map((l, i) => i === index ? { ...l, [field]: value } : l))
  }
  function removeLabour(index: number) {
    setLabour(prev => prev.filter((_, i) => i !== index))
  }

  function addPlant() {
    setPlant(prev => [...prev, { description: '', company: '', is_subcontractor: '' }])
  }
  function updatePlant(index: number, field: keyof PlantRow, value: string) {
    setPlant(prev => prev.map((p, i) => i === index ? { ...p, [field]: value } : p))
  }
  function removePlant(index: number) {
    setPlant(prev => prev.filter((_, i) => i !== index))
  }

  async function handleSubmit() {
    setSaving(true)
    setError('')
    try {
      let siteLayoutUrl: string | null = existingSiteLayoutUrl
      if (siteLayoutFile) {
        const path = projectId + '/' + Date.now() + '-' + siteLayoutFile.name
        const { error: uploadError } = await supabase.storage.from('evidence').upload(path, siteLayoutFile)
        if (uploadError) throw uploadError
        const { data: urlData } = supabase.storage.from('evidence').getPublicUrl(path)
        siteLayoutUrl = urlData.publicUrl
      }

      const { error: updateError } = await supabase
        .from('prestarts')
        .update({
          date,
          site_area: siteArea || null,
          weather: weather || null,
          planned_works: plannedWorks || null,
          nominated_supervisor: nominatedSupervisor || null,
          nominated_first_aiders: nominatedFirstAiders || null,
          critical_risks_snapshot: criticalRisks || null,
          site_layout_url: siteLayoutUrl,
          site_layout_notes: siteLayoutNotes || null,
          emergency_procedures: emergencyProcedures || null,
          nearest_medical_facility: nearestMedical || null,
          site_constraints: siteConstraints || null,
          simultaneous_operations: simops || null,
          notes: notes || null,
          signed_by: confirmSignOff ? (signedBy || null) : null,
          signed_at: confirmSignOff ? new Date().toISOString() : null,
        })
        .eq('id', prestartId)
      if (updateError) throw updateError

      // The linked-record tables (SWMS links, permits, deliveries, crew, plant)
      // don't have a stable identity to diff against what's on screen - rows can be
      // freely added/removed/reordered in the form - so the simplest correct way to
      // save edits is to replace each table's rows for this prestart wholesale.
      const { error: delSwmsError } = await supabase.from('prestart_swms').delete().eq('prestart_id', prestartId)
      if (delSwmsError) throw delSwmsError
      if (selectedSwmsIds.length > 0) {
        const swmsLinkRows = selectedSwmsIds.map(id => ({ prestart_id: prestartId, swms_id: id }))
        const { error: swmsLinkError } = await supabase.from('prestart_swms').insert(swmsLinkRows)
        if (swmsLinkError) throw swmsLinkError
      }

      const { error: delPermitsError } = await supabase.from('prestart_permits').delete().eq('prestart_id', prestartId)
      if (delPermitsError) throw delPermitsError
      const permitRows = PERMIT_TYPES.map(type => ({
        prestart_id: prestartId,
        permit_type: type,
        status: permits[type].status,
        reference: permits[type].reference || null,
        notes: permits[type].notes || null,
      }))
      const { error: permitsError } = await supabase.from('prestart_permits').insert(permitRows)
      if (permitsError) throw permitsError

      const { error: delDeliveriesError } = await supabase.from('prestart_deliveries').delete().eq('prestart_id', prestartId)
      if (delDeliveriesError) throw delDeliveriesError
      const deliveryRows = deliveries.filter(d => d.description.trim() !== '').map(d => ({
        prestart_id: prestartId,
        supplier: d.supplier || null,
        description: d.description,
        expected_time: d.expected_time || null,
        quantity: d.quantity || null,
        status: d.status,
      }))
      if (deliveryRows.length > 0) {
        const { error: deliveriesError } = await supabase.from('prestart_deliveries').insert(deliveryRows)
        if (deliveriesError) throw deliveriesError
      }

      const { error: delLabourError } = await supabase.from('prestart_labour').delete().eq('prestart_id', prestartId)
      if (delLabourError) throw delLabourError
      const labourRows = labour.filter(l => l.person_name.trim() !== '').map((l, i) => ({
        prestart_id: prestartId,
        person_name: l.person_name,
        company: l.company || null,
        is_subcontractor: l.is_subcontractor === '' ? null : l.is_subcontractor === 'sub',
        role: l.role || null,
        sort_order: i,
      }))
      if (labourRows.length > 0) {
        const { error: labourError } = await supabase.from('prestart_labour').insert(labourRows)
        if (labourError) throw labourError
      }

      const { error: delPlantError } = await supabase.from('prestart_plant').delete().eq('prestart_id', prestartId)
      if (delPlantError) throw delPlantError
      const plantRows = plant.filter(p => p.description.trim() !== '').map((p, i) => ({
        prestart_id: prestartId,
        description: p.description,
        company: p.company || null,
        is_subcontractor: p.is_subcontractor === '' ? null : p.is_subcontractor === 'sub',
        sort_order: i,
      }))
      if (plantRows.length > 0) {
        const { error: plantError } = await supabase.from('prestart_plant').insert(plantRows)
        if (plantError) throw plantError
      }

      router.push('/projects/' + projectId + '/prestarts/' + prestartId)
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong')
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <PageShell projectId={projectId} activeSection="prestarts">
        <PageHeader title="Edit Pre-Start" />
        <div style={{ padding: 32 }}><Card><div style={{ padding: 20 }}>Loading...</div></Card></div>
      </PageShell>
    )
  }

  return (
    <PageShell projectId={projectId} activeSection="prestarts">
      <PageHeader
        title="Edit Pre-Start"
        subtitle="Update today's briefing, permits and deliveries"
        breadcrumbs={[
          { label: 'Pre-Starts', href: '/projects/' + projectId + '/prestarts' },
          { label: 'Edit' },
        ]}
        actions={<Button onClick={handleSubmit} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</Button>}
      />

      <div style={{ padding: 32, display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 900 }}>
        {error && (
          <Card style={{ borderColor: colors.danger }}>
            <div style={{ color: colors.danger, fontSize: 13, padding: 4 }}>{error}</div>
          </Card>
        )}

        <Card>
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={labelStyle}>Site / Area</label>
              <input type="text" value={siteArea} onChange={e => setSiteArea(e.target.value)} placeholder="e.g. Shaft 3 - Northern Pump Station" style={inputStyle} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label style={labelStyle}>Date</label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Weather</label>
                <input type="text" value={weather} onChange={e => setWeather(e.target.value)} placeholder="e.g. Fine, 18C, light wind" style={inputStyle} />
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: colors.textPrimary }}>Crew / Attendees</span>
              <Button size="sm" variant="secondary" onClick={addLabour}>+ Add Person</Button>
            </div>
            {labour.length === 0 ? (
              <span style={{ fontSize: 13, color: colors.textMuted }}>No crew added.</span>
            ) : labour.map((l, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 0.9fr auto', gap: 10, alignItems: 'center' }}>
                <input type="text" placeholder="Name" value={l.person_name} onChange={e => updateLabour(i, 'person_name', e.target.value)} style={inputStyle} />
                <input type="text" placeholder="Company" value={l.company} onChange={e => updateLabour(i, 'company', e.target.value)} style={inputStyle} />
                <input type="text" placeholder="Role/trade" value={l.role} onChange={e => updateLabour(i, 'role', e.target.value)} style={inputStyle} />
                <select value={l.is_subcontractor} onChange={e => updateLabour(i, 'is_subcontractor', e.target.value)} style={inputStyle}>
                  <option value="">-</option>
                  <option value="internal">Internal</option>
                  <option value="sub">Subcontractor</option>
                </select>
                <Button size="sm" variant="secondary" onClick={() => removeLabour(i)}>Remove</Button>
              </div>
            ))}
            <span style={{ fontSize: 12, color: colors.textMuted }}>Feeds directly into that day's labour tracking in Resourcing.</span>
          </div>
        </Card>

        <Card>
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: colors.textPrimary }}>Plant On Site</span>
              <Button size="sm" variant="secondary" onClick={addPlant}>+ Add Plant</Button>
            </div>
            {plant.length === 0 ? (
              <span style={{ fontSize: 13, color: colors.textMuted }}>No plant added.</span>
            ) : plant.map((p, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 0.9fr auto', gap: 10, alignItems: 'center' }}>
                <input type="text" placeholder="Plant / machine" value={p.description} onChange={e => updatePlant(i, 'description', e.target.value)} style={inputStyle} />
                <input type="text" placeholder="Company" value={p.company} onChange={e => updatePlant(i, 'company', e.target.value)} style={inputStyle} />
                <select value={p.is_subcontractor} onChange={e => updatePlant(i, 'is_subcontractor', e.target.value)} style={inputStyle}>
                  <option value="">-</option>
                  <option value="internal">Internal</option>
                  <option value="sub">Subcontractor</option>
                </select>
                <Button size="sm" variant="secondary" onClick={() => removePlant(i)}>Remove</Button>
              </div>
            ))}
            <span style={{ fontSize: 12, color: colors.textMuted }}>Feeds directly into that day's plant tracking in Resourcing.</span>
          </div>
        </Card>

        <Card>
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={labelStyle}>Planned Works Today</label>
              <textarea value={plannedWorks} onChange={e => setPlannedWorks(e.target.value)} rows={3} placeholder="Summary of the work planned for today" style={{ ...inputStyle, resize: 'vertical' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label style={labelStyle}>Nominated Supervisor</label>
                <input type="text" value={nominatedSupervisor} onChange={e => setNominatedSupervisor(e.target.value)} placeholder="Name" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Nominated First Aiders</label>
                <input type="text" value={nominatedFirstAiders} onChange={e => setNominatedFirstAiders(e.target.value)} placeholder="Name(s)" style={inputStyle} />
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={labelStyle}>Linked SWMS (select all that apply today)</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 220, overflowY: 'auto', border: '1px solid ' + colors.border, borderRadius: 8, padding: 10 }}>
                {swmsOptions.length === 0 ? (
                  <span style={{ fontSize: 13, color: colors.textMuted }}>No SWMS found for this project.</span>
                ) : swmsOptions.map(s => (
                  <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: colors.textSecondary }}>
                    <input type="checkbox" checked={selectedSwmsIds.includes(s.id)} onChange={() => toggleSwms(s.id)} />
                    {s.swms_number} - {s.title}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label style={labelStyle}>Critical Risks (pulled from each linked SWMS - activities rated High/Critical before controls, grouped by SWMS)</label>
              <textarea value={criticalRisks} onChange={e => setCriticalRisks(e.target.value)} rows={10} placeholder="Select one or more SWMS above to pull their critical risks, or enter manually" style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace', fontSize: 12 }} />
            </div>
          </div>
        </Card>

        <Card>
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={labelStyle}>Site Layout Plan</label>
              {existingSiteLayoutUrl && !siteLayoutFile && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, fontSize: 13 }}>
                  <a href={existingSiteLayoutUrl} target="_blank" rel="noreferrer" style={{ color: colors.accentInk }}>Using previously uploaded plan</a>
                  <Button size="sm" variant="secondary" onClick={() => setExistingSiteLayoutUrl(null)}>Remove</Button>
                </div>
              )}
              <input type="file" accept="image/*,.pdf" onChange={e => setSiteLayoutFile(e.target.files?.[0] ?? null)} style={inputStyle} />
              <span style={{ fontSize: 12, color: colors.textMuted }}>Choosing a file here replaces the plan above.</span>
            </div>
            <div>
              <label style={labelStyle}>Site Layout Notes</label>
              <textarea value={siteLayoutNotes} onChange={e => setSiteLayoutNotes(e.target.value)} rows={2} placeholder="Muster points, access routes, exclusion zones" style={{ ...inputStyle, resize: 'vertical' }} />
            </div>
          </div>
        </Card>

        <Card>
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={labelStyle}>Emergency Procedures</label>
              <textarea value={emergencyProcedures} onChange={e => setEmergencyProcedures(e.target.value)} rows={3} placeholder="Evacuation / muster process, who to call" style={{ ...inputStyle, resize: 'vertical' }} />
            </div>
            <div>
              <label style={labelStyle}>Nearest Medical Facility</label>
              <textarea value={nearestMedical} onChange={e => setNearestMedical(e.target.value)} rows={2} placeholder="Name, address, phone, distance" style={{ ...inputStyle, resize: 'vertical' }} />
            </div>
          </div>
        </Card>

        <Card>
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={labelStyle}>Site Constraints</label>
              <textarea value={siteConstraints} onChange={e => setSiteConstraints(e.target.value)} rows={2} placeholder="Access restrictions, working hours, noise limits" style={{ ...inputStyle, resize: 'vertical' }} />
            </div>
            <div>
              <label style={labelStyle}>Simultaneous Operations (SIMOPS)</label>
              <textarea value={simops} onChange={e => setSimops(e.target.value)} rows={2} placeholder="Other crews/trades working nearby today and how they interact" style={{ ...inputStyle, resize: 'vertical' }} />
            </div>
          </div>
        </Card>

        <Card>
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: colors.textPrimary }}>Permits Required Today</span>
            {PERMIT_TYPES.map(type => (
              <div key={type} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: colors.textSecondary }}>{type}</span>
                <select value={permits[type].status} onChange={e => updatePermit(type, 'status', e.target.value)} style={inputStyle}>
                  <option value="not_required">Not Required</option>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                </select>
                <input type="text" placeholder="Permit #" value={permits[type].reference} onChange={e => updatePermit(type, 'reference', e.target.value)} style={inputStyle} />
                <input type="text" placeholder="Notes" value={permits[type].notes} onChange={e => updatePermit(type, 'notes', e.target.value)} style={inputStyle} />
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: colors.textPrimary }}>Expected Site Deliveries</span>
              <Button size="sm" variant="secondary" onClick={addDelivery}>+ Add Delivery</Button>
            </div>
            {deliveries.length === 0 ? (
              <span style={{ fontSize: 13, color: colors.textMuted }}>No deliveries added.</span>
            ) : deliveries.map((d, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr 1fr 1fr auto', gap: 10, alignItems: 'center' }}>
                <input type="text" placeholder="Supplier" value={d.supplier} onChange={e => updateDelivery(i, 'supplier', e.target.value)} style={inputStyle} />
                <input type="text" placeholder="Description" value={d.description} onChange={e => updateDelivery(i, 'description', e.target.value)} style={inputStyle} />
                <input type="text" placeholder="Expected time" value={d.expected_time} onChange={e => updateDelivery(i, 'expected_time', e.target.value)} style={inputStyle} />
                <input type="text" placeholder="Quantity" value={d.quantity} onChange={e => updateDelivery(i, 'quantity', e.target.value)} style={inputStyle} />
                <select value={d.status} onChange={e => updateDelivery(i, 'status', e.target.value)} style={inputStyle}>
                  <option value="expected">Expected</option>
                  <option value="arrived">Arrived</option>
                  <option value="delayed">Delayed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
                <Button size="sm" variant="secondary" onClick={() => removeDelivery(i)}>Remove</Button>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={labelStyle}>Additional Notes</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
            </div>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: colors.textSecondary }}>
                <input type="checkbox" checked={confirmSignOff} onChange={e => setConfirmSignOff(e.target.checked)} />
                Pre-start briefing completed and confirmed
              </label>
              {confirmSignOff && (
                <input type="text" placeholder="Signed by" value={signedBy} onChange={e => setSignedBy(e.target.value)} style={{ ...inputStyle, width: 200 }} />
              )}
            </div>
          </div>
        </Card>
      </div>
    </PageShell>
  )
}
