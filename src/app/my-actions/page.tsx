'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { PageShell, PageHeader, Card, colors, LoadingPage, SkeletonCard, Alert } from '@/components/ui'

interface ActionItem {
  id: string
  kind: 'itp' | 'notice' | 'observation'
  title: string
  subtitle: string
  projectId: string
  projectName: string
  status: string
  href: string
}

export default function MyActionsPage() {
  const router = useRouter()
  const supabase = createClient()
  const [items, setItems] = useState<ActionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      const { data: userData } = await supabase.auth.getUser()
      const user = userData?.user
      if (!user) { router.push('/auth/login'); return }

      const [itpsRes, noticesRes, obsRes] = await Promise.all([
        supabase.from('itps').select('id, project_id, itp_number, title, status').eq('assigned_to', user.id),
        supabase.from('notices').select('id, project_id, notice_number, type, status').eq('assigned_to', user.id),
        supabase.from('safety_observations').select('id, project_id, observation_number, category, status').eq('assigned_to', user.id),
      ])

      const projectIds = new Set<string>()
      ;(itpsRes.data ?? []).forEach(r => projectIds.add(r.project_id))
      ;(noticesRes.data ?? []).forEach(r => projectIds.add(r.project_id))
      ;(obsRes.data ?? []).forEach(r => projectIds.add(r.project_id))

      let projectNames: Record<string, string> = {}
      if (projectIds.size > 0) {
        const { data: projects } = await supabase.from('projects').select('id, name').in('id', Array.from(projectIds))
        projectNames = Object.fromEntries((projects ?? []).map(p => [p.id, p.name]))
      }

      const combined: ActionItem[] = [
        ...(itpsRes.data ?? []).map(r => ({
          id: r.id, kind: 'itp' as const,
          title: `${r.itp_number} - ${r.title}`,
          subtitle: 'ITP',
          projectId: r.project_id,
          projectName: projectNames[r.project_id] ?? 'Unknown project',
          status: r.status,
          href: `/projects/${r.project_id}/itps/${r.id}`,
        })),
        ...(noticesRes.data ?? []).map(r => ({
          id: r.id, kind: 'notice' as const,
          title: `${r.notice_number} - ${r.type}`,
          subtitle: 'Notice',
          projectId: r.project_id,
          projectName: projectNames[r.project_id] ?? 'Unknown project',
          status: r.status,
          href: `/projects/${r.project_id}/notices/${r.id}`,
        })),
        ...(obsRes.data ?? []).map(r => ({
          id: r.id, kind: 'observation' as const,
          title: `${r.observation_number} - ${r.category}`,
          subtitle: 'Safety Observation',
          projectId: r.project_id,
          projectName: projectNames[r.project_id] ?? 'Unknown project',
          status: r.status,
          href: `/projects/${r.project_id}/safety/observations/${r.id}`,
        })),
      ]

      combined.sort((a, b) => a.projectName.localeCompare(b.projectName) || a.title.localeCompare(b.title))
      setItems(combined)
      setLoading(false)
    }
    load().catch(err => { setError(err.message ?? 'Failed to load'); setLoading(false) })
  }, [])

  if (loading) {
    return (
      <PageShell activeSection="my-actions">
        <PageHeader title="My Actions" subtitle="ITPs, Notices and Safety Observations assigned to you, across all your projects" />
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </PageShell>
    )
  }

  const openItems = items.filter(i => i.status !== 'closed' && i.status !== 'approved' && i.status !== 'complete')
  const otherItems = items.filter(i => !openItems.includes(i))

  return (
    <PageShell activeSection="my-actions">
      <PageHeader title="My Actions" subtitle="ITPs, Notices and Safety Observations assigned to you, across all your projects" />
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 32px' }}>
        {error && <div style={{ marginBottom: 16 }}><Alert variant="error">{error}</Alert></div>}

        {items.length === 0 ? (
          <Card>
            <div style={{ fontSize: 13, color: colors.textMuted, textAlign: 'center', padding: '20px 0' }}>
              Nothing is assigned to you right now.
            </div>
          </Card>
        ) : (
          <>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: colors.textMuted, marginBottom: 10 }}>
              Open ({openItems.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: openItems.length > 0 ? 28 : 0 }}>
              {openItems.map(item => <ActionRow key={`${item.kind}-${item.id}`} item={item} />)}
            </div>

            {otherItems.length > 0 && (
              <>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: colors.textMuted, marginBottom: 10 }}>
                  Closed / Complete ({otherItems.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {otherItems.map(item => <ActionRow key={`${item.kind}-${item.id}`} item={item} />)}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </PageShell>
  )
}

function ActionRow({ item }: { item: ActionItem }) {
  const kindColor = item.kind === 'itp' ? colors.accentInk : item.kind === 'notice' ? '#B3261E' : '#2F6B1F'
  return (
    <a href={item.href} style={{ textDecoration: 'none' }}>
      <Card style={{ padding: '12px 16px', cursor: 'pointer' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <span style={{
              background: kindColor, color: '#fff', fontSize: 10, fontWeight: 700,
              padding: '3px 8px', borderRadius: 4, whiteSpace: 'nowrap',
            }}>{item.subtitle}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {item.title}
              </div>
              <div style={{ fontSize: 11, color: colors.textMuted }}>{item.projectName}</div>
            </div>
          </div>
          <span style={{ fontSize: 11, color: colors.textMuted, whiteSpace: 'nowrap' }}>{item.status}</span>
        </div>
      </Card>
    </a>
  )
}
