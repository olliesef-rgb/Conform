'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  PageShell, PageHeader, Card, CardHeader, CardBody, Button, Badge, StatCard,
  EmptyState, SkeletonCard, colors, Icon
} from '@/components/ui'

interface Project {
  id: string
  name: string
  contract_number?: string
  client?: string
  status?: string
  created_at: string
}

interface ItpRow { id: string; project_id: string; lot_id: string | null }
interface ActivityRow { itp_id: string; is_complete: boolean }
interface NoticeRow { project_id: string; status: string }
interface ObservationRow { project_id: string; status: string }
interface LotRow { id: string; project_id: string }

interface ProjectStats {
  itpCompletionPct: number | null
  openNotices: number
  openObservations: number
  lotCount: number
  avgLotProgress: number | null
}

export default function Dashboard() {
  const router = useRouter()
  const supabase = createClient()
  const [projects, setProjects] = useState<Project[]>([])
  const [statsByProject, setStatsByProject] = useState<Record<string, ProjectStats>>({})
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }
      setUser(user)
      const { data } = await supabase.from('projects').select('*').order('created_at', { ascending: false })
      const projectsData = data ?? []
      setProjects(projectsData)

      if (projectsData.length > 0) {
        const projectIds = projectsData.map(p => p.id)

        const [itpsRes, noticesRes, obsRes, lotsRes] = await Promise.all([
          supabase.from('itps').select('id, project_id, lot_id').in('project_id', projectIds),
          supabase.from('notices').select('project_id, status').in('project_id', projectIds),
          supabase.from('safety_observations').select('project_id, status').in('project_id', projectIds),
          supabase.from('lots').select('id, project_id').in('project_id', projectIds),
        ])

        const itps: ItpRow[] = itpsRes.data ?? []
        const notices: NoticeRow[] = noticesRes.data ?? []
        const observations: ObservationRow[] = obsRes.data ?? []
        const lots: LotRow[] = lotsRes.data ?? []

        let activities: ActivityRow[] = []
        if (itps.length > 0) {
          const { data: actData } = await supabase
            .from('itp_activities')
            .select('itp_id, is_complete')
            .in('itp_id', itps.map(i => i.id))
          activities = actData ?? []
        }

        const stats: Record<string, ProjectStats> = {}
        for (const p of projectsData) {
          const projectItps = itps.filter(i => i.project_id === p.id)
          const projectItpIds = projectItps.map(i => i.id)
          const projectActs = activities.filter(a => projectItpIds.includes(a.itp_id))
          const itpCompletionPct = projectActs.length > 0
            ? Math.round((projectActs.filter(a => a.is_complete).length / projectActs.length) * 100)
            : null

          const openNotices = notices.filter(n => n.project_id === p.id && n.status !== 'closed').length
          const openObservations = observations.filter(o => o.project_id === p.id && o.status !== 'closed').length

          const projectLots = lots.filter(l => l.project_id === p.id)
          const lotPcts = projectLots.map(lot => {
            const lotItpIds = projectItps.filter(i => i.lot_id === lot.id).map(i => i.id)
            const lotActs = projectActs.filter(a => lotItpIds.includes(a.itp_id))
            return lotActs.length > 0 ? (lotActs.filter(a => a.is_complete).length / lotActs.length) * 100 : 0
          })
          const avgLotProgress = lotPcts.length > 0 ? Math.round(lotPcts.reduce((a, b) => a + b, 0) / lotPcts.length) : null

          stats[p.id] = {
            itpCompletionPct, openNotices, openObservations,
            lotCount: projectLots.length, avgLotProgress,
          }
        }
        setStatsByProject(stats)
      }

      setLoading(false)
    }
    load()
  }, [])

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  const active = projects.filter(p => p.status !== 'closed').length
  const closed = projects.filter(p => p.status === 'closed').length

  return (
    <PageShell activeSection="projects">
      <PageHeader
        title="Projects"
        subtitle="All construction projects in your organisation"
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={signOut}>Sign out</Button>
            <Button size="sm" onClick={() => router.push('/projects/new')}>+ New Project</Button>
          </>
        }
      />

      <div style={{ padding: '32px' }}>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 32 }}>
          <StatCard label="Total Projects" value={projects.length} />
          <StatCard label="Active" value={active} color={colors.success} />
          <StatCard label="Closed" value={closed} color={colors.textSecondary} />
        </div>

        {/* Multi-project rollup */}
        {!loading && projects.length > 1 && (
          <Card style={{ marginBottom: 32 }}>
            <CardHeader>
              <span style={{ fontSize: 15, fontWeight: 600, color: colors.textPrimary }}>Project Rollup</span>
            </CardHeader>
            <CardBody>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
                      <th style={{ textAlign: 'left', padding: '8px 10px', color: colors.textMuted, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Project</th>
                      <th style={{ textAlign: 'right', padding: '8px 10px', color: colors.textMuted, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>ITP Completion</th>
                      <th style={{ textAlign: 'right', padding: '8px 10px', color: colors.textMuted, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Open Notices</th>
                      <th style={{ textAlign: 'right', padding: '8px 10px', color: colors.textMuted, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Open Safety Obs</th>
                      <th style={{ textAlign: 'right', padding: '8px 10px', color: colors.textMuted, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Lots</th>
                      <th style={{ textAlign: 'right', padding: '8px 10px', color: colors.textMuted, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Avg Lot Progress</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projects.map(p => {
                      const s = statsByProject[p.id]
                      return (
                        <tr
                          key={p.id}
                          onClick={() => router.push(`/projects/${p.id}`)}
                          style={{ borderBottom: `1px solid ${colors.border}`, cursor: 'pointer' }}
                        >
                          <td style={{ padding: '10px 10px', fontWeight: 600, color: colors.textPrimary, whiteSpace: 'nowrap' }}>{p.name}</td>
                          <td style={{ padding: '10px 10px', textAlign: 'right', color: colors.textSecondary }}>
                            {s?.itpCompletionPct == null ? '-' : `${s.itpCompletionPct}%`}
                          </td>
                          <td style={{ padding: '10px 10px', textAlign: 'right', color: (s?.openNotices ?? 0) > 0 ? colors.danger : colors.textSecondary }}>
                            {s?.openNotices ?? 0}
                          </td>
                          <td style={{ padding: '10px 10px', textAlign: 'right', color: (s?.openObservations ?? 0) > 0 ? colors.warning : colors.textSecondary }}>
                            {s?.openObservations ?? 0}
                          </td>
                          <td style={{ padding: '10px 10px', textAlign: 'right', color: colors.textSecondary }}>
                            {s?.lotCount ?? 0}
                          </td>
                          <td style={{ padding: '10px 10px', textAlign: 'right', color: colors.textSecondary }}>
                            {s?.avgLotProgress == null ? '-' : `${s.avgLotProgress}%`}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>
        )}

        {/* Projects list */}
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
          </div>
        ) : projects.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Icon.project />}
              title="No projects yet"
              description="Create your first project to start generating ITPs and SWMS documents."
              action={<Button onClick={() => router.push('/projects/new')}>+ Create First Project</Button>}
            />
          </Card>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {projects.map(project => (
              <ProjectCard
                key={project.id}
                project={project}
                onClick={() => router.push(`/projects/${project.id}`)}
              />
            ))}
          </div>
        )}
      </div>
    </PageShell>
  )
}

function ProjectCard({ project, onClick }: { project: Project; onClick: () => void }) {
  const status = project.status ?? 'active'
  const date = new Date(project.created_at).toLocaleDateString('en-NZ', { day: '2-digit', month: 'short', year: 'numeric' })

  return (
    <Card
      hover
      onClick={onClick}
      padding={0}
      style={{ cursor: 'pointer', transition: 'box-shadow 0.15s ease' }}
    >
      <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
        {/* Icon */}
        <div style={{
          width: 44, height: 44, borderRadius: 10, flexShrink: 0,
          background: colors.primaryLight, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: colors.primary,
        }}><Icon.itp /></div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: colors.textPrimary, whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {project.name}
            </span>
            <Badge variant={status as any}>{status.charAt(0).toUpperCase() + status.slice(1)}</Badge>
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' as const }}>
            {project.client && (
              <span style={{ fontSize: 13, color: colors.textSecondary }}>
                Client: <strong>{project.client}</strong>
              </span>
            )}
            {project.contract_number && (
              <span style={{ fontSize: 13, color: colors.textSecondary }}>
                Contract: <strong>{project.contract_number}</strong>
              </span>
            )}
            <span style={{ fontSize: 13, color: colors.textMuted }}>Created {date}</span>
          </div>
        </div>

        {/* Arrow */}
        <span style={{ color: colors.textMuted, flexShrink: 0, display: 'flex' }}><Icon.chevronRight /></span>
      </div>
    </Card>
  )
}
