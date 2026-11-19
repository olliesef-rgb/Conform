'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'
import { PageShell, PageHeader, Card, Button, Input, Textarea, Select, Alert, colors } from '@/components/ui'

interface ActivityRow {
  key: number
  section_name: string
  activity_number: string
  description: string
  responsibility: string
  requirements_reference: string
  conformance_criteria: string
  method: string
  frequency: string
  hold_witness_type: string
  attendance_required: string
  records_checklists: string
}

function blankActivity(key: number): ActivityRow {
  return {
    key,
    section_name: '',
    activity_number: '',
    description: '',
    responsibility: '',
    requirements_reference: '',
    conformance_criteria: '',
    method: '',
    frequency: '',
    hold_witness_type: 'S',
    attendance_required: '',
    records_checklists: '',
  }
}

export default function ManualITPPage() {
  const router = useRouter()
  const params = useParams()
  const projectId = params.id as string
  const supabase = createClient()

  const [itpNumber, setItpNumber] = useState('')
  const [title, setTitle] = useState('')
  const [workDescription, setWorkDescription] = useState('')
  const [discipline, setDiscipline] = useState('civil')
  const [clientType, setClientType] = useState('watercare')
  const [activities, setActivities] = useState<ActivityRow[]>([blankActivity(0)])
  const [nextKey, setNextKey] = useState(1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function updateActivity(key: number, field: keyof ActivityRow, value: string) {
    setActivities(prev => prev.map(a => a.key === key ? { ...a, [field]: value } : a))
  }

  function addActivity() {
    setActivities(prev => [...prev, blankActivity(nextKey)])
    setNextKey(k => k + 1)
  }

  function removeActivity(key: number) {
    setActivities(prev => prev.filter(a => a.key !== key))
  }

  async function saveITP() {
    if (!itpNumber || !title) { setError('ITP number and title are required'); return }
    setSaving(true)
    setError('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: profile } = await supabase.from('profiles').select('organisation_id').eq('id', user.id).single()
    const { data: itp, error: itpError } = await supabase.from('itps').insert({
      project_id: projectId,
      organisation_id: profile?.organisation_id,
      itp_number: itpNumber,
      title,
      work_description: workDescription,
      discipline,
      status: 'draft',
      revision: '1.0',
      client: clientType,
      engineer_name: user.email,
    }).select('id').single()
    if (itpError) { setError(itpError.message); setSaving(false); return }

    const activityRows = activities
      .filter(a => a.description.trim() !== '')
      .map((a, i) => ({
        itp_id: itp.id,
        section_name: a.section_name || 'General',
        section_order: 1,
        activity_number: a.activity_number || String(i + 1),
        description: a.description,
        responsibility: a.responsibility,
        requirements_reference: a.requirements_reference,
        conformance_criteria: a.conformance_criteria,
        method: a.method,
        frequency: a.frequency,
        hold_witness_type: a.hold_witness_type,
        attendance_required: a.attendance_required ? a.attendance_required.split(',').map(s => s.trim()) : [],
        records_checklists: a.records_checklists,
        sort_order: i,
        is_complete: false,
      }))

    if (activityRows.length > 0) {
      const { error: actError } = await supabase.from('itp_activities').insert(activityRows)
      if (actError) {
        setError(`ITP saved, but activities failed to save: ${actError.message}`)
        setSaving(false)
        return
      }
    }
    router.push(`/projects/${projectId}/itps/${itp.id}`)
  }

  return (
    <PageShell projectId={projectId} activeSection="quality">
      <PageHeader
        title="Manual ITP Entry"
        subtitle="Enter your own ITP and line items directly, no AI generation"
        breadcrumbs={[
          { label: 'Quality', href: `/projects/${projectId}/quality` },
          { label: 'Manual Entry' },
        ]}
        actions={<Button onClick={saveITP} disabled={saving}>{saving ? 'Saving...' : 'Save ITP'}</Button>}
      />

      <div style={{ padding: '24px 32px', maxWidth: 1100, margin: '0 auto' }}>
        {error && <Alert variant="error">{error}</Alert>}

        <Card style={{ marginTop: error ? 16 : 0, marginBottom: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Input label="ITP Number" required value={itpNumber} onChange={setItpNumber} placeholder="e.g. ITP-014" />
              <Input label="Title" required value={title} onChange={setTitle} placeholder="e.g. Soldier Pile Retaining Wall" />
            </div>
            <Textarea label="Work Description" rows={2} value={workDescription} onChange={setWorkDescription} placeholder="Optional summary of the work scope" />
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
          </div>
        </Card>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary }}>Activity Line Items ({activities.length})</span>
          <Button size="sm" variant="secondary" onClick={addActivity}>+ Add Activity</Button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {activities.map((a, idx) => (
            <Card key={a.key} style={{ position: 'relative' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: colors.textMuted }}>Activity {idx + 1}</span>
                {activities.length > 1 && (
                  <Button size="sm" variant="ghost" onClick={() => removeActivity(a.key)}>Remove</Button>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
                <Input label="Section" value={a.section_name} onChange={v => updateActivity(a.key, 'section_name', v)} placeholder="e.g. Preparation" />
                <Input label="Activity No." value={a.activity_number} onChange={v => updateActivity(a.key, 'activity_number', v)} placeholder="e.g. 1.1" />
                <Select
                  label="Hold/Witness Type"
                  value={a.hold_witness_type}
                  onChange={v => updateActivity(a.key, 'hold_witness_type', v)}
                  options={[
                    { value: 'H', label: 'H - Hold Point' },
                    { value: 'W', label: 'W - Witness Point' },
                    { value: 'R', label: 'R - Review' },
                    { value: 'S', label: 'S - Surveillance' },
                  ]}
                />
              </div>
              <Textarea label="Description" rows={2} value={a.description} onChange={v => updateActivity(a.key, 'description', v)} placeholder="What is being checked or done" />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
                <Input label="Responsibility" value={a.responsibility} onChange={v => updateActivity(a.key, 'responsibility', v)} placeholder="e.g. Site Engineer" />
                <Input label="Requirements / Reference" value={a.requirements_reference} onChange={v => updateActivity(a.key, 'requirements_reference', v)} placeholder="e.g. NZS 3109" />
              </div>
              <div style={{ marginTop: 12 }}>
                <Textarea label="Conformance Criteria" rows={2} value={a.conformance_criteria} onChange={v => updateActivity(a.key, 'conformance_criteria', v)} placeholder="What needs to be met" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
                <Input label="Method" value={a.method} onChange={v => updateActivity(a.key, 'method', v)} placeholder="e.g. Visual, Survey" />
                <Input label="Frequency" value={a.frequency} onChange={v => updateActivity(a.key, 'frequency', v)} placeholder="e.g. Each shift" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
                <Input label="Attendance (comma separated)" value={a.attendance_required} onChange={v => updateActivity(a.key, 'attendance_required', v)} placeholder="e.g. GAJV, S/C" />
                <Input label="Records / Checklists" value={a.records_checklists} onChange={v => updateActivity(a.key, 'records_checklists', v)} placeholder="e.g. ITP Check Sheet" />
              </div>
            </Card>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 20, marginBottom: 32 }}>
          <Button size="sm" variant="secondary" onClick={addActivity}>+ Add Activity</Button>
          <Button onClick={saveITP} disabled={saving}>{saving ? 'Saving...' : 'Save ITP'}</Button>
        </div>
      </div>
    </PageShell>
  )
}
