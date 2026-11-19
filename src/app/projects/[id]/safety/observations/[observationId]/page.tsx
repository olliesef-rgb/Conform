'use client'
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { PageShell, PageHeader, Card, Button, Select, Textarea, Alert, colors, LoadingPage } from '@/components/ui'
import { AssigneePicker } from '@/components/assignee-picker'

interface Observation {
  id: string
  project_id: string
  category: string
  observation_number: string
  description: string
  location: string
  status: string
  raised_by_email: string | null
  raised_at: string
  closeout_notes: string | null
  closed_at: string | null
  lot_id: string | null
  swms_id: string | null
  closing_swms_revision_id: string | null
  assigned_to: string | null
}

interface ObsEvidence {
  id: string
  file_name: string
  file_url: string
  uploaded_at: string
}

export default function SafetyObservationDetailPage() {
  const router = useRouter()
  const params = useParams<{ id: string; observationId: string }>()
  const projectId = params.id
  const observationId = params.observationId
  const supabase = createClient()

  const [observation, setObservation] = useState<Observation | null>(null)
  const [organisationId, setOrganisationId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [closeoutNotes, setCloseoutNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const [evidence, setEvidence] = useState<ObsEvidence[]>([])
  const [uploading, setUploading] = useState(false)

  const [linkedSwms, setLinkedSwms] = useState<{ id: string; label: string } | null>(null)
  const [swmsRevisions, setSwmsRevisions] = useState<{ id: string; revision: string; reason: string; changed_at: string }[]>([])
  const [selectedRevisionId, setSelectedRevisionId] = useState('')
  const [resolvedRevision, setResolvedRevision] = useState<{ revision: string; reason: string } | null>(null)

  const [assignedToName, setAssignedToName] = useState<string | null>(null)
  const [savingAssignee, setSavingAssignee] = useState(false)

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('safety_observations').select('*').eq('id', observationId).single()
      if (!data) { setError('Observation not found.'); setLoading(false); return }
      setObservation(data)
      setCloseoutNotes(data.closeout_notes ?? '')

      if (data.assigned_to) {
        const { data: assignee } = await supabase.from('profiles').select('full_name').eq('id', data.assigned_to).single()
        setAssignedToName(assignee?.full_name ?? null)
      }

      const { data: proj } = await supabase.from('projects').select('organisation_id').eq('id', projectId).single()
      setOrganisationId(proj?.organisation_id ?? null)

      const { data: evData } = await supabase.from('safety_observation_evidence').select('*').eq('observation_id', observationId).order('uploaded_at', { ascending: false })
      setEvidence(evData ?? [])

      if (data.swms_id) {
        const { data: s } = await supabase.from('swms').select('id, swms_number, title').eq('id', data.swms_id).single()
        if (s) setLinkedSwms({ id: s.id, label: `${s.swms_number} - ${s.title}` })

        const { data: revData } = await supabase.from('swms_revisions').select('id, revision, reason, changed_at').eq('swms_id', data.swms_id).order('changed_at', { ascending: false })
        setSwmsRevisions(revData ?? [])
      }

      if (data.closing_swms_revision_id) {
        const { data: rev } = await supabase.from('swms_revisions').select('revision, reason').eq('id', data.closing_swms_revision_id).single()
        if (rev) setResolvedRevision(rev)
      }

      setLoading(false)
    }
    load()
  }, [observationId])

  async function assignTo(id: string, name: string) {
    setSavingAssignee(true)
    const { error: assignError } = await supabase.from('safety_observations').update({ assigned_to: id }).eq('id', observationId)
    setSavingAssignee(false)
    if (assignError) { setError(assignError.message); return }
    setAssignedToName(name)
  }

  async function unassign() {
    setSavingAssignee(true)
    const { error: assignError } = await supabase.from('safety_observations').update({ assigned_to: null }).eq('id', observationId)
    setSavingAssignee(false)
    if (assignError) { setError(assignError.message); return }
    setAssignedToName(null)
  }

  async function uploadFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploading(true)
    const { data: userData } = await supabase.auth.getUser()
    const user = userData?.user
    for (const file of Array.from(files)) {
      const path = `safety-observations/${observationId}/${Date.now()}-${file.name}`
      const { error: upErr } = await supabase.storage.from('evidence').upload(path, file)
      if (upErr) { setError(upErr.message); continue }
      const { data: pub } = supabase.storage.from('evidence').getPublicUrl(path)
      await supabase.from('safety_observation_evidence').insert({
        observation_id: observationId,
        file_name: file.name,
        file_url: pub.publicUrl,
        uploaded_by: user?.id ?? null,
      })
    }
    const { data: evData } = await supabase.from('safety_observation_evidence').select('*').eq('observation_id', observationId).order('uploaded_at', { ascending: false })
    setEvidence(evData ?? [])
    setUploading(false)
  }

  async function deleteEvidence(id: string) {
    await supabase.from('safety_observation_evidence').delete().eq('id', id)
    setEvidence(prev => prev.filter(e => e.id !== id))
  }

  async function closeObservation() {
    if (!closeoutNotes.trim()) { setError('Please add close-out notes before closing.'); return }
    setSaving(true)
    const { error: updError } = await supabase.from('safety_observations').update({
      status: 'closed', closeout_notes: closeoutNotes, closed_at: new Date().toISOString(),
      closing_swms_revision_id: selectedRevisionId || null,
    }).eq('id', observationId)
    setSaving(false)
    if (updError) { setError(updError.message); return }
    window.location.reload()
  }

  async function reopenObservation() {
    setSaving(true)
    const { error: updError } = await supabase.from('safety_observations').update({
      status: 'open', closed_at: null,
    }).eq('id', observationId)
    setSaving(false)
    if (updError) { setError(updError.message); return }
    window.location.reload()
  }

  async function handleDelete() {
    if (!confirm('Delete this observation? This cannot be undone.')) return
    const { error: delError } = await supabase.from('safety_observations').delete().eq('id', observationId)
    if (delError) { setError(delError.message); return }
    router.push(`/projects/${projectId}/safety/observations`)
  }

  if (loading) return <LoadingPage />
  if (error && !observation) {
    return (
      <PageShell projectId={projectId} activeSection="safety">
        <div style={{ padding: 32 }}>
          <Alert variant="error">{error}</Alert>
          <div style={{ marginTop: 16 }}><Button variant="secondary" onClick={() => router.back()}>Go back</Button></div>
        </div>
      </PageShell>
    )
  }
  if (!observation) return null

  return (
    <PageShell projectId={projectId} activeSection="safety">
      <PageHeader
        title={`${observation.observation_number} - ${observation.category}`}
        subtitle={observation.location || undefined}
        breadcrumbs={[
          { label: 'Observations', href: `/projects/${projectId}/safety/observations` },
          { label: observation.observation_number },
        ]}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <a
              href={`/api/export/safety-observations/${observationId}`}
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
        }
      />

      <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 32px' }}>
        {error && <div style={{ marginBottom: 16 }}><Alert variant="error">{error}</Alert></div>}

        <Card style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <div style={{ color: colors.textMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Assigned To</div>
              <div style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 8 }}>Who owns closing this out</div>
            </div>
            <AssigneePicker
              organisationId={organisationId}
              currentName={assignedToName}
              onAssign={assignTo}
              onUnassign={unassign}
              disabled={savingAssignee}
            />
          </div>
        </Card>

        <Card style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ background: colors.accentSoft, color: colors.accentInk, fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 4 }}>{observation.category}</span>
            <span style={{
              background: observation.status === 'open' ? '#FBDADA' : '#E3F3DC',
              color: observation.status === 'open' ? '#B3261E' : '#2F6B1F',
              fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999,
            }}>{observation.status === 'open' ? 'Open' : 'Closed'}</span>
            <span style={{ color: colors.textMuted, fontSize: 12 }}>Raised {new Date(observation.raised_at).toLocaleString('en-NZ')}{observation.raised_by_email ? ` by ${observation.raised_by_email}` : ''}</span>
          </div>
          <div style={{ color: colors.textMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Description</div>
          <div style={{ color: colors.textPrimary, fontSize: 13, whiteSpace: 'pre-wrap' }}>{observation.description || '-'}</div>
          {linkedSwms && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${colors.border}` }}>
              <a href={`/projects/${projectId}/swms/${linkedSwms.id}`} style={{ fontSize: 12, color: colors.accentInk, textDecoration: 'underline' }}>
                Linked SWMS: {linkedSwms.label}
              </a>
            </div>
          )}
        </Card>

        <Card style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary }}>Photos ({evidence.length})</span>
            <label style={{ fontSize: 12, fontWeight: 600, color: colors.accentInk, cursor: 'pointer' }}>
              {uploading ? 'Uploading...' : '+ Add Photo'}
              <input type="file" multiple accept="image/*" style={{ display: 'none' }} onChange={e => uploadFiles(e.target.files)} disabled={uploading} />
            </label>
          </div>
          {evidence.length === 0 ? (
            <div style={{ fontSize: 12, color: colors.textMuted }}>No photos attached yet.</div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {evidence.map(e => (
                <div key={e.id} style={{ position: 'relative' }}>
                  <a href={e.file_url} target="_blank" rel="noopener noreferrer">
                    <img src={e.file_url} alt={e.file_name} style={{ width: 90, height: 90, objectFit: 'cover', borderRadius: 8, border: `1px solid ${colors.border}` }} />
                  </a>
                  <button
                    onClick={() => deleteEvidence(e.id)}
                    style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', background: colors.danger, color: '#fff', border: 'none', fontSize: 11, cursor: 'pointer' }}
                  >x</button>
                </div>
              ))}
            </div>
          )}
        </Card>

        {observation.status !== 'closed' ? (
          <Card>
            <div style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary, marginBottom: 10 }}>Close Out</div>
            {linkedSwms && (
              <div style={{ marginBottom: 12 }}>
                <Select
                  label="SWMS revision that resolved this (optional)"
                  value={selectedRevisionId}
                  onChange={setSelectedRevisionId}
                  options={[
                    { value: '', label: 'No SWMS update / not applicable' },
                    ...swmsRevisions.map(r => ({
                      value: r.id,
                      label: `Rev ${r.revision} - ${r.reason} (${new Date(r.changed_at).toLocaleDateString('en-NZ')})`,
                    })),
                  ]}
                />
                {swmsRevisions.length === 0 && (
                  <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 4 }}>
                    No edits logged yet on the linked SWMS. Edit it first (with a reason) if this observation led to a change.
                  </div>
                )}
              </div>
            )}
            <Textarea rows={3} value={closeoutNotes} onChange={setCloseoutNotes} placeholder="What was done to resolve this" />
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <Button onClick={closeObservation} disabled={saving}>{saving ? 'Saving...' : 'Close Observation'}</Button>
            </div>
          </Card>
        ) : (
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary }}>Closed</div>
              <span style={{ color: colors.textMuted, fontSize: 12 }}>{observation.closed_at ? new Date(observation.closed_at).toLocaleString('en-NZ') : ''}</span>
            </div>
            <div style={{ color: colors.textSecondary, fontSize: 13, whiteSpace: 'pre-wrap', marginBottom: 12 }}>{observation.closeout_notes}</div>
            {resolvedRevision && (
              <div style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 12, padding: '8px 12px', background: colors.bg, borderRadius: 8 }}>
                Resolved via SWMS Rev {resolvedRevision.revision}: &quot;{resolvedRevision.reason}&quot;
              </div>
            )}
            <Button variant="secondary" size="sm" onClick={reopenObservation} disabled={saving}>Re-open</Button>
          </Card>
        )}
      </div>
    </PageShell>
  )
}
