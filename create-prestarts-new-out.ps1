$newPage = @'
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

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 8,
  border: '1px solid ' + colors.border, fontSize: 13, fontFamily: 'inherit',
}
const labelStyle: React.CSSProperties = {
  fontSize: 13, fontWeight: 600, color: colors.textPrimary, marginBottom: 6, display: 'block',
}

export default function NewPrestartPage() {
  const router = useRouter()
  const params = useParams()
  const projectId = params.id as string
  const supabase = createClient()

  const [swmsOptions, setSwmsOptions] = useState<SwmsOption[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [crew, setCrew] = useState('')
  const [weather, setWeather] = useState('')
  const [swmsId, setSwmsId] = useState('')
  const [criticalRisks, setCriticalRisks] = useState('')
  const [siteLayoutFile, setSiteLayoutFile] = useState<File | null>(null)
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

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('swms').select('id, swms_number, title').eq('project_id', projectId).order('created_at', { ascending: false })
      setSwmsOptions(data ?? [])
    }
    load()
  }, [projectId])

  async function onSwmsChange(id: string) {
    setSwmsId(id)
    if (!id) { setCriticalRisks(''); return }
    const { data } = await supabase
      .from('swms_activities')
      .select('activity_description, hazards, control_measures, initial_risk_rating')
      .eq('swms_id', id)
      .in('initial_risk_rating', ['high', 'critical'])
      .order('sort_order', { ascending: true })

    const rows = data ?? []
    if (rows.length === 0) {
      setCriticalRisks('No high/critical rated activities found on the selected SWMS.')
      return
    }
    const text = rows.map((a: any) => {
      const hazardsText = (a.hazards ?? []).map((h: any) => h.description).filter(Boolean).join('; ')
      const controlsText = (a.control_measures ?? []).filter(Boolean).join('; ')
      return '[' + String(a.initial_risk_rating).toUpperCase() + '] ' + a.activity_description + '\nHazards: ' + hazardsText + '\nControls: ' + controlsText
    }).join('\n\n')
    setCriticalRisks(text)
  }

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

  async function handleSubmit() {
    setSaving(true)
    setError('')
    try {
      let siteLayoutUrl: string | null = null
      if (siteLayoutFile) {
        const path = projectId + '/' + Date.now() + '-' + siteLayoutFile.name
        const { error: uploadError } = await supabase.storage.from('evidence').upload(path, siteLayoutFile)
        if (uploadError) throw uploadError
        const { data: urlData } = supabase.storage.from('evidence').getPublicUrl(path)
        siteLayoutUrl = urlData.publicUrl
      }

      const { data: inserted, error: insertError } = await supabase
        .from('prestarts')
        .insert({
          project_id: projectId,
          date,
          crew: crew || null,
          weather: weather || null,
          swms_id: swmsId || null,
          critical_risks_snapshot: criticalRisks || null,
          site_layout_url: siteLayoutUrl,
          site_layout_notes: siteLayoutNotes || null,
          emergency_procedures: emergencyProcedures || null,
          nearest_medical_facility: nearestMedical || null,
          site_constraints: siteConstraints || null,
          simultaneous_operations: simops || null,
          notes: notes || null,
          signed_by: confirmSignOff ? signedBy : null,
          signed_at: confirmSignOff ? new Date().toISOString() : null,
        })
        .select('id')
        .single()
      if (insertError) throw insertError

      const permitRows = PERMIT_TYPES.map(type => ({
        prestart_id: inserted.id,
        permit_type: type,
        status: permits[type].status,
        reference: permits[type].reference || null,
        notes: permits[type].notes || null,
      }))
      const { error: permitsError } = await supabase.from('prestart_permits').insert(permitRows)
      if (permitsError) throw permitsError

      const deliveryRows = deliveries.filter(d => d.description.trim() !== '').map(d => ({
        prestart_id: inserted.id,
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

      router.push('/projects/' + projectId + '/prestarts/' + inserted.id)
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong')
      setSaving(false)
    }
  }

  return (
    <PageShell projectId={projectId} activeSection="prestarts">
      <PageHeader
        title="New Pre-Start"
        subtitle="Record today's briefing, permits and deliveries"
        actions={<Button onClick={handleSubmit} disabled={saving}>{saving ? 'Saving...' : 'Save Pre-Start'}</Button>}
      />

      <div style={{ padding: 32, display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 900 }}>
        {error && (
          <Card style={{ borderColor: colors.danger }}>
            <div style={{ color: colors.danger, fontSize: 13, padding: 4 }}>{error}</div>
          </Card>
        )}

        <Card>
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
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
            <div>
              <label style={labelStyle}>Crew / Attendees</label>
              <textarea value={crew} onChange={e => setCrew(e.target.value)} rows={3} placeholder="One name per line" style={{ ...inputStyle, resize: 'vertical' }} />
            </div>
          </div>
        </Card>

        <Card>
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={labelStyle}>Linked SWMS</label>
              <select value={swmsId} onChange={e => onSwmsChange(e.target.value)} style={inputStyle}>
                <option value="">None selected</option>
                {swmsOptions.map(s => (
                  <option key={s.id} value={s.id}>{s.swms_number} - {s.title}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Critical Risks (pulled from the linked SWMS - high/critical rated activities)</label>
              <textarea value={criticalRisks} onChange={e => setCriticalRisks(e.target.value)} rows={6} placeholder="Select a SWMS above to pull its critical risks, or enter manually" style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace', fontSize: 12 }} />
            </div>
          </div>
        </Card>

        <Card>
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={labelStyle}>Site Layout Plan</label>
              <input type="file" accept="image/*,.pdf" onChange={e => setSiteLayoutFile(e.target.files?.[0] ?? null)} style={inputStyle} />
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
              <label style={labelStyle}>Notes</label>
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
'@

Set-Content -LiteralPath 'src\app\projects\[id]\prestarts\new\page.tsx' -Value $newPage -Encoding UTF8
Write-Host "Written: prestarts\new\page.tsx (create form)" -ForegroundColor Green

Write-Host "`nPress Enter to close this window..." -ForegroundColor Cyan
Read-Host
