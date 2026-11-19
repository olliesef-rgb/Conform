'use client'
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { PageShell, PageHeader, Card, Button, Input, Textarea, Alert, colors, LoadingPage } from '@/components/ui'
import { AssigneePicker } from '@/components/assignee-picker'

interface Notice {
  id: string
  project_id: string
  type: string
  notice_number: string
  title: string
  description: string
  status: string
  raised_by_email: string | null
  raised_at: string
  response: string | null
  responded_by_name: string | null
  responded_at: string | null
  closeout_notes: string | null
  closed_at: string | null
  itp_id: string | null
  swms_id: string | null
  lot_id: string | null
  assigned_to: string | null
}

interface NoticeEvidence {
  id: string
  file_name: string
  file_url: string
  uploaded_at: string
  caption: string | null
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  open: { bg: '#FBDADA', text: '#B3261E' },
  pending_response: { bg: '#FFF3C4', text: '#8A6300' },
  closed: { bg: '#E3F3DC', text: '#2F6B1F' },
}
const STATUS_LABELS: Record<string, string> = {
  open: 'Open', pending_response: 'Pending Response', closed: 'Closed',
}

export default function NoticeDetailPage() {
  const router = useRouter()
  const params = useParams<{ id: string; noticeId: string }>()
  const projectId = params.id
  const noticeId = params.noticeId
  const supabase = createClient()

  const [notice, setNotice] = useState<Notice | null>(null)
  const [projectName, setProjectName] = useState('')
  const [organisationId, setOrganisationId] = useState<string | null>(null)
  const [linkedItp, setLinkedItp] = useState<{ id: string; label: string } | null>(null)
  const [linkedSwms, setLinkedSwms] = useState<{ id: string; label: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [response, setResponse] = useState('')
  const [respondedByName, setRespondedByName] = useState('')
  const [closeoutNotes, setCloseoutNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [evidence, setEvidence] = useState<NoticeEvidence[]>([])
  const [uploading, setUploading] = useState(false)
  const [costs, setCosts] = useState<{ labour: any[]; plant: any[]; materials: any[] }>({ labour: [], plant: [], materials: [] })

  const [assignedToName, setAssignedToName] = useState<string | null>(null)
  const [savingAssignee, setSavingAssignee] = useState(false)

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('notices').select('*').eq('id', noticeId).single()
      if (!data) { setError('Notice not found.'); setLoading(false); return }
      setNotice(data)
      setResponse(data.response ?? '')
      setRespondedByName(data.responded_by_name ?? '')
      setCloseoutNotes(data.closeout_notes ?? '')

      if (data.assigned_to) {
        const { data: assignee } = await supabase.from('profiles').select('full_name').eq('id', data.assigned_to).single()
        setAssignedToName(assignee?.full_name ?? null)
      }

      const { data: proj } = await supabase.from('projects').select('name, organisation_id').eq('id', projectId).single()
      setProjectName(proj?.name ?? 'Project')
      setOrganisationId(proj?.organisation_id ?? null)

      if (data.itp_id) {
        const { data: itp } = await supabase.from('itps').select('id, itp_number, title').eq('id', data.itp_id).single()
        if (itp) setLinkedItp({ id: itp.id, label: `${itp.itp_number} - ${itp.title}` })
      }
      if (data.swms_id) {
        const { data: s } = await supabase.from('swms').select('id, swms_number, title').eq('id', data.swms_id).single()
        if (s) setLinkedSwms({ id: s.id, label: `${s.swms_number} - ${s.title}` })
      }

      const { data: evData } = await supabase.from('notice_evidence').select('*').eq('notice_id', noticeId).order('uploaded_at', { ascending: false })
      setEvidence(evData ?? [])

      const [{ data: linkedLabour }, { data: linkedPlant }, { data: linkedMaterials }] = await Promise.all([
        supabase.from('daily_labour').select('person_name, company, hours, rate').eq('notice_id', noticeId),
        supabase.from('daily_plant').select('description, company, hours, rate').eq('notice_id', noticeId),
        supabase.from('daily_materials').select('material_name, unit, quantity, rate').eq('notice_id', noticeId),
      ])
      setCosts({ labour: linkedLabour ?? [], plant: linkedPlant ?? [], materials: linkedMaterials ?? [] })

      setLoading(false)
    }
    load()
  }, [noticeId, projectId])

  async function assignTo(id: string, name: string) {
    setSavingAssignee(true)
    const { error: assignError } = await supabase.from('notices').update({ assigned_to: id }).eq('id', noticeId)
    setSavingAssignee(false)
    if (assignError) { setError(assignError.message); return }
    setAssignedToName(name)
  }

  async function unassign() {
    setSavingAssignee(true)
    const { error: assignError } = await supabase.from('notices').update({ assigned_to: null }).eq('id', noticeId)
    setSavingAssignee(false)
    if (assignError) { setError(assignError.message); return }
    setAssignedToName(null)
  }

  async function markPendingResponse() {
    setSaving(true)
    const { error: updError } = await supabase.from('notices').update({
      status: 'pending_response', response, responded_by_name: respondedByName,
    }).eq('id', noticeId)
    setSaving(false)
    if (updError) { setError(updError.message); return }
    window.location.reload()
  }

  async function closeNotice() {
    if (!closeoutNotes.trim()) { setError('Please add close-out notes before closing.'); return }
    setSaving(true)
    const { error: updError } = await supabase.from('notices').update({
      status: 'closed', closeout_notes: closeoutNotes, closed_at: new Date().toISOString(), response, responded_by_name: respondedByName,
    }).eq('id', noticeId)
    setSaving(false)
    if (updError) { setError(updError.message); return }
    window.location.reload()
  }

  async function reopenNotice() {
    setSaving(true)
    const { error: updError } = await supabase.from('notices').update({
      status: 'open', closed_at: null,
    }).eq('id', noticeId)
    setSaving(false)
    if (updError) { setError(updError.message); return }
    window.location.reload()
  }

  async function handleDelete() {
    if (!confirm('Delete this notice? This cannot be undone.')) return
    const { error: delError } = await supabase.from('notices').delete().eq('id', noticeId)
    if (delError) { setError(delError.message); return }
    router.push(`/projects/${projectId}/notices`)
  }

  async function uploadFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploading(true)
    const { data: userData } = await supabase.auth.getUser()
    const user = userData?.user
    for (const file of Array.from(files)) {
      const path = `notices/${noticeId}/${Date.now()}-${file.name}`
      const { error: upErr } = await supabase.storage.from('evidence').upload(path, file)
      if (upErr) { setError(upErr.message); continue }
      const { data: pub } = supabase.storage.from('evidence').getPublicUrl(path)
      const { data: insertedEv } = await supabase.from('notice_evidence').insert({
        notice_id: noticeId,
        file_name: file.name,
        file_url: pub.publicUrl,
        uploaded_by: user?.id ?? null,
      }).select('id').single()
      const caption = window.prompt('What is this a photo of? (optional - helps tell similar photos apart)')
      if (caption && insertedEv) {
        await supabase.from('notice_evidence').update({ caption }).eq('id', insertedEv.id)
      }
    }
    const { data: evData } = await supabase.from('notice_evidence').select('*').eq('notice_id', noticeId).order('uploaded_at', { ascending: false })
    setEvidence(evData ?? [])
    setUploading(false)
  }

  async function deleteEvidence(id: string) {
    await supabase.from('notice_evidence').delete().eq('id', id)
    setEvidence(prev => prev.filter(e => e.id !== id))
  }

  if (loading) return <LoadingPage />
  if (error && !notice) {
    return (
      <PageShell projectId={projectId} activeSection="notices">
        <div style={{ padding: 32 }}>
          <Alert variant="error">{error}</Alert>
          <div style={{ marginTop: 16 }}><Button variant="secondary" onClick={() => router.back()}>Go back</Button></div>
        </div>
      </PageShell>
    )
  }
  if (!notice) return null

  const sc = STATUS_COLORS[notice.status] ?? STATUS_COLORS.open

  return (
    <PageShell projectId={projectId} activeSection="notices">
      <PageHeader
        title={`${notice.notice_number} - ${notice.title}`}
        subtitle={notice.type}
        breadcrumbs={[
          { label: projectName, href: `/projects/${projectId}` },
          { label: 'Notices', href: `/projects/${projectId}/notices` },
          { label: notice.notice_number },
        ]}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <a
              href={`/api/export/notices/${noticeId}`}
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
              <div style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 8 }}>Who owns driving this to close-out</div>
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
            <span style={{ background: colors.accentSoft, color: colors.accentInk, fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 4 }}>{notice.type}</span>
            <span style={{ background: sc.bg, color: sc.text, fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999 }}>{STATUS_LABELS[notice.status] ?? notice.status}</span>
            <span style={{ color: colors.textMuted, fontSize: 12 }}>Raised {new Date(notice.raised_at).toLocaleString('en-NZ')}{notice.raised_by_email ? ` by ${notice.raised_by_email}` : ''}</span>
          </div>
          <div style={{ color: colors.textMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Description</div>
          <div style={{ color: colors.textPrimary, fontSize: 13, whiteSpace: 'pre-wrap' }}>{notice.description || '-'}</div>

          {(linkedItp || linkedSwms) && (
            <div style={{ display: 'flex', gap: 16, marginTop: 16, paddingTop: 16, borderTop: `1px solid ${colors.border}` }}>
              {linkedItp && (
                <a href={`/projects/${projectId}/itps/${linkedItp.id}`} style={{ fontSize: 12, color: colors.accentInk, textDecoration: 'underline' }}>
                  Linked ITP: {linkedItp.label}
                </a>
              )}
              {linkedSwms && (
                <a href={`/projects/${projectId}/swms/${linkedSwms.id}`} style={{ fontSize: 12, color: colors.accentInk, textDecoration: 'underline' }}>
                  Linked SWMS: {linkedSwms.label}
                </a>
              )}
            </div>
          )}
        </Card>

        <Card style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary }}>Documents &amp; Photos ({evidence.length})</span>
            <label style={{ fontSize: 12, fontWeight: 600, color: colors.accentInk, cursor: 'pointer' }}>
              {uploading ? 'Uploading...' : '+ Add File'}
              <input type="file" multiple style={{ display: 'none' }} onChange={e => uploadFiles(e.target.files)} disabled={uploading} />
            </label>
          </div>
          {evidence.length === 0 ? (
            <div style={{ fontSize: 12, color: colors.textMuted }}>No files attached yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {evidence.map(e => {
                const isImage = /\.(png|jpe?g|gif|webp)$/i.test(e.file_name)
                return (
                  <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: `1px solid ${colors.border}` }}>
                    {isImage ? (
                      <img src={e.file_url} alt={e.file_name} style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: 40, height: 40, borderRadius: 6, background: colors.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: colors.textMuted, flexShrink: 0 }}>FILE</div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <a href={e.file_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: colors.textPrimary, textDecoration: 'underline', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{e.file_name}</a>
                      <div style={{ fontSize: 10, color: colors.textMuted, marginTop: 1 }}>
                        {new Date(e.uploaded_at).toLocaleString()}{e.caption ? ` \u00b7 ${e.caption}` : ''}
                      </div>
                    </div>
                    <button onClick={() => deleteEvidence(e.id)} style={{ fontSize: 11, color: colors.danger, background: 'none', border: 'none', cursor: 'pointer' }}>Remove</button>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        {notice.type === 'CE' && (
          <Card style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary, marginBottom: 10 }}>Linked Costs</div>
            {(costs.labour.length === 0 && costs.plant.length === 0 && costs.materials.length === 0) ? (
              <div style={{ fontSize: 12, color: colors.textMuted }}>No labour, plant or materials tagged to this variation yet. Tag entries from the daily allocation page.</div>
            ) : (
              <div style={{ fontSize: 12, color: colors.textPrimary }}>
                {costs.labour.map((r, i) => (
                  <div key={`l${i}`} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: `1px solid ${colors.border}` }}>
                    <span>{r.person_name}{r.company ? ` (${r.company})` : ''} - {r.hours ?? 0}h</span>
                    <span>${((r.hours ?? 0) * (r.rate ?? 0)).toFixed(2)}</span>
                  </div>
                ))}
                {costs.plant.map((r, i) => (
                  <div key={`p${i}`} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: `1px solid ${colors.border}` }}>
                    <span>{r.description}{r.company ? ` (${r.company})` : ''} - {r.hours ?? 0}h</span>
                    <span>${((r.hours ?? 0) * (r.rate ?? 0)).toFixed(2)}</span>
                  </div>
                ))}
                {costs.materials.map((r, i) => (
                  <div key={`m${i}`} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: `1px solid ${colors.border}` }}>
                    <span>{r.material_name} - {r.quantity ?? 0} {r.unit ?? ''}</span>
                    <span>${((r.quantity ?? 0) * (r.rate ?? 0)).toFixed(2)}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, marginTop: 4, fontWeight: 700 }}>
                  <span>Total</span>
                  <span>${(
                    costs.labour.reduce((s, r) => s + (r.hours ?? 0) * (r.rate ?? 0), 0) +
                    costs.plant.reduce((s, r) => s + (r.hours ?? 0) * (r.rate ?? 0), 0) +
                    costs.materials.reduce((s, r) => s + (r.quantity ?? 0) * (r.rate ?? 0), 0)
                  ).toFixed(2)}</span>
                </div>
              </div>
            )}
          </Card>
        )}

        {notice.status !== 'closed' && (
          <Card style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary, marginBottom: 10 }}>Response</div>
            <div style={{ marginBottom: 10 }}>
              <Input label="Responded By (name of client / designer / external party)" value={respondedByName} onChange={setRespondedByName} placeholder="e.g. John Smith, Beca" />
            </div>
            <Textarea rows={3} value={response} onChange={setResponse} placeholder="Record the response received, or progress so far" />
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <Button variant="secondary" onClick={markPendingResponse} disabled={saving}>Save as Pending Response</Button>
            </div>
          </Card>
        )}

        {notice.status !== 'closed' ? (
          <Card>
            <div style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary, marginBottom: 10 }}>Close Out</div>
            <Textarea rows={3} value={closeoutNotes} onChange={setCloseoutNotes} placeholder="What was done to resolve this, and any evidence reference" />
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <Button onClick={closeNotice} disabled={saving}>{saving ? 'Saving...' : 'Close Notice'}</Button>
            </div>
          </Card>
        ) : (
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary }}>Closed</div>
              <span style={{ color: colors.textMuted, fontSize: 12 }}>{notice.closed_at ? new Date(notice.closed_at).toLocaleString('en-NZ') : ''}</span>
            </div>
            <div style={{ color: colors.textSecondary, fontSize: 13, whiteSpace: 'pre-wrap', marginBottom: 12 }}>{notice.closeout_notes}</div>
            <Button variant="secondary" size="sm" onClick={reopenNotice} disabled={saving}>Re-open</Button>
          </Card>
        )}
      </div>
    </PageShell>
  )
}
