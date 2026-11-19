'use client'
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { PageShell, PageHeader, Card, Button, LoadingPage, SkeletonCard, colors } from '@/components/ui'

interface Notice {
  id: string
  type: string
  notice_number: string
  title: string
  status: string
  raised_at: string
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  open: { bg: '#FBDADA', text: '#B3261E' },
  pending_response: { bg: '#FFF3C4', text: '#8A6300' },
  closed: { bg: '#E3F3DC', text: '#2F6B1F' },
}

const STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  pending_response: 'Pending Response',
  closed: 'Closed',
}

export default function NoticesPage() {
  const router = useRouter()
  const params = useParams()
  const projectId = params.id as string
  const supabase = createClient()

  const [notices, setNotices] = useState<Notice[]>([])
  const [projectName, setProjectName] = useState('')
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('notices').select('*').eq('project_id', projectId).order('raised_at', { ascending: false })
      setNotices(data ?? [])
      const { data: proj } = await supabase.from('projects').select('name').eq('id', projectId).single()
      setProjectName(proj?.name ?? 'Project')
      setLoading(false)
    }
    load()
  }, [projectId])

  if (loading) {
    return (
      <PageShell projectId={projectId} activeSection="notices">
        <PageHeader title="Notices" subtitle="RFIs, NCRs, EWNs, and other notices raised on this project" />
        <div style={{ padding: '24px 32px', maxWidth: 1000, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </PageShell>
    )
  }

  const types = Array.from(new Set(notices.map(n => n.type)))
  const filtered = notices.filter(n =>
    (typeFilter === 'all' || n.type === typeFilter) &&
    (statusFilter === 'all' || n.status === statusFilter)
  )

  return (
    <PageShell projectId={projectId} activeSection="notices">
      <PageHeader
        title="Notices"
        subtitle="RFIs, NCRs, EWNs, and other notices raised on this project"
        breadcrumbs={[{ label: projectName, href: `/projects/${projectId}` }, { label: 'Notices' }]}
        actions={<Button onClick={() => router.push(`/projects/${projectId}/notices/new`)}>+ Raise Notice</Button>}
      />

      <div style={{ padding: '24px 32px', maxWidth: 1000, margin: '0 auto' }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ padding: '7px 12px', borderRadius: 8, border: `1px solid ${colors.border}`, fontSize: 13 }}>
            <option value="all">All Types</option>
            {types.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ padding: '7px 12px', borderRadius: 8, border: `1px solid ${colors.border}`, fontSize: 13 }}>
            <option value="all">All Statuses</option>
            <option value="open">Open</option>
            <option value="pending_response">Pending Response</option>
            <option value="closed">Closed</option>
          </select>
        </div>

        {filtered.length === 0 ? (
          <Card>
            <div style={{ padding: '32px 0', textAlign: 'center', color: colors.textMuted, fontSize: 13 }}>
              No notices {notices.length > 0 ? 'match these filters' : 'raised on this project yet'}.
            </div>
          </Card>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map(n => {
              const sc = STATUS_COLORS[n.status] ?? STATUS_COLORS.open
              return (
                <Card key={n.id} padding={0} onClick={() => router.push(`/projects/${projectId}/notices/${n.id}`)} style={{ cursor: 'pointer' }}>
                  <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
                    <span style={{ background: colors.accentSoft, color: colors.accentInk, fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 4, minWidth: 40, textAlign: 'center' }}>{n.type}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary }}>{n.notice_number} - {n.title}</div>
                      <div style={{ fontSize: 12, color: colors.textMuted }}>Raised {new Date(n.raised_at).toLocaleDateString('en-NZ')}</div>
                    </div>
                    <span style={{ background: sc.bg, color: sc.text, fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999 }}>{STATUS_LABELS[n.status] ?? n.status}</span>
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </PageShell>
  )
}

