'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { PageShell, PageHeader, Card, Button, Input, Textarea, Select, Alert, colors, LoadingPage, ProgressBar } from '@/components/ui'
import { AssigneePicker } from '@/components/assignee-picker'

interface ITP {
  id: string
  project_id: string
  organisation_id: string
  itp_number: string
  title: string
  work_description: string
  discipline: string
  status: string
  revision: string
  client: string
  engineer_name: string
  created_at: string
  assigned_to: string | null
}

interface ITPActivity {
  id: string
  itp_id: string
  section_name: string
  activity_number: string
  description: string
  responsibility: string
  requirements_reference: string
  conformance_criteria: string
  method: string
  frequency: string
  hold_witness_type: string
  attendance_required: string[]
  records_checklists: string
  sort_order: number
  is_complete: boolean
  status: string
}

interface Evidence {
  id: string
  itp_activity_id: string
  file_name: string
  file_url: string
  uploaded_at: string
  caption: string | null
}

interface Project {
  id: string
  name: string
}

interface EditableActivity {
  _key: number
  id?: string
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

const TYPE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  H: { bg: '#FDEAEA', text: '#B3261E', border: '#F5C6C6' },
  W: { bg: '#FFF3E0', text: '#B06A00', border: '#F6DDB0' },
  R: { bg: '#E8F0FE', text: '#1A56DB', border: '#C8DBFB' },
  S: { bg: '#F1F1EC', text: '#6B6B5F', border: '#DEDED4' },
}

function HWTBadge({ type }: { type: string }) {
  const tc = TYPE_COLORS[type] ?? TYPE_COLORS.S
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 24, height: 24, borderRadius: 5, fontSize: 11, fontWeight: 700,
      background: tc.bg, color: tc.text, border: `1px solid ${tc.border}`,
    }}>
      {type}
    </span>
  )
}

function groupBySection(activities: ITPActivity[]) {
  return activities.reduce<Record<string, ITPActivity[]>>((acc, act) => {
    const key = act.section_name || 'General'
    if (!acc[key]) acc[key] = []
    acc[key].push(act)
    return acc
  }, {})
}

function bumpRevision(rev: string) {
  const parts = (rev || '1.0').split('.')
  const last = parseInt(parts[parts.length - 1] || '0', 10)
  parts[parts.length - 1] = String((isNaN(last) ? 0 : last) + 1)
  return parts.join('.')
}

export default function ITPDetailPage() {
  const { id: projectId, itpId } = useParams<{ id: string; itpId: string }>()
  const router = useRouter()
  const supabase = createClient()

  const [itp, setItp] = useState<ITP | null>(null)
  const [activities, setActivities] = useState<ITPActivity[]>([])
  const [evidenceMap, setEvidenceMap] = useState<Record<string, Evidence[]>>({})
  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [assignedToName, setAssignedToName] = useState<string | null>(null)
  const [savingAssignee, setSavingAssignee] = useState(false)

  const [editing, setEditing] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editWorkDescription, setEditWorkDescription] = useState('')
  const [editDiscipline, setEditDiscipline] = useState('civil')
  const [editClient, setEditClient] = useState('watercare')
  const [editActivities, setEditActivities] = useState<EditableActivity[]>([])
  const [deletedActivityIds, setDeletedActivityIds] = useState<string[]>([])
  const [nextEditKey, setNextEditKey] = useState(0)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)

      const { data: itpData, error: itpErr } = await supabase
        .from('itps')
        .select('*')
        .eq('id', itpId)
        .single()

      if (itpErr || !itpData) {
        setError('ITP not found.')
        setLoading(false)
        return
      }
      setItp(itpData)

      if (itpData.assigned_to) {
        const { data: assignee } = await supabase.from('profiles').select('full_name').eq('id', itpData.assigned_to).single()
        setAssignedToName(assignee?.full_name ?? null)
      }

      const { data: actData, error: actErr } = await supabase
        .from('itp_activities')
        .select('*')
        .eq('itp_id', itpId)
        .order('sort_order', { ascending: true })

      if (actErr) {
        setError('Could not load activities.')
        setLoading(false)
        return
      }
      setActivities(actData ?? [])

      if (actData && actData.length > 0) {
        const { data: evData } = await supabase
          .from('itp_activity_evidence')
          .select('*')
          .in('itp_activity_id', actData.map(a => a.id))
        const map: Record<string, Evidence[]> = {}
        ;(evData ?? []).forEach(ev => {
          if (!map[ev.itp_activity_id]) map[ev.itp_activity_id] = []
          map[ev.itp_activity_id].push(ev)
        })
        setEvidenceMap(map)
      }

      const { data: projData } = await supabase
        .from('projects')
        .select('id, name')
        .eq('id', projectId)
        .single()

      setProject(projData)
      setLoading(false)
    }
    load()
  }, [itpId, projectId])

  async function assignTo(id: string, name: string) {
    setSavingAssignee(true)
    const { error: assignError } = await supabase.from('itps').update({ assigned_to: id }).eq('id', itpId)
    setSavingAssignee(false)
    if (assignError) { setError(assignError.message); return }
    setAssignedToName(name)
    setItp(prev => prev ? { ...prev, assigned_to: id } : prev)
  }

  async function unassign() {
    setSavingAssignee(true)
    const { error: assignError } = await supabase.from('itps').update({ assigned_to: null }).eq('id', itpId)
    setSavingAssignee(false)
    if (assignError) { setError(assignError.message); return }
    setAssignedToName(null)
    setItp(prev => prev ? { ...prev, assigned_to: null } : prev)
  }

  async function handleDelete() {
    if (!confirm('Delete this ITP? This cannot be undone.')) return
    await supabase.from('itp_activities').delete().eq('itp_id', itpId)
    await supabase.from('itp_qa_checklist').delete().eq('itp_id', itpId)
    const { error: delError } = await supabase.from('itps').delete().eq('id', itpId)
    if (delError) { setError(delError.message); return }
    router.push(`/projects/${projectId}`)
  }

  async function setActivityStatus(activityId: string, status: string) {
    const { data: { user } } = await supabase.auth.getUser()
    const update = status === 'complete'
      ? { status, is_complete: true, completed_by: user?.id, completed_at: new Date().toISOString() }
      : { status, is_complete: false, completed_by: null, completed_at: null }
    const { error: toggleError } = await supabase.from('itp_activities').update(update).eq('id', activityId)
    if (toggleError) { setError(toggleError.message); return }
    setActivities(prev => prev.map(a => a.id === activityId ? { ...a, ...update } : a))
  }

  async function uploadEvidence(activityId: string, files: FileList | null) {
    if (!files || files.length === 0) return
    const { data: { user } } = await supabase.auth.getUser()
    for (const file of Array.from(files)) {
      const path = `${activityId}/${Date.now()}-${file.name}`
      const { error: uploadError } = await supabase.storage.from('evidence').upload(path, file)
      if (uploadError) { setError(uploadError.message); continue }
      const { data: urlData } = supabase.storage.from('evidence').getPublicUrl(path)
      const { data: inserted, error: insertError } = await supabase
        .from('itp_activity_evidence')
        .insert({ itp_activity_id: activityId, file_name: file.name, file_url: urlData.publicUrl, uploaded_by: user?.id })
        .select('*')
        .single()
      if (insertError) { setError(insertError.message); continue }
      const caption = window.prompt('What is this a photo of? (optional - helps tell similar photos apart)')
      if (caption) {
        await supabase.from('itp_activity_evidence').update({ caption }).eq('id', inserted.id)
        inserted.caption = caption
      }
      setEvidenceMap(prev => ({ ...prev, [activityId]: [...(prev[activityId] ?? []), inserted] }))
    }
  }

  function startEditing() {
    if (!itp) return
    setEditTitle(itp.title || '')
    setEditWorkDescription(itp.work_description || '')
    setEditDiscipline(itp.discipline || 'civil')
    setEditClient(itp.client || 'watercare')
    const rows: EditableActivity[] = activities.map((a, i) => ({
      _key: i,
      id: a.id,
      section_name: a.section_name || '',
      activity_number: a.activity_number || '',
      description: a.description || '',
      responsibility: a.responsibility || '',
      requirements_reference: a.requirements_reference || '',
      conformance_criteria: a.conformance_criteria || '',
      method: a.method || '',
      frequency: a.frequency || '',
      hold_witness_type: a.hold_witness_type || 'S',
      attendance_required: Array.isArray(a.attendance_required) ? a.attendance_required.join(', ') : (a.attendance_required || ''),
      records_checklists: a.records_checklists || '',
    }))
    setEditActivities(rows)
    setNextEditKey(rows.length)
    setDeletedActivityIds([])
    setEditing(true)
  }

  function cancelEditing() {
    setEditing(false)
    setDeletedActivityIds([])
  }

  function updateEditActivity(key: number, field: keyof EditableActivity, value: string) {
    setEditActivities(prev => prev.map(a => a._key === key ? { ...a, [field]: value } : a))
  }

  function addEditActivity() {
    setEditActivities(prev => [...prev, {
      _key: nextEditKey,
      section_name: '', activity_number: '', description: '', responsibility: '',
      requirements_reference: '', conformance_criteria: '', method: '', frequency: '',
      hold_witness_type: 'S', attendance_required: '', records_checklists: '',
    }])
    setNextEditKey(k => k + 1)
  }

  function removeEditActivity(key: number) {
    const row = editActivities.find(a => a._key === key)
    if (row?.id) setDeletedActivityIds(prev => [...prev, row.id as string])
    setEditActivities(prev => prev.filter(a => a._key !== key))
  }

  async function saveEdits() {
    if (!itp) return
    setSavingEdit(true)
    setError(null)

    const newRevision = bumpRevision(itp.revision)
    const { error: updateItpError } = await supabase.from('itps').update({
      title: editTitle,
      work_description: editWorkDescription,
      discipline: editDiscipline,
      client: editClient,
      revision: newRevision,
    }).eq('id', itpId)
    if (updateItpError) { setError(updateItpError.message); setSavingEdit(false); return }

    if (deletedActivityIds.length > 0) {
      await supabase.from('itp_activities').delete().in('id', deletedActivityIds)
    }

    for (let i = 0; i < editActivities.length; i++) {
      const a = editActivities[i]
      const payload = {
        section_name: a.section_name || 'General',
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
      }
      if (a.id) {
        const { error: updActError } = await supabase.from('itp_activities').update(payload).eq('id', a.id)
        if (updActError) { setError(updActError.message); setSavingEdit(false); return }
      } else {
        const { error: insActError } = await supabase.from('itp_activities').insert({ ...payload, itp_id: itpId, is_complete: false, status: 'not_started' })
        if (insActError) { setError(insActError.message); setSavingEdit(false); return }
      }
    }

    setSavingEdit(false)
    setEditing(false)
    window.location.reload()
  }

  if (loading) return <LoadingPage />

  if (error || !itp) {
    return (
      <PageShell projectId={projectId as string} activeSection="quality">
        <div style={{ padding: 32 }}>
          <Alert variant="error">{error ?? 'Unknown error'}</Alert>
          <div style={{ marginTop: 16 }}>
            <Button variant="secondary" onClick={() => router.back()}>Go back</Button>
          </div>
        </div>
      </PageShell>
    )
  }

  const grouped = groupBySection(activities)
  const sections = Object.keys(grouped)

  return (
    <PageShell projectId={projectId as string} activeSection="quality">
      <PageHeader
        title={editing ? 'Editing ITP' : itp.title}
        subtitle={editing ? 'Make your changes, then save' : itp.work_description}
        breadcrumbs={[
          { label: project?.name ?? 'Project', href: `/projects/${projectId}` },
          { label: itp.itp_number },
        ]}
        actions={
          editing ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Button variant="secondary" onClick={cancelEditing} disabled={savingEdit}>Cancel</Button>
              <Button onClick={saveEdits} disabled={savingEdit}>{savingEdit ? 'Saving...' : 'Save Changes'}</Button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Button variant="secondary" onClick={startEditing}>Edit</Button>
              <Button variant="secondary" href={`/api/export/itp/${itpId}`} download>Export DOCX</Button>
              <Button variant="secondary" disabled>Export PDF (coming soon)</Button>
              <Button variant="danger" onClick={handleDelete}>Delete</Button>
            </div>
          )
        }
      />

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 32px' }}>

        {error && <Alert variant="error">{error}</Alert>}

        {!editing && (
          <Card style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <div>
                <div style={{ color: colors.textMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Assigned To</div>
                <div style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 8 }}>Who owns getting this ITP signed off</div>
              </div>
              <AssigneePicker
                organisationId={itp.organisation_id}
                currentName={assignedToName}
                onAssign={assignTo}
                onUnassign={unassign}
                disabled={savingAssignee}
              />
            </div>
          </Card>
        )}

        {editing ? (
          <Card style={{ marginTop: error ? 16 : 0, marginBottom: 20 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Input label="Title" required value={editTitle} onChange={setEditTitle} />
              <Textarea label="Work Description" rows={2} value={editWorkDescription} onChange={setEditWorkDescription} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <Select
                  label="Discipline"
                  value={editDiscipline}
                  onChange={setEditDiscipline}
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
                  value={editClient}
                  onChange={setEditClient}
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
        ) : (
          <Card padding={0} style={{ marginBottom: 20, overflow: 'hidden' }}>
            <div style={{ padding: '20px 24px', borderBottom: `1px solid ${colors.border}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ color: colors.textMuted, fontSize: 12, letterSpacing: '0.08em' }}>{itp.itp_number}</span>
                <span style={{ background: colors.accentSoft, color: colors.accentInk, fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4 }}>
                  {(itp.status || 'draft').toUpperCase()}
                </span>
                <span style={{ color: colors.textMuted, fontSize: 12 }}>Rev {itp.revision}</span>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)' }}>
              {[
                { label: 'Discipline', value: itp.discipline },
                { label: 'Client', value: itp.client },
                { label: 'Engineer', value: itp.engineer_name },
                { label: 'Created', value: new Date(itp.created_at).toLocaleDateString('en-NZ', { day: '2-digit', month: 'short', year: 'numeric' }) },
              ].map(({ label, value }) => (
                <div key={label} style={{ padding: '14px 20px', borderRight: `1px solid ${colors.border}` }}>
                  <div style={{ color: colors.textMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{label}</div>
                  <div style={{ color: colors.textPrimary, fontSize: 13, fontWeight: 500 }}>{value || '-'}</div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {!editing && (
          <Card style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: colors.textMuted, fontWeight: 600 }}>Completion</span>
              <span style={{ fontSize: 12, color: colors.textSecondary }}>
                {activities.filter(a => a.is_complete).length} of {activities.length} activities signed off
              </span>
            </div>
            <ProgressBar
              percent={activities.length > 0 ? Math.round((activities.filter(a => a.is_complete).length / activities.length) * 100) : 0}
              showLabel
            />
          </Card>
        )}

        {!editing && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', marginBottom: 20, fontSize: 12, color: colors.textSecondary }}>
            <span style={{ fontWeight: 600, color: colors.textPrimary }}>Hold/Witness:</span>
            {[
              { code: 'H', label: 'Hold Point' },
              { code: 'W', label: 'Witness Point' },
              { code: 'R', label: 'Review' },
              { code: 'S', label: 'Surveillance' },
            ].map(({ code, label }) => (
              <span key={code} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <HWTBadge type={code} />
                {label}
              </span>
            ))}
          </div>
        )}

        {editing ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary }}>Activity Line Items ({editActivities.length})</span>
              <Button size="sm" variant="secondary" onClick={addEditActivity}>+ Add Activity</Button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {editActivities.map((a, idx) => (
                <Card key={a._key}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: colors.textMuted }}>Activity {idx + 1}</span>
                    {editActivities.length > 1 && (
                      <Button size="sm" variant="ghost" onClick={() => removeEditActivity(a._key)}>Remove</Button>
                    )}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
                    <Input label="Section" value={a.section_name} onChange={v => updateEditActivity(a._key, 'section_name', v)} />
                    <Input label="Activity No." value={a.activity_number} onChange={v => updateEditActivity(a._key, 'activity_number', v)} />
                    <Select
                      label="Hold/Witness Type"
                      value={a.hold_witness_type}
                      onChange={v => updateEditActivity(a._key, 'hold_witness_type', v)}
                      options={[
                        { value: 'H', label: 'H - Hold Point' },
                        { value: 'W', label: 'W - Witness Point' },
                        { value: 'R', label: 'R - Review' },
                        { value: 'S', label: 'S - Surveillance' },
                      ]}
                    />
                  </div>
                  <Textarea label="Description" rows={2} value={a.description} onChange={v => updateEditActivity(a._key, 'description', v)} />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
                    <Input label="Responsibility" value={a.responsibility} onChange={v => updateEditActivity(a._key, 'responsibility', v)} />
                    <Input label="Requirements / Reference" value={a.requirements_reference} onChange={v => updateEditActivity(a._key, 'requirements_reference', v)} />
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <Textarea label="Conformance Criteria" rows={2} value={a.conformance_criteria} onChange={v => updateEditActivity(a._key, 'conformance_criteria', v)} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
                    <Input label="Method" value={a.method} onChange={v => updateEditActivity(a._key, 'method', v)} />
                    <Input label="Frequency" value={a.frequency} onChange={v => updateEditActivity(a._key, 'frequency', v)} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
                    <Input label="Attendance (comma separated)" value={a.attendance_required} onChange={v => updateEditActivity(a._key, 'attendance_required', v)} />
                    <Input label="Records / Checklists" value={a.records_checklists} onChange={v => updateEditActivity(a._key, 'records_checklists', v)} />
                  </div>
                </Card>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 20, marginBottom: 32 }}>
              <Button size="sm" variant="secondary" onClick={addEditActivity}>+ Add Activity</Button>
              <Button onClick={saveEdits} disabled={savingEdit}>{savingEdit ? 'Saving...' : 'Save Changes'}</Button>
            </div>
          </>
        ) : sections.length === 0 ? (
          <Card>
            <div style={{ padding: '32px 0', textAlign: 'center', color: colors.textMuted, fontSize: 13 }}>
              No activities found for this ITP.
            </div>
          </Card>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {sections.map(section => (
              <Card key={section} padding={0} style={{ overflow: 'hidden' }}>
                <div style={{ background: colors.accentInk, color: '#fff', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.7 }}>Section</span>
                  <span style={{ fontWeight: 700, fontSize: 13 }}>{section}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 11, opacity: 0.7 }}>
                    {grouped[section].length} {grouped[section].length === 1 ? 'activity' : 'activities'}
                  </span>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: colors.bg }}>
                        {['Done', 'No.', 'Activity / Description', 'Responsibility', 'Reference', 'Conformance Criteria', 'Method', 'Frequency', 'H/W', 'Records', 'Evidence'].map(h => (
                          <th key={h} style={{
                            textAlign: 'left', padding: '9px 12px', fontSize: 11, fontWeight: 600,
                            textTransform: 'uppercase', letterSpacing: '0.04em', color: colors.textMuted,
                            borderBottom: `1px solid ${colors.border}`, whiteSpace: 'nowrap',
                          }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {grouped[section].map((act) => (
                        <tr key={act.id} style={{ background: act.status === 'ncr_raised' ? '#FEF2F2' : act.status === 'in_progress' ? '#FFFBEB' : act.is_complete ? colors.accentSoft : 'transparent' }}>
                          <td style={{ padding: '10px 12px', borderBottom: `1px solid ${colors.border}`, verticalAlign: 'top' }}>
                            <select
                              value={act.status ?? (act.is_complete ? 'complete' : 'not_started')}
                              onChange={(e) => setActivityStatus(act.id, e.target.value)}
                              style={{ fontSize: 11, padding: '3px 5px', borderRadius: 5, border: `1px solid ${colors.border}`, cursor: 'pointer' }}
                            >
                              <option value="not_started">Not Started</option>
                              <option value="in_progress">In Progress</option>
                              <option value="complete">Complete</option>
                              <option value="ncr_raised">NCR Raised</option>
                            </select>
                          </td>
                          <td style={{ padding: '10px 12px', borderBottom: `1px solid ${colors.border}`, color: colors.textMuted, verticalAlign: 'top' }}>{act.activity_number}</td>
                          <td style={{ padding: '10px 12px', borderBottom: `1px solid ${colors.border}`, color: colors.textPrimary, fontWeight: 500, verticalAlign: 'top', lineHeight: 1.5 }}>{act.description}</td>
                          <td style={{ padding: '10px 12px', borderBottom: `1px solid ${colors.border}`, color: colors.textSecondary, verticalAlign: 'top' }}>{act.responsibility}</td>
                          <td style={{ padding: '10px 12px', borderBottom: `1px solid ${colors.border}`, color: colors.textMuted, fontSize: 11, verticalAlign: 'top' }}>{act.requirements_reference}</td>
                          <td style={{ padding: '10px 12px', borderBottom: `1px solid ${colors.border}`, color: colors.textSecondary, verticalAlign: 'top', lineHeight: 1.5 }}>{act.conformance_criteria}</td>
                          <td style={{ padding: '10px 12px', borderBottom: `1px solid ${colors.border}`, color: colors.textSecondary, verticalAlign: 'top' }}>{act.method}</td>
                          <td style={{ padding: '10px 12px', borderBottom: `1px solid ${colors.border}`, color: colors.textSecondary, verticalAlign: 'top' }}>{act.frequency}</td>
                          <td style={{ padding: '10px 12px', borderBottom: `1px solid ${colors.border}`, textAlign: 'center', verticalAlign: 'top' }}>
                            {act.hold_witness_type ? <HWTBadge type={act.hold_witness_type} /> : '-'}
                          </td>
                          <td style={{ padding: '10px 12px', borderBottom: `1px solid ${colors.border}`, color: colors.textMuted, fontSize: 11, verticalAlign: 'top' }}>{act.records_checklists}</td>
                          <td style={{ padding: '10px 12px', borderBottom: `1px solid ${colors.border}`, verticalAlign: 'top', minWidth: 140 }}>
                            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: colors.accentInk, cursor: 'pointer', fontWeight: 600 }}>
                              + Add
                              <input
                                type="file"
                                multiple
                                style={{ display: 'none' }}
                                onChange={(e) => uploadEvidence(act.id, e.target.files)}
                              />
                            </label>
                            {(evidenceMap[act.id] ?? []).length > 0 && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4 }}>
                                {(evidenceMap[act.id] ?? []).map(ev => (
                                  <div key={ev.id}>
                                    <a href={ev.file_url} target="_blank" rel="noreferrer" style={{ fontSize: 10, color: colors.primary, textDecoration: 'underline', wordBreak: 'break-all' }}>
                                      {ev.file_name}
                                    </a>
                                    <div style={{ fontSize: 9, color: colors.textMuted, marginTop: 1 }}>
                                      {new Date(ev.uploaded_at).toLocaleString()}{ev.caption ? ` \u00b7 ${ev.caption}` : ''}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            ))}
          </div>
        )}

        {!editing && (
          <div style={{ color: colors.textMuted, fontSize: 12, textAlign: 'center', marginTop: 32, paddingBottom: 32 }}>
            {activities.length} total activities across {sections.length} sections &middot; ITP {itp.itp_number} Rev {itp.revision} &middot; Generated {new Date(itp.created_at).toLocaleDateString('en-NZ')}
          </div>
        )}
      </div>
    </PageShell>
  )
}
