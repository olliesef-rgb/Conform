'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  PageShell, PageHeader, Card, Button, Select, Textarea, Alert, Badge, LoadingPage, SkeletonCard, colors
} from '@/components/ui'

interface ProjectDocument {
  id: string
  name: string
  filename: string
  document_type: string
  page_count: number | null
  created_at: string
}

interface QAEntry {
  question: string
  answer: string
  sources: string[]
}

export default function DocumentsPage() {
  const params = useParams()
  const projectId = params.id as string
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [documents, setDocuments] = useState<ProjectDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [documentType, setDocumentType] = useState('specification')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [question, setQuestion] = useState('')
  const [asking, setAsking] = useState(false)
  const [askError, setAskError] = useState('')
  const [qaHistory, setQaHistory] = useState<QAEntry[]>([])
  const [askDocScope, setAskDocScope] = useState<'all' | 'selected'>('all')
  const [askSelectedDocIds, setAskSelectedDocIds] = useState<Set<string>>(new Set())

  function toggleAskDoc(id: string) {
    setAskSelectedDocIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  async function load() {
    setLoading(true)
    const res = await fetch(`/api/projects/${projectId}/documents/upload`)
    const data = await res.json()
    setDocuments(data.documents ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [projectId])

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError('')
    setSuccess('')

    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase.from('profiles').select('organisation_id').eq('id', user?.id).single()

    const formData = new FormData()
    formData.append('file', file)
    formData.append('documentType', documentType)
    formData.append('organisationId', profile?.organisation_id ?? '')
    formData.append('uploadedBy', user?.id ?? '')

    try {
      const res = await fetch(`/api/projects/${projectId}/documents/upload`, {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Upload failed')
      } else {
        setSuccess(`Uploaded "${file.name}" - ${data.chunks} sections indexed for AI reference`)
        load()
      }
    } catch (e) {
      setError('Upload failed - please try again')
    }
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleDelete(id: string) {
    if (!confirm('Remove this document? It will no longer be used as context for ITP generation or Ask Anything.')) return
    await fetch(`/api/projects/${projectId}/documents/upload?documentId=${id}`, { method: 'DELETE' })
    load()
  }

  async function askQuestion() {
    if (!question.trim()) return
    setAsking(true)
    setAskError('')
    const q = question.trim()
    try {
      const res = await fetch(`/api/projects/${projectId}/documents/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: q,
          documentIds: askDocScope === 'selected' ? Array.from(askSelectedDocIds) : null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setAskError(data.error || 'Could not get an answer')
      } else {
        setQaHistory(prev => [{ question: q, answer: data.answer, sources: data.sources ?? [] }, ...prev])
        setQuestion('')
      }
    } catch (e) {
      setAskError('Could not get an answer - please try again')
    }
    setAsking(false)
  }

  if (loading) {
    return (
      <PageShell projectId={projectId} activeSection="documents">
        <PageHeader title="Project Documents" subtitle="Upload specs and drawings for ITP generation and Ask Anything" />
        <div style={{ padding: 32, display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 760 }}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell projectId={projectId} activeSection="documents">
      <PageHeader
        title="Project Documents"
        subtitle="Upload specs and drawings - Claude references these first (ahead of your general ITP library) when generating ITPs, and you can ask questions about them directly below"
      />
      <div style={{ padding: '32px', maxWidth: 760 }}>
        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 14, alignItems: 'end' }}>
              <Select
                label="Document Type"
                value={documentType}
                onChange={setDocumentType}
                options={[
                  { value: 'specification', label: 'Specification' },
                  { value: 'drawing', label: 'Drawing' },
                  { value: 'standard', label: 'Standard' },
                  { value: 'rfi', label: 'RFI' },
                  { value: 'other', label: 'Other' },
                ]}
              />
              <Button onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                {uploading ? 'Uploading...' : 'Upload PDF'}
              </Button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              onChange={handleUpload}
              style={{ display: 'none' }}
            />
            <p style={{ fontSize: 12, color: colors.textMuted }}>
              PDF only, for now. Scanned image-only PDFs with no selectable text won't extract properly.
            </p>
          </div>
        </Card>

        {error && <div style={{ marginTop: 16 }}><Alert variant="error">{error}</Alert></div>}
        {success && <div style={{ marginTop: 16 }}><Alert variant="success">{success}</Alert></div>}

        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary, marginBottom: 10 }}>Ask Anything</div>
          <Card>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Textarea
                rows={2}
                placeholder="e.g. What's the required concrete strength for the chamber base slab? Or: How many linear metres of DN300 pipe does the spec call for?"
                value={question}
                onChange={setQuestion}
              />

              {documents.length > 0 && (
                <div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <button
                      type="button"
                      onClick={() => setAskDocScope('all')}
                      style={{
                        padding: '6px 14px', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                        border: `1px solid ${askDocScope === 'all' ? colors.accentInk : colors.border}`,
                        background: askDocScope === 'all' ? colors.accentSoft : '#fff',
                        color: askDocScope === 'all' ? colors.accentInk : colors.textSecondary,
                      }}
                    >
                      All documents
                    </button>
                    <button
                      type="button"
                      onClick={() => setAskDocScope('selected')}
                      style={{
                        padding: '6px 14px', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                        border: `1px solid ${askDocScope === 'selected' ? colors.accentInk : colors.border}`,
                        background: askDocScope === 'selected' ? colors.accentSoft : '#fff',
                        color: askDocScope === 'selected' ? colors.accentInk : colors.textSecondary,
                      }}
                    >
                      Select specific documents
                    </button>
                  </div>

                  {askDocScope === 'selected' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 180, overflowY: 'auto', padding: 10, border: `1px solid ${colors.border}`, borderRadius: 8, marginBottom: 4 }}>
                      {documents.map(doc => (
                        <label key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: colors.textPrimary, cursor: 'pointer' }}>
                          <input type="checkbox" checked={askSelectedDocIds.has(doc.id)} onChange={() => toggleAskDoc(doc.id)} />
                          {doc.name}
                          <span style={{ fontSize: 11, color: colors.textMuted }}>({doc.document_type})</span>
                        </label>
                      ))}
                    </div>
                  )}

                  <p style={{ fontSize: 12, color: colors.textMuted, margin: '0 0 4px' }}>
                    Narrowing to specific documents gives a more accurate, focused answer and is faster/cheaper than searching everything.
                  </p>
                </div>
              )}

              {askError && <Alert variant="error">{askError}</Alert>}
              <div>
                <Button onClick={askQuestion} disabled={asking || !question.trim()}>
                  {asking ? 'Thinking...' : 'Ask'}
                </Button>
              </div>
              <p style={{ fontSize: 12, color: colors.textMuted, margin: 0 }}>
                Answers are grounded only in the documents uploaded to this project below - it will tell you when something isn't stated in them rather than guess.
              </p>
            </div>
          </Card>

          {qaHistory.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
              {qaHistory.map((qa, i) => (
                <Card key={i} padding={0}>
                  <div style={{ padding: '14px 16px' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary, marginBottom: 8 }}>{qa.question}</div>
                    <div style={{ fontSize: 13, color: colors.textSecondary, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{qa.answer}</div>
                    {qa.sources.length > 0 && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                        {qa.sources.map((s, j) => (
                          <Badge key={j} variant="grey">{s}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        <div style={{ marginTop: 28 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary, marginBottom: 10 }}>Uploaded Documents</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {documents.length === 0 ? (
              <Card>
                <div style={{ textAlign: 'center', padding: '32px', fontSize: 13, color: colors.textMuted }}>
                  No documents uploaded yet for this project.
                </div>
              </Card>
            ) : documents.map(doc => (
              <Card key={doc.id} padding={0}>
                <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary }}>{doc.name}</div>
                    <div style={{ fontSize: 12, color: colors.textMuted }}>
                      {doc.page_count ? `${doc.page_count} pages` : ''} - Uploaded {new Date(doc.created_at).toLocaleDateString('en-NZ')}
                    </div>
                  </div>
                  <Badge variant="grey">{doc.document_type}</Badge>
                  <Button variant="secondary" size="sm" onClick={() => handleDelete(doc.id)}>Remove</Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </PageShell>
  )
}

