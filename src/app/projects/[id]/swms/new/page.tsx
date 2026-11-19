'use client'

import { useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  PageShell, PageHeader, Card, Button, Input, Textarea, Select,
  Badge, Alert, colors
} from '@/components/ui'

type RiskRating = 'low' | 'medium' | 'high' | 'critical'

interface Activity {
  step_number: string
  activity_description: string
  hazards: { description: string }[]
  initial_risk_rating: RiskRating
  control_measures: string[]
  residual_risk_rating: RiskRating
  responsible_person: string
  legislative_reference: string
}

interface HazardousSubstance {
  substance: string
  hazardous: boolean
  dangerous: boolean
  ppe_requirements: string
  hazards: string
  controls: string
}

const riskVariant: Record<string, any> = { low: 'green', medium: 'yellow', high: 'orange', critical: 'red' }

export default function NewSWMSPage() {
  const router = useRouter()
  const params = useParams()
  const projectId = params.id as string
  const supabase = createClient()

  const [step, setStep] = useState(1)
  const [workDescription, setWorkDescription] = useState('')
  const [discipline, setDiscipline] = useState('civil')
  const [clientType, setClientType] = useState('watercare')
  const [workLocation, setWorkLocation] = useState('')
  const [principalContractor, setPrincipalContractor] = useState('')
  const [additionalContext, setAdditionalContext] = useState('')
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [swmsNumber, setSwmsNumber] = useState('')
  const [title, setTitle] = useState('')
  const [ppe, setPpe] = useState<string[]>([])
  const [substances, setSubstances] = useState<HazardousSubstance[]>([])
  const [hazardIdentification, setHazardIdentification] = useState<Record<string, boolean>>({})
  const [activities, setActivities] = useState<Activity[]>([])
  const [emergencyResponse, setEmergencyResponse] = useState('')

  async function generate() {
    if (!workDescription) { setError('Please describe the work scope'); return }
    setGenerating(true)
    setError('')
    try {
      const response = await fetch('/api/swms/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workDescription, discipline, clientType, workLocation, additionalContext, principalContractor }),
      })
      const data = await response.json()
      const text = data.content?.[0]?.text || ''
      const clean = text.replace(/```json|```/g, '').trim()
      const parsed = JSON.parse(clean)
      setPpe(parsed.ppe ?? [])
      setSubstances(parsed.hazardous_substances ?? [])
      setHazardIdentification(parsed.hazard_identification ?? {})
      setActivities(parsed.activities ?? [])
      setEmergencyResponse(parsed.emergency_response ?? '')
      setTitle(workDescription.slice(0, 60))
      setSwmsNumber(`SWMS-${Date.now().toString().slice(-6)}`)
      setStep(2)
    } catch (e) {
      setError('Generation failed — check the API key has credits at platform.anthropic.com')
    }
    setGenerating(false)
  }

  async function saveSWMS() {
    setSaving(true)
    setError('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    const { data: profile } = await supabase.from('profiles').select('organisation_id').eq('id', user.id).single()

    const { data: swms, error: swmsError } = await supabase.from('swms').insert({
      project_id: projectId,
      organisation_id: profile?.organisation_id,
      swms_number: swmsNumber,
      title,
      work_description: workDescription,
      discipline,
      status: 'draft',
      revision: '1.0',
      client: clientType,
      work_location: workLocation || null,
      principal_contractor: principalContractor || null,
      site_supervisor: user.email,
      ppe_requirements: ppe,
      additional_sections: {
        hazardous_substances: substances,
        hazard_identification: hazardIdentification,
        emergency_response: emergencyResponse,
      },
    }).select('id').single()

    if (swmsError) { setError(swmsError.message); setSaving(false); return }

    const activityRows = activities.map((a, i) => ({
      swms_id: swms.id,
      step_number: a.step_number,
      activity_description: a.activity_description,
      hazards: a.hazards,
      initial_risk_rating: a.initial_risk_rating,
      control_measures: a.control_measures,
      residual_risk_rating: a.residual_risk_rating,
      responsible_person: a.responsible_person,
      legislative_reference: a.legislative_reference,
      sort_order: i,
    }))
    if (activityRows.length > 0) await supabase.from('swms_activities').insert(activityRows)

    router.push(`/projects/${projectId}`)
  }

  return (
    <PageShell projectId={projectId} activeSection="safety">
      {step === 1 && (
        <>
          <PageHeader
            title="Generate SWMS"
            subtitle="Describe the work scope and Claude will generate a draft SWMS"
            breadcrumbs={[{ label: 'Back', href: `/projects/${projectId}` }]}
          />
          <div style={{ padding: '32px', maxWidth: 640 }}>
            <Card>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {error && <Alert variant="error">{error}</Alert>}
                <Textarea
                  label="Work Description"
                  required
                  rows={4}
                  value={workDescription}
                  onChange={setWorkDescription}
                  placeholder="e.g. DN300 PVC-U stormwater pipeline installation in road corridor, approximately 420m including 8 precast manholes"
                />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <Select
                    label="Discipline"
                    value={discipline}
                    onChange={setDiscipline}
                    options={[
                      { value: 'civil', label: 'Civil' },
                      { value: 'pipeline', label: 'Pipeline' },
                      { value: 'structural', label: 'Structural' },
                      { value: 'mechanical', label: 'Mechanical' },
                      { value: 'electrical', label: 'Electrical' },
                      { value: 'geotechnical', label: 'Geotechnical' },
                    ]}
                  />
                  <Select
                    label="Client Type"
                    value={clientType}
                    onChange={setClientType}
                    options={[
                      { value: 'watercare', label: 'Watercare' },
                      { value: 'auckland_transport', label: 'Auckland Transport' },
                      { value: 'auckland_council', label: 'Auckland Council' },
                      { value: 'nzta', label: 'NZTA' },
                      { value: 'private', label: 'Private' },
                      { value: 'other', label: 'Other' },
                    ]}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <Input label="Work Location" value={workLocation} onChange={setWorkLocation} placeholder="e.g. Shaft 4, Mt Albert" />
                  <Input label="Principal Contractor" value={principalContractor} onChange={setPrincipalContractor} placeholder="e.g. GAJV" />
                </div>
                <Textarea
                  label="Additional Context (optional)"
                  rows={2}
                  value={additionalContext}
                  onChange={setAdditionalContext}
                  placeholder="e.g. Traffic management required, working adjacent to live services"
                />
                <Button onClick={generate} disabled={generating} size="lg" fullWidth>
                  {generating ? 'Claude is generating your SWMS...' : 'Generate SWMS with AI'}
                </Button>
              </div>
            </Card>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <PageHeader
            title="SWMS Draft — Review and Save"
            actions={
              <>
                <Button variant="secondary" size="sm" onClick={() => setStep(1)}>Regenerate</Button>
                <Button size="sm" onClick={saveSWMS} disabled={saving}>{saving ? 'Saving...' : 'Save SWMS'}</Button>
              </>
            }
          />
          <div style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 980 }}>
            {error && <Alert variant="error">{error}</Alert>}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 14 }}>
              <Input label="SWMS Number" value={swmsNumber} onChange={setSwmsNumber} />
              <Input label="Title" value={title} onChange={setTitle} />
            </div>

            <Card>
              <div style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary, marginBottom: 10 }}>PPE Required</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {ppe.map((item, i) => <Badge key={i} variant="blue">{item}</Badge>)}
              </div>
            </Card>

            {substances.length > 0 && (
              <Card>
                <div style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary, marginBottom: 10 }}>Hazardous Substances</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {substances.map((s, i) => (
                    <div key={i} style={{ fontSize: 13, color: colors.textSecondary, paddingBottom: 8, borderBottom: i < substances.length - 1 ? `1px solid ${colors.border}` : 'none' }}>
                      <strong style={{ color: colors.textPrimary }}>{s.substance}</strong> — {s.controls}
                    </div>
                  ))}
                </div>
              </Card>
            )}

            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary, marginBottom: 10 }}>
                Activities ({activities.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {activities.map((a, i) => (
                  <Card key={i}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary }}>{a.step_number}. {a.activity_description}</span>
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <Badge variant={riskVariant[a.initial_risk_rating] ?? 'grey'}>{a.initial_risk_rating}</Badge>
                        <span style={{ color: colors.textMuted, fontSize: 12 }}>→</span>
                        <Badge variant={riskVariant[a.residual_risk_rating] ?? 'grey'}>{a.residual_risk_rating}</Badge>
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: colors.textSecondary }}>
                      <strong>Controls:</strong> {a.control_measures?.join('; ')}
                    </div>
                    <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 4 }}>
                      {a.responsible_person} · {a.legislative_reference}
                    </div>
                  </Card>
                ))}
              </div>
            </div>

            {emergencyResponse && (
              <Card>
                <div style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary, marginBottom: 8 }}>Emergency Response</div>
                <div style={{ fontSize: 13, color: colors.textSecondary, lineHeight: 1.6 }}>{emergencyResponse}</div>
              </Card>
            )}
          </div>
        </>
      )}
    </PageShell>
  )
}
