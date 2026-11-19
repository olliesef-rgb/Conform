'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { PageShell, PageHeader, Card, Button, Input, Textarea, Select, Alert, colors, LoadingPage } from '@/components/ui'

interface SWMS {
  id: string
  project_id: string
  swms_number: string
  title: string
  work_description: string
  discipline: string
  status: string
  revision: string
  client: string
  work_location: string
  principal_contractor: string
  site_supervisor: string
  ppe_requirements: string[]
  created_at: string
}

interface SWMSActivity {
  id: string
  swms_id: string
  step_number: string
  activity_description: string
  hazards: { description: string }[]
  initial_risk_rating: string
  control_measures: string[]
  residual_risk_rating: string
  responsible_person: string
  legislative_reference: string
  sort_order: number
}

interface EditableActivity {
  _key: number
  id?: string
  step_number: string
  activity_description: string
  hazards: string
  initial_risk_rating: string
  control_measures: string
  residual_risk_rating: string
  responsible_person: string
  legislative_reference: string
}

interface SWMSRevision {
  id: string
  revision: string
  reason: string
  changed_by_email: string | null
  changed_at: string
  snapshot_before: any
  snapshot_after: any
}

interface SWMSSignon {
  id: string
  signed_name: string
  signed_company: string | null
  signed_at: string
}

const RISK_COLORS: Record<string, { bg: string; text: string }> = {
  low:      { bg: '#E3F3DC', text: '#2F6B1F' },
  medium:   { bg: '#FFF3C4', text: '#8A6300' },
  high:     { bg: '#FBDADA', text: '#B3261E' },
  critical: { bg: '#F6BBBB', text: '#8C1818' },
}

const RISK_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
]

const SWMS_FIELD_LABELS: Record<string, string> = {
  title: 'Title',
  work_description: 'Work Description',
  discipline: 'Discipline',
  work_location: 'Work Location',
  principal_contractor: 'Principal Contractor',
  ppe_requirements: 'PPE Requirements',
}

function bumpRevision(rev: string) {
  const parts = (rev || '1.0').split('.')
  const last = parseInt(parts[parts.length - 1] || '0', 10)
  parts[parts.length - 1] = String((isNaN(last) ? 0 : last) + 1)
  return parts.join('.')
}

function fieldDiffs(before: any, after: any) {
  const changes: string[] = []
  if (!before || !after) return changes
  for (const key of Object.keys(SWMS_FIELD_LABELS)) {
    const b = Array.isArray(before[key]) ? before[key].join(', ') : (before[key] ?? '')
    const a = Array.isArray(after[key]) ? after[key].join(', ') : (after[key] ?? '')
    if (b !== a) changes.push(`${SWMS_FIELD_LABELS[key]}: "${b || '-'}" -> "${a || '-'}"`)
  }
  return changes
}

export default function SWMSDetailPage() {
  const { id: projectId, swmsId } = useParams<{ id: string; swmsId: string }>()
  const router = useRouter()
  const supabase = createClient()

  const [swms, setSwms] = useState<SWMS | null>(null)
  const [activities, setActivities] = useState<SWMSActivity[]>([])
  const [projectName, setProjectName] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [editing, setEditing] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)
  const [showReasonPrompt, setShowReasonPrompt] = useState(false)
  const [editReason, setEditReason] = useState('')
  const [editTitle, setEditTitle] = useState('')
  const [editWorkDescription, setEditWorkDescription] = useState('')
  const [editDiscipline, setEditDiscipline] = useState('')
  const [editWorkLocation, setEditWorkLocation] = useState('')
  const [editPrincipalContractor, setEditPrincipalContractor] = useState('')
  const [editPpe, setEditPpe] = useState('')
  const [editActivities, setEditActivities] = useState<EditableActivity[]>([])
  const [deletedActivityIds, setDeletedActivityIds] = useState<string[]>([])
  const [nextEditKey, setNextEditKey] = useState(0)

  const [revisions, setRevisions] = useState<SWMSRevision[]>([])
  const [showHistory, setShowHistory] = useState(false)

  const [signons, setSignons] = useState<SWMSSignon[]>([])
  const [showSignForm, setShowSignForm] = useState(false)
  const [signName, setSignName] = useState('')
  const [signCompany, setSignCompany] = useState('')
  const [signConfirmed, setSignConfirmed] = useState(false)
  const [signing, setSigning] = useState(false)

  useEffect(() => {
    async function load() {
      setLoading(true)

      const { data: swmsData, error: swmsErr } = await supabase
        .from('swms').select('*').eq('id', swmsId).single()

      if (swmsErr || !swmsData) { setError('SWMS not found.'); setLoading(false); return }
      setSwms(swmsData)

      const { data: actData } = await supabase
        .from('swms_activities').select('*').eq('swms_id', swmsId).order('sort_order', { ascending: true })
      setActivities(actData ?? [])

      const { data: proj } = await supabase
        .from('projects').select('name').eq('id', projectId).single()
      setProjectName(proj?.name ?? 'Project')

      const { data: revData } = await supabase
        .from('swms_revisions').select('*').eq('swms_id', swmsId).order('changed_at', { ascending: false })
      setRevisions(revData ?? [])

      const { data: signData } = await supabase
        .from('swms_signons').select('*').eq('swms_id', swmsId).eq('revision', swmsData.revision).order('signed_at', { ascending: false })
      setSignons(signData ?? [])

      setLoading(false)
    }
    load()
  }, [swmsId, projectId])

  async function handleDelete() {
    if (!confirm('Delete this SWMS? This cannot be undone.')) return
    await supabase.from('swms_activities').delete().eq('swms_id', swmsId)
    const { error: delError } = await supabase.from('swms').delete().eq('id', swmsId)
    if (delError) { setError(delError.message); return }
    router.push(`/projects/${projectId}`)
  }

  function startEditing() {
    if (!swms) return
    setEditTitle(swms.title || '')
    setEditWorkDescription(swms.work_description || '')
    setEditDiscipline(swms.discipline || '')
    setEditWorkLocation(swms.work_location || '')
    setEditPrincipalContractor(swms.principal_contractor || '')
    setEditPpe(Array.isArray(swms.ppe_requirements) ? swms.ppe_requirements.join(', ') : '')
    const rows: EditableActivity[] = activities.map((a, i) => ({
      _key: i,
      id: a.id,
      step_number: a.step_number || String(i + 1),
      activity_description: a.activity_description || '',
      hazards: Array.isArray(a.hazards) ? a.hazards.map(h => typeof h === 'string' ? h : h.description).join('\n') : '',
      initial_risk_rating: a.initial_risk_rating || 'medium',
      control_measures: Array.isArray(a.control_measures) ? a.control_measures.join('\n') : '',
      residual_risk_rating: a.residual_risk_rating || 'low',
      responsible_person: a.responsible_person || '',
      legislative_reference: a.legislative_reference || '',
    }))
    setEditActivities(rows)
    setNextEditKey(rows.length)
    setDeletedActivityIds([])
    setShowReasonPrompt(false)
    setEditReason('')
    setEditing(true)
  }

  function cancelEditing() {
    setEditing(false)
    setShowReasonPrompt(false)
    setEditReason('')
    setDeletedActivityIds([])
  }

  function updateEditActivity(key: number, field: keyof EditableActivity, value: string) {
    setEditActivities(prev => prev.map(a => a._key === key ? { ...a, [field]: value } : a))
  }

  function addEditActivity() {
    setEditActivities(prev => [...prev, {
      _key: nextEditKey,
      step_number: String(prev.length + 1),
      activity_description: '', hazards: '', initial_risk_rating: 'medium',
      control_measures: '', residual_risk_rating: 'low', responsible_person: '', legislative_reference: '',
    }])
    setNextEditKey(k => k + 1)
  }

  function removeEditActivity(key: number) {
    const row = editActivities.find(a => a._key === key)
    if (row?.id) setDeletedActivityIds(prev => [...prev, row.id as string])
    setEditActivities(prev => prev.filter(a => a._key !== key))
  }

  function requestSave() {
    setError(null)
    setShowReasonPrompt(true)
  }

  async function saveEdits() {
    if (!swms) return
    if (!editReason.trim()) { setError('Please enter a reason for this change before saving.'); return }
    setSavingEdit(true)
    setError(null)

    const { data: userData } = await supabase.auth.getUser()
    const user = userData?.user

    const newRevision = bumpRevision(swms.revision)

    const snapshotBefore = {
      swms: {
        title: swms.title,
        work_description: swms.work_description,
        discipline: swms.discipline,
        work_location: swms.work_location,
        principal_contractor: swms.principal_contractor,
        ppe_requirements: swms.ppe_requirements,
        revision: swms.revision,
      },
      activities: activities.map(a => ({
        step_number: a.step_number,
        activity_description: a.activity_description,
        hazards: a.hazards,
        initial_risk_rating: a.initial_risk_rating,
        control_measures: a.control_measures,
        residual_risk_rating: a.residual_risk_rating,
        responsible_person: a.responsible_person,
        legislative_reference: a.legislative_reference,
      })),
    }

    const newPpe = editPpe ? editPpe.split(',').map(s => s.trim()).filter(Boolean) : []

    const { error: updateSwmsError } = await supabase.from('swms').update({
      title: editTitle,
      work_description: editWorkDescription,
      discipline: editDiscipline,
      work_location: editWorkLocation,
      principal_contractor: editPrincipalContractor,
      ppe_requirements: newPpe,
      revision: newRevision,
    }).eq('id', swmsId)
    if (updateSwmsError) { setError(updateSwmsError.message); setSavingEdit(false); return }

    if (deletedActivityIds.length > 0) {
      await supabase.from('swms_activities').delete().in('id', deletedActivityIds)
    }

    for (let i = 0; i < editActivities.length; i++) {
      const a = editActivities[i]
      const payload = {
        step_number: a.step_number || String(i + 1),
        activity_description: a.activity_description,
        hazards: a.hazards ? a.hazards.split('\n').map(s => s.trim()).filter(Boolean) : [],
        initial_risk_rating: a.initial_risk_rating,
        control_measures: a.control_measures ? a.control_measures.split('\n').map(s => s.trim()).filter(Boolean) : [],
        residual_risk_rating: a.residual_risk_rating,
        responsible_person: a.responsible_person,
        legislative_reference: a.legislative_reference,
        sort_order: i,
      }
      if (a.id) {
        const { error: updActError } = await supabase.from('swms_activities').update(payload).eq('id', a.id)
        if (updActError) { setError(updActError.message); setSavingEdit(false); return }
      } else {
        const { error: insActError } = await supabase.from('swms_activities').insert({ ...payload, swms_id: swmsId })
        if (insActError) { setError(insActError.message); setSavingEdit(false); return }
      }
    }

    const snapshotAfter = {
      swms: {
        title: editTitle,
        work_description: editWorkDescription,
        discipline: editDiscipline,
        work_location: editWorkLocation,
        principal_contractor: editPrincipalContractor,
        ppe_requirements: newPpe,
        revision: newRevision,
      },
      activities: editActivities.map(a => ({
        step_number: a.step_number,
        activity_description: a.activity_description,
        hazards: a.hazards ? a.hazards.split('\n').map(s => s.trim()).filter(Boolean) : [],
        initial_risk_rating: a.initial_risk_rating,
        control_measures: a.control_measures ? a.control_measures.split('\n').map(s => s.trim()).filter(Boolean) : [],
        residual_risk_rating: a.residual_risk_rating,
        responsible_person: a.responsible_person,
        legislative_reference: a.legislative_reference,
      })),
    }

    const { error: revError } = await supabase.from('swms_revisions').insert({
      swms_id: swmsId,
      revision: newRevision,
      reason: editReason,
      changed_by: user?.id ?? null,
      changed_by_email: user?.email ?? null,
      snapshot_before: snapshotBefore,
      snapshot_after: snapshotAfter,
    })
    if (revError) console.error('Failed to log revision history:', revError)

    setSavingEdit(false)
    setEditing(false)
    setShowReasonPrompt(false)
    setEditReason('')
    window.location.reload()
  }

  async function signOn() {
    if (!swms) return
    if (!signName.trim()) { setError('Please enter your name to sign on.'); return }
    if (!signConfirmed) { setError('Please confirm you have read and understood this SWMS before signing.'); return }
    setSigning(true)
    setError(null)

    const { data: userData } = await supabase.auth.getUser()
    const user = userData?.user

    const { error: signError } = await supabase.from('swms_signons').insert({
      swms_id: swmsId,
      revision: swms.revision,
      signed_name: signName,
      signed_company: signCompany || null,
      signed_by: user?.id ?? null,
    })
    if (signError) { setError(signError.message); setSigning(false); return }

    const { data: signData } = await supabase
      .from('swms_signons').select('*').eq('swms_id', swmsId).eq('revision', swms.revision).order('signed_at', { ascending: false })
    setSignons(signData ?? [])
    setSignName('')
    setSignCompany('')
    setSignConfirmed(false)
    setSigning(false)
    setShowSignForm(false)
  }

  if (loading) return <LoadingPage />

  if (error && !swms) {
    return (
      <PageShell projectId={projectId as string} activeSection="safety">
        <div style={{ padding: 32 }}>
          <Alert variant="error">{error}</Alert>
          <div style={{ marginTop: 16 }}>
            <Button variant="secondary" onClick={() => router.back()}>Go back</Button>
          </div>
        </div>
      </PageShell>
    )
  }

  if (!swms) return null

  const ppe = Array.isArray(swms.ppe_requirements) ? swms.ppe_requirements : []

  return (
    <PageShell projectId={projectId as string} activeSection="safety">
      <PageHeader
        title={editing ? 'Editing SWMS' : swms.title}
        subtitle={editing ? 'Make your changes, then save' : swms.work_description}
        breadcrumbs={[
          { label: projectName, href: `/projects/${projectId}` },
          { label: swms.swms_number },
        ]}
        actions={
          editing ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Button variant="secondary" onClick={cancelEditing} disabled={savingEdit}>Cancel</Button>
              <Button onClick={requestSave} disabled={savingEdit}>{savingEdit ? 'Saving...' : 'Save Changes'}</Button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Button variant="secondary" onClick={startEditing}>Edit</Button>
              <a
                href={`/api/export/swms/${swmsId}`}
                download
                style={{
                  background: colors.accentInk, color: '#fff', border: 'none', borderRadius: 999,
                  padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  textDecoration: 'none', display: 'inline-flex', alignItems: 'center'
                }}
              >
                Export DOCX
              </a>
              <Button variant="danger" onClick={handleDelete}>Delete</Button>
            </div>
          )
        }
      />

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 32px' }}>

        {error && <Alert variant="error">{error}</Alert>}

        {showReasonPrompt && (
          <Card style={{ marginTop: error ? 16 : 0, marginBottom: 24, border: `1px solid ${colors.accentInk}` }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary, marginBottom: 8 }}>
              Reason for this change
            </div>
            <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 12 }}>
              Required. This is recorded in the revision history (e.g. "Incident #4 closeout - added fall arrest control").
            </div>
            <Textarea rows={2} value={editReason} onChange={setEditReason} placeholder="Why is this SWMS being changed?" />
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <Button variant="secondary" onClick={() => setShowReasonPrompt(false)} disabled={savingEdit}>Back</Button>
              <Button onClick={saveEdits} disabled={savingEdit || !editReason.trim()}>{savingEdit ? 'Saving...' : 'Confirm & Save'}</Button>
            </div>
          </Card>
        )}

        {editing ? (
          <Card style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Input label="Title" required value={editTitle} onChange={setEditTitle} />
              <Textarea label="Work Description" rows={2} value={editWorkDescription} onChange={setEditWorkDescription} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <Input label="Discipline" value={editDiscipline} onChange={setEditDiscipline} />
                <Input label="Work Location" value={editWorkLocation} onChange={setEditWorkLocation} />
              </div>
              <Input label="Principal Contractor" value={editPrincipalContractor} onChange={setEditPrincipalContractor} />
              <Input label="PPE Requirements (comma separated)" value={editPpe} onChange={setEditPpe} placeholder="e.g. Hard hat, Hi-vis, Safety boots" />
            </div>
          </Card>
        ) : (
          <>
            <Card padding={0} style={{ marginBottom: 24, overflow: 'hidden' }}>
              <div style={{ padding: '20px 24px', borderBottom: `1px solid ${colors.border}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <span style={{ color: colors.textMuted, fontSize: 12, letterSpacing: '0.08em' }}>{swms.swms_number}</span>
                  <span style={{ background: colors.accentSoft, color: colors.accentInk, fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4 }}>{(swms.status || 'draft').toUpperCase()}</span>
                  <span style={{ color: colors.textMuted, fontSize: 12 }}>Rev {swms.revision}</span>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)' }}>
                {[
                  { label: 'Discipline', value: swms.discipline },
                  { label: 'Work Location', value: swms.work_location },
                  { label: 'Principal Contractor', value: swms.principal_contractor },
                  { label: 'Created', value: new Date(swms.created_at).toLocaleDateString('en-NZ') },
                ].map(({ label, value }) => (
                  <div key={label} style={{ padding: '14px 20px', borderRight: `1px solid ${colors.border}` }}>
                    <div style={{ color: colors.textMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{label}</div>
                    <div style={{ color: colors.textPrimary, fontSize: 13, fontWeight: 500 }}>{value || '-'}</div>
                  </div>
                ))}
              </div>
            </Card>

            {ppe.length > 0 && (
              <Card style={{ marginBottom: 24 }}>
                <div style={{ color: colors.textMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>PPE Requirements</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {ppe.map((item, i) => (
                    <span key={i} style={{ background: colors.accentSoft, color: colors.accentInk, fontSize: 12, padding: '4px 10px', borderRadius: 999, border: `1px solid ${colors.border}` }}>{item}</span>
                  ))}
                </div>
              </Card>
            )}

            <Card padding={0} style={{ marginBottom: 24, overflow: 'hidden' }}>
              <div
                onClick={() => setShowHistory(s => !s)}
                style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
              >
                <span style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary }}>
                  Revision History ({revisions.length})
                </span>
                <span style={{ fontSize: 12, color: colors.textMuted }}>{showHistory ? 'Hide' : 'Show'}</span>
              </div>
              {showHistory && (
                revisions.length === 0 ? (
                  <div style={{ padding: '0 20px 16px', fontSize: 12, color: colors.textMuted }}>
                    No edits logged yet. Changes made via Edit will appear here with the reason given.
                  </div>
                ) : (
                  <div style={{ borderTop: `1px solid ${colors.border}` }}>
                    {revisions.map(rev => {
                      const changes = fieldDiffs(rev.snapshot_before?.swms, rev.snapshot_after?.swms)
                      const actBefore = rev.snapshot_before?.activities?.length ?? 0
                      const actAfter = rev.snapshot_after?.activities?.length ?? 0
                      return (
                        <div key={rev.id} style={{ padding: '14px 20px', borderBottom: `1px solid ${colors.border}` }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                            <span style={{ fontWeight: 600, fontSize: 13, color: colors.textPrimary }}>Rev {rev.revision}</span>
                            <span style={{ fontSize: 12, color: colors.textMuted }}>{new Date(rev.changed_at).toLocaleString('en-NZ')}</span>
                          </div>
                          <div style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 6 }}>{rev.changed_by_email || 'Unknown user'}</div>
                          <div style={{ fontSize: 12, color: colors.textPrimary, fontStyle: 'italic', marginBottom: 8 }}>&quot;{rev.reason}&quot;</div>
                          {changes.length > 0 && (
                            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: colors.textSecondary, display: 'flex', flexDirection: 'column', gap: 2 }}>
                              {changes.map((c, i) => <li key={i}>{c}</li>)}
                            </ul>
                          )}
                          {actBefore !== actAfter && (
                            <div style={{ fontSize: 12, color: colors.textSecondary, marginTop: 4 }}>Activities: {actBefore} -&gt; {actAfter}</div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              )}
            </Card>

            <Card padding={0} style={{ marginBottom: 24, overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${colors.border}` }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary }}>
                    Sign-On ({signons.length} signed to Rev {swms.revision})
                  </div>
                  <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>
                    Workers must re-sign whenever the revision changes.
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <a
                    href={`/api/export/swms/${swmsId}/signon`}
                    download
                    style={{
                      background: colors.surface, color: colors.textPrimary, border: `1px solid ${colors.border}`,
                      borderRadius: 999, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      textDecoration: 'none', display: 'inline-flex', alignItems: 'center'
                    }}
                  >
                    Printable Sheet
                  </a>
                  <Button size="sm" onClick={() => setShowSignForm(s => !s)}>{showSignForm ? 'Cancel' : 'Sign On'}</Button>
                </div>
              </div>

              {showSignForm && (
                <div style={{ padding: '16px 20px', borderBottom: `1px solid ${colors.border}` }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                    <Input label="Your Name" required value={signName} onChange={setSignName} />
                    <Input label="Company" value={signCompany} onChange={setSignCompany} />
                  </div>
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: colors.textSecondary, cursor: 'pointer', marginBottom: 12 }}>
                    <input
                      type="checkbox"
                      checked={signConfirmed}
                      onChange={e => setSignConfirmed(e.target.checked)}
                      style={{ marginTop: 2 }}
                    />
                    I confirm I have read, understood, and agree to comply with this SWMS (Rev {swms.revision}).
                  </label>
                  <Button onClick={signOn} disabled={signing}>{signing ? 'Signing...' : 'Confirm Sign-On'}</Button>
                </div>
              )}

              {signons.length === 0 ? (
                <div style={{ padding: '16px 20px', fontSize: 12, color: colors.textMuted }}>
                  No one has signed on to this revision yet.
                </div>
              ) : (
                <div>
                  {signons.map(s => (
                    <div key={s.id} style={{ padding: '10px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${colors.border}` }}>
                      <div>
                        <span style={{ fontSize: 13, color: colors.textPrimary, fontWeight: 500 }}>{s.signed_name}</span>
                        {s.signed_company && <span style={{ fontSize: 12, color: colors.textMuted }}> - {s.signed_company}</span>}
                      </div>
                      <span style={{ fontSize: 12, color: colors.textMuted }}>{new Date(s.signed_at).toLocaleString('en-NZ')}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </>
        )}

        {editing ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary }}>Activities ({editActivities.length})</span>
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
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12, marginBottom: 12 }}>
                    <Input label="Step No." value={a.step_number} onChange={v => updateEditActivity(a._key, 'step_number', v)} />
                    <Input label="Responsible Person" value={a.responsible_person} onChange={v => updateEditActivity(a._key, 'responsible_person', v)} />
                  </div>
                  <Textarea label="Activity Description" rows={2} value={a.activity_description} onChange={v => updateEditActivity(a._key, 'activity_description', v)} />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
                    <Textarea label="Hazards (one per line)" rows={3} value={a.hazards} onChange={v => updateEditActivity(a._key, 'hazards', v)} />
                    <Textarea label="Control Measures (one per line)" rows={3} value={a.control_measures} onChange={v => updateEditActivity(a._key, 'control_measures', v)} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
                    <Select label="Initial Risk Rating" value={a.initial_risk_rating} onChange={v => updateEditActivity(a._key, 'initial_risk_rating', v)} options={RISK_OPTIONS} />
                    <Select label="Residual Risk Rating" value={a.residual_risk_rating} onChange={v => updateEditActivity(a._key, 'residual_risk_rating', v)} options={RISK_OPTIONS} />
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <Input label="Legislative Reference" value={a.legislative_reference} onChange={v => updateEditActivity(a._key, 'legislative_reference', v)} />
                  </div>
                </Card>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 20, marginBottom: 32 }}>
              <Button size="sm" variant="secondary" onClick={addEditActivity}>+ Add Activity</Button>
              <Button onClick={requestSave} disabled={savingEdit}>{savingEdit ? 'Saving...' : 'Save Changes'}</Button>
            </div>
          </>
        ) : (
          <>
            <div style={{ color: colors.textMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
              {activities.length} Activities
            </div>

            {activities.length === 0 ? (
              <Card>
                <div style={{ padding: '24px 0', textAlign: 'center', color: colors.textMuted, fontSize: 13 }}>
                  No activities found for this SWMS.
                </div>
              </Card>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {activities.map((act, idx) => {
                  const hazards = Array.isArray(act.hazards) ? act.hazards : []
                  const controls = Array.isArray(act.control_measures) ? act.control_measures : []
                  const iRisk = RISK_COLORS[act.initial_risk_rating] ?? RISK_COLORS.medium
                  const rRisk = RISK_COLORS[act.residual_risk_rating] ?? RISK_COLORS.low

                  return (
                    <Card key={act.id} padding={0} style={{ overflow: 'hidden' }}>
                      <div style={{ background: colors.bg, padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: `1px solid ${colors.border}` }}>
                        <span style={{ color: colors.textMuted, fontSize: 12, fontWeight: 600, minWidth: 24 }}>{act.step_number ?? idx + 1}</span>
                        <span style={{ color: colors.textPrimary, fontSize: 13, fontWeight: 500, flex: 1 }}>{act.activity_description}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ background: iRisk.bg, color: iRisk.text, fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4 }}>
                            {(act.initial_risk_rating || '').toUpperCase()}
                          </span>
                          <span style={{ color: colors.textMuted, fontSize: 12 }}>-&gt;</span>
                          <span style={{ background: rRisk.bg, color: rRisk.text, fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4 }}>
                            {(act.residual_risk_rating || '').toUpperCase()}
                          </span>
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                        <div style={{ padding: '14px 20px', borderRight: `1px solid ${colors.border}` }}>
                          <div style={{ color: colors.textMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Hazards</div>
                          {hazards.length > 0 ? (
                            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6, padding: 0, margin: 0 }}>
                              {hazards.map((h, i) => (
                                <li key={i} style={{ color: colors.textSecondary, fontSize: 12, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                                  <span style={{ color: '#B06A00', flexShrink: 0 }}>-</span>
                                  {typeof h === 'string' ? h : h.description}
                                </li>
                              ))}
                            </ul>
                          ) : <span style={{ color: colors.textMuted, fontSize: 12 }}>-</span>}
                        </div>

                        <div style={{ padding: '14px 20px' }}>
                          <div style={{ color: colors.textMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Control Measures</div>
                          {controls.length > 0 ? (
                            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6, padding: 0, margin: 0 }}>
                              {controls.map((c, i) => (
                                <li key={i} style={{ color: colors.textSecondary, fontSize: 12, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                                  <span style={{ color: colors.success, flexShrink: 0 }}>+</span>
                                  {c}
                                </li>
                              ))}
                            </ul>
                          ) : <span style={{ color: colors.textMuted, fontSize: 12 }}>-</span>}
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderTop: `1px solid ${colors.border}` }}>
                        <div style={{ padding: '10px 20px', borderRight: `1px solid ${colors.border}` }}>
                          <div style={{ color: colors.textMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Responsible Person</div>
                          <div style={{ color: colors.textPrimary, fontSize: 12 }}>{act.responsible_person || '-'}</div>
                        </div>
                        <div style={{ padding: '10px 20px' }}>
                          <div style={{ color: colors.textMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Legislative Reference</div>
                          <div style={{ color: colors.textSecondary, fontSize: 12 }}>{act.legislative_reference || '-'}</div>
                        </div>
                      </div>
                    </Card>
                  )
                })}
              </div>
            )}

            <div style={{ color: colors.textMuted, fontSize: 12, textAlign: 'center', marginTop: 32, paddingBottom: 32 }}>
              {activities.length} activities - {swms.swms_number} Rev {swms.revision}
            </div>
          </>
        )}
      </div>
    </PageShell>
  )
}
