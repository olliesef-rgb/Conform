'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'
import {
  PageShell, PageHeader, Card, Button, Input, Textarea, Select, Alert, colors
} from '@/components/ui'

const TYPE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  H: { bg: '#FDEAEA', text: '#B3261E', border: '#F5C6C6' },
  W: { bg: '#FFF3E0', text: '#B06A00', border: '#F6DDB0' },
  R: { bg: '#E8F0FE', text: '#1A56DB', border: '#C8DBFB' },
  S: { bg: '#F1F1EC', text: '#6B6B5F', border: '#DEDED4' },
}

export default function NewITP() {
  const [step, setStep] = useState(1)
  const [discipline, setDiscipline] = useState('civil')
  const [clientType, setClientType] = useState('watercare')
  const [workDescription, setWorkDescription] = useState('')
  const [additionalContext, setAdditionalContext] = useState('')
  const [generating, setGenerating] = useState(false)
  const [activities, setActivities] = useState<any[]>([])
  const [itpTitle, setItpTitle] = useState('')
  const [itpNumber, setItpNumber] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [documents, setDocuments] = useState<{ id: string; name: string; document_type: string }[]>([])
  const [docScope, setDocScope] = useState<'all' | 'selected'>('all')
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set())
  const router = useRouter()
  const params = useParams()
  const supabase = createClient()
  const projectId = params.id as string

  useEffect(() => {
    fetch(`/api/projects/${projectId}/documents/upload`)
      .then(res => res.json())
      .then(data => setDocuments(data.documents ?? []))
      .catch(() => {})
  }, [projectId])

  function toggleDoc(id: string) {
    setSelectedDocIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  async function generate() {
    if (!workDescription) { setError('Please describe the work scope'); return }
    setGenerating(true)
    setError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile } = await supabase.from('profiles').select('organisation_id').eq('id', user?.id).single()
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workDescription,
          discipline,
          clientType,
          additionalContext,
          projectId,
          organisationId: profile?.organisation_id,
          documentIds: docScope === 'selected' ? Array.from(selectedDocIds) : null,
        })
      })
      const data = await response.json()
      const text = data.content?.[0]?.text || ''
      const clean = text.replace(/```json|```/g, '').trim()
      const parsed = JSON.parse(clean)
      setActivities(parsed)
      setItpTitle('')
      setItpNumber(`ITP-${Date.now().toString().slice(-6)}`)
      setStep(2)
    } catch (e) {
      setError('Generation failed - check API key has credits at platform.anthropic.com')
    }
    setGenerating(false)
  }

  async function saveITP() {
    if (!itpTitle.trim()) { setError('Please give this ITP a short name before saving'); return }
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: profile } = await supabase.from('profiles').select('organisation_id').eq('id', user.id).single()
    const { data: itp, error: itpError } = await supabase.from('itps').insert({
      project_id: projectId,
      organisation_id: profile?.organisation_id,
      itp_number: itpNumber,
      title: itpTitle,
      work_description: workDescription,
      discipline,
      status: 'draft',
      revision: '1.0',
      client: clientType,
      engineer_name: user.email,
    }).select('id').single()
    if (itpError) { setError(itpError.message); setSaving(false); return }
    const activityRows = activities.map((a, i) => ({
      itp_id: itp.id,
      section_name: a.section,
      section_order: parseInt(a.actNo?.split('.')[0] || '1'),
      activity_number: a.actNo,
      description: a.description,
      responsibility: a.responsibility,
      requirements_reference: a.reference,
      conformance_criteria: a.conformanceCriteria,
      method: a.method,
      frequency: a.frequency,
      hold_witness_type: a.type,
      attendance_required: a.attendance,
      records_checklists: a.records,
      sort_order: i,
    }))
    await supabase.from('itp_activities').insert(activityRows)
    router.push(`/projects/${projectId}/itps/${itp.id}`)
  }

  const sections = Array.from(new Set(activities.map(a => a.section)))

  return (
    <PageShell projectId={projectId} activeSection="quality">
      {step === 1 && (
        <>
          <PageHeader
            title="Generate ITP"
            subtitle="Describe the work scope and Claude will generate a draft ITP"
          />
          <div style={{ padding: '32px', maxWidth: 640 }}>
            <Card>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <Textarea
                  label="Work Description"
                  required
                  rows={4}
                  placeholder="e.g. DN300 PVC-U stormwater pipeline installation in road corridor, approximately 420m including 8 precast manholes"
                  value={workDescription}
                  onChange={setWorkDescription}
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
                <Textarea
                  label="Additional Context (optional)"
                  rows={2}
                  placeholder="e.g. AT road corridor, traffic management required, CCTV inspection post-install"
                  value={additionalContext}
                  onChange={setAdditionalContext}
                />

                {documents.length > 0 && (
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 500, color: colors.textPrimary, marginBottom: 6, display: 'block' }}>
                      Reference Documents
                    </label>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                      <button
                        type="button"
                        onClick={() => setDocScope('all')}
                        style={{
                          padding: '6px 14px', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                          border: `1px solid ${docScope === 'all' ? colors.accentInk : colors.border}`,
                          background: docScope === 'all' ? colors.accentSoft : '#fff',
                          color: docScope === 'all' ? colors.accentInk : colors.textSecondary,
                        }}
                      >
                        All documents
                      </button>
                      <button
                        type="button"
                        onClick={() => setDocScope('selected')}
                        style={{
                          padding: '6px 14px', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                          border: `1px solid ${docScope === 'selected' ? colors.accentInk : colors.border}`,
                          background: docScope === 'selected' ? colors.accentSoft : '#fff',
                          color: docScope === 'selected' ? colors.accentInk : colors.textSecondary,
                        }}
                      >
                        Select specific documents
                      </button>
                    </div>

                    {docScope === 'selected' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto', padding: 10, border: `1px solid ${colors.border}`, borderRadius: 8 }}>
                        {documents.map(doc => (
                          <label key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: colors.textPrimary, cursor: 'pointer' }}>
                            <input type="checkbox" checked={selectedDocIds.has(doc.id)} onChange={() => toggleDoc(doc.id)} />
                            {doc.name}
                            <span style={{ fontSize: 11, color: colors.textMuted }}>({doc.document_type})</span>
                          </label>
                        ))}
                      </div>
                    )}

                    <p style={{ fontSize: 12, color: colors.textMuted, marginTop: 6 }}>
                      Pointing this at just the drawings and spec sections that actually apply gets a more accurate ITP - it isn't competing against unrelated content for attention - and it's faster and uses fewer tokens each generation.
                    </p>
                  </div>
                )}

                {error && <Alert variant="error">{error}</Alert>}
                <Button onClick={generate} disabled={generating}>
                  {generating ? 'Generating ITP...' : 'Generate ITP with AI'}
                </Button>
              </div>
            </Card>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <PageHeader
            title="ITP Draft - Review and Save"
            actions={
              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="secondary" onClick={() => setStep(1)}>Regenerate</Button>
                <Button onClick={saveITP} disabled={saving}>{saving ? 'Saving...' : 'Save ITP'}</Button>
              </div>
            }
          />
          <div style={{ padding: '24px 32px' }}>
            <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
              <div style={{ maxWidth: 180 }}>
                <Input value={itpNumber} onChange={setItpNumber} placeholder="ITP Number" />
              </div>
              <div style={{ maxWidth: 400, flex: 1 }}>
                <Input value={itpTitle} onChange={setItpTitle} placeholder="ITP Name, e.g. Watermain Installation - Tawariki Street" />
              </div>
            </div>
            <p style={{ color: colors.textMuted, fontSize: 12, marginBottom: 16 }}>
              Work scope: {workDescription}
            </p>
            {error && <Alert variant="error">{error}</Alert>}
            <Card padding={0} style={{ overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    {['No.', 'Description', 'Resp.', 'Reference', 'Conformance Criteria', 'Method', 'Frequency', 'Type', 'Attendance', 'Records'].map(h => (
                      <th key={h} style={{
                        background: colors.bg, color: colors.textMuted, fontWeight: 600, padding: '10px 10px',
                        textAlign: 'left', borderBottom: `1px solid ${colors.border}`, whiteSpace: 'nowrap',
                        position: 'sticky', top: 0, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em'
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sections.map(section => (
                    <>
                      <tr key={section}>
                        <td colSpan={10} style={{ background: colors.bg, color: colors.textSecondary, fontWeight: 600, fontSize: 12, padding: '8px 10px' }}>{section}</td>
                      </tr>
                      {activities.filter(a => a.section === section).map((a, i) => {
                        const tc = TYPE_COLORS[a.type] ?? TYPE_COLORS.S
                        return (
                          <tr key={i}>
                            <td style={{ padding: '8px 10px', borderBottom: `1px solid ${colors.border}`, color: colors.textMuted, fontWeight: 600, verticalAlign: 'top' }}>{a.actNo}</td>
                            <td style={{ padding: '8px 10px', borderBottom: `1px solid ${colors.border}`, color: colors.textPrimary, verticalAlign: 'top', lineHeight: 1.5 }}>{a.description}</td>
                            <td style={{ padding: '8px 10px', borderBottom: `1px solid ${colors.border}`, color: colors.textSecondary, verticalAlign: 'top' }}>{a.responsibility}</td>
                            <td style={{ padding: '8px 10px', borderBottom: `1px solid ${colors.border}`, color: colors.textMuted, fontSize: 11, verticalAlign: 'top' }}>{a.reference}</td>
                            <td style={{ padding: '8px 10px', borderBottom: `1px solid ${colors.border}`, color: colors.textPrimary, verticalAlign: 'top' }}>{a.conformanceCriteria}</td>
                            <td style={{ padding: '8px 10px', borderBottom: `1px solid ${colors.border}`, color: colors.textSecondary, verticalAlign: 'top' }}>{a.method}</td>
                            <td style={{ padding: '8px 10px', borderBottom: `1px solid ${colors.border}`, color: colors.textSecondary, verticalAlign: 'top' }}>{a.frequency}</td>
                            <td style={{ padding: '8px 10px', borderBottom: `1px solid ${colors.border}`, verticalAlign: 'top' }}>
                              <span style={{ background: tc.bg, color: tc.text, border: `1px solid ${tc.border}`, fontSize: 10, padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>{a.type}</span>
                            </td>
                            <td style={{ padding: '8px 10px', borderBottom: `1px solid ${colors.border}`, color: colors.textSecondary, fontSize: 11, verticalAlign: 'top' }}>{Array.isArray(a.attendance) ? a.attendance.join(', ') : a.attendance}</td>
                            <td style={{ padding: '8px 10px', borderBottom: `1px solid ${colors.border}`, color: colors.textMuted, fontSize: 11, verticalAlign: 'top' }}>{a.records}</td>
                          </tr>
                        )
                      })}
                    </>
                  ))}
                </tbody>
              </table>
            </Card>
            <p style={{ color: colors.textMuted, fontSize: 12, marginTop: 12 }}>{activities.length} activities generated - review and edit before saving</p>
          </div>
        </>
      )}
    </PageShell>
  )
}
