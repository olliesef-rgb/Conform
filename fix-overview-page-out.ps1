@'
'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  PageShell, PageHeader, Card, CardHeader, CardBody, Button, Badge,
  StatCard, EmptyState, SkeletonCard, ProgressBar, colors, Table, NoticeTypeBadge
} from '@/components/ui'

interface Project {
  id: string
  name: string
  contract_number?: string
  client?: string
  status?: string
  description?: string
  created_at: string
}

interface ITP {
  id: string
  itp_number: string
  title: string
  discipline: string
  status: string
  created_at: string
}

interface SWMS {
  id: string
  swms_number: string
  title: string
  discipline: string
  status: string
  revision: string
  created_at: string
}

interface Lot {
  id: string
  lot_number: string
  name: string
  status: string
}

interface Notice {
  id: string
  type: string
  status: string
  notice_number: string
  title: string
}

interface Observation {
  id: string
  category: string
  status: string
  observation_number: string
}

type Tab = 'overview' | 'quality' | 'safety'

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createClient()

  const [project, setProject] = useState<Project | null>(null)
  const [itps, setItps] = useState<ITP[]>([])
  const [swms, setSwms] = useState<SWMS[]>([])
  const [lots, setLots] = useState<Lot[]>([])
  const [notices, setNotices] = useState<Notice[]>([])
  const [observations, setObservations] = useState<Observation[]>([])
  const [activities, setActivities] = useState<{ itp_id: string; is_complete: boolean }[]>([])
  const [expandedLots, setExpandedLots] = useState<Record<string, boolean>>({})
  const [expandedNoticeTypes, setExpandedNoticeTypes] = useState<Record<string, boolean>>({})
  const [expandedObsStatus, setExpandedObsStatus] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('overview')

  useEffect(() => {
    async function load() {
      const [{ data: proj }, { data: itpData }, { data: swmsData }, { data: lotData }, { data: noticeData }, { data: obsData }] = await Promise.all([
        supabase.from('projects').select('*').eq('id', id).single(),
        supabase.from('itps').select('*').eq('project_id', id).order('created_at', { ascending: false }),
        supabase.from('swms').select('*').eq('project_id', id).order('created_at', { ascending: false }),
        supabase.from('lots').select('id, lot_number, name, status').eq('project_id', id),
        supabase.from('notices').select('id, type, status, notice_number, title').eq('project_id', id),
        supabase.from('safety_observations').select('id, category, status, observation_number').eq('project_id', id),
      ])
      setProject(proj)
      setItps(itpData ?? [])
      setSwms(swmsData ?? [])
      setLots(lotData ?? [])
      setNotices(noticeData ?? [])
      setObservations(obsData ?? [])

      const itpIds = (itpData ?? []).map((i: any) => i.id)
      if (itpIds.length > 0) {
        const { data: actData } = await supabase.from('itp_activities').select('itp_id, is_complete').in('itp_id', itpIds)
        setActivities(actData ?? [])
      } else {
        setActivities([])
      }

      setLoading(false)
    }
    load()
  }, [id])

  function toggleLot(lotId: string) {
    setExpandedLots(prev => ({ ...prev, [lotId]: !prev[lotId] }))
  }
  function toggleNoticeType(type: string) {
    setExpandedNoticeTypes(prev => ({ ...prev, [type]: !prev[type] }))
  }
  function toggleObsStatus(status: string) {
    setExpandedObsStatus(prev => ({ ...prev, [status]: !prev[status] }))
  }

  if (loading) {
    return (
      <PageShell projectId={id} activeSection="overview">
        <PageHeader title="Loading..." breadcrumbs={[{ label: 'Projects', href: '/dashboard' }, { label: '...' }]} />
        <div style={{ padding: 32, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
        </div>
      </PageShell>
    )
  }

  if (!project) {
    return (
      <PageShell>
        <div style={{ padding: 32 }}>
          <Card><EmptyState icon="\u274C" title="Project not found" description="This project does not exist or you don't have access." action={<Button onClick={() => router.push('/dashboard')}>Back to Projects</Button>} /></Card>
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell projectId={id} activeSection={tab}>
      <PageHeader
        title={project.name}
        subtitle={[project.client, project.contract_number].filter(Boolean).join(' \u00B7 ')}
        breadcrumbs={[{ label: 'Projects', href: '/dashboard' }, { label: project.name }]}
        actions={
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Button variant="secondary" href={`/api/export/projects/${id}/summary`} download>Download Project Summary</Button>
            <Badge variant={project.status as any ?? 'active'}>
              {(project.status ?? 'Active').charAt(0).toUpperCase() + (project.status ?? 'active').slice(1)}
            </Badge>
          </div>
        }
      />

      {/* Tab bar */}
      <div style={{ background: colors.surface, borderBottom: `1px solid ${colors.border}`, padding: '0 32px', display: 'flex', gap: 0 }}>
        {([
          { key: 'overview', label: 'Overview' },
          { key: 'quality',  label: `Quality (${itps.length} ITPs)` },
          { key: 'safety',   label: `Safety (${swms.length} SWMS)` },
        ] as { key: Tab; label: string }[]).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '14px 20px', fontSize: 14, fontWeight: tab === t.key ? 600 : 400,
              color: tab === t.key ? colors.primary : colors.textSecondary,
              background: 'none', border: 'none', cursor: 'pointer',
              borderBottom: tab === t.key ? `2px solid ${colors.primary}` : '2px solid transparent',
              fontFamily: 'inherit', transition: 'all 0.15s ease',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ padding: 32 }}>

        {/* OVERVIEW TAB */}
        {tab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
              <StatCard label="Quality Completion" value={`${activities.length > 0 ? Math.round((activities.filter(a => a.is_complete).length / activities.length) * 100) : 0}%`} icon="\uD83D\uDCCB" color={colors.teal} />
              <StatCard label="SWMS" value={swms.length} icon="\u26A0" color={colors.orange} />
              <StatCard label="Open Notices" value={notices.filter(n => n.status !== 'closed').length} icon="\u2715" color={colors.danger} />
              <StatCard label="Open Safety Observations" value={observations.filter(o => o.status !== 'closed').length} icon="H" color={colors.warning} />
            </div>

            {/* Lot progress */}
            {lots.length > 0 && (
              <Card>
                <CardHeader>
                  <span style={{ fontSize: 15, fontWeight: 600, color: colors.textPrimary }}>Lot Progress</span>
                  <Button size="sm" variant="ghost" onClick={() => router.push(`/projects/${id}/lots`)}>View all -&gt;</Button>
                </CardHeader>
                <CardBody>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {lots.map(lot => {
                      const lotItpIds = itps.filter((i: any) => i.lot_id === lot.id).map(i => i.id)
                      const lotActs = activities.filter(a => lotItpIds.includes(a.itp_id))
                      const pct = lotActs.length > 0 ? Math.round((lotActs.filter(a => a.is_complete).length / lotActs.length) * 100) : 0
                      const label = lot.lot_number || lot.name || lot.id
                      const lotItps = itps.filter((i: any) => i.lot_id === lot.id)
                      const expanded = !!expandedLots[lot.id]
                      return (
                        <div key={lot.id}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, marginBottom: 4 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span
                                onClick={() => toggleLot(lot.id)}
                                style={{ cursor: 'pointer', color: colors.textMuted, fontSize: 11, width: 14, display: 'inline-block' }}
                              >{expanded ? '\u25BE' : '\u25B8'}</span>
                              <span style={{ fontWeight: 600, color: colors.textPrimary, cursor: 'pointer' }} onClick={() => router.push(`/projects/${id}/lots/${lot.id}`)}>{label}</span>
                            </div>
                            <span style={{ color: colors.textMuted }}>{pct}%</span>
                          </div>
                          <ProgressBar percent={pct} />
                          {expanded && (
                            <div style={{ marginTop: 8, marginLeft: 22, display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {lotItps.length === 0 ? (
                                <div style={{ fontSize: 12, color: colors.textMuted }}>No ITPs assigned to this lot.</div>
                              ) : lotItps.map((itp: any) => {
                                const itpActs = activities.filter(a => a.itp_id === itp.id)
                                const itpPct = itpActs.length > 0 ? Math.round((itpActs.filter(a => a.is_complete).length / itpActs.length) * 100) : 0
                                return (
                                  <div
                                    key={itp.id}
                                    onClick={() => router.push(`/projects/${id}/itps/${itp.id}`)}
                                    style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, cursor: 'pointer', padding: '4px 0', color: colors.textSecondary }}
                                  >
                                    <span>{itp.itp_number} - {itp.title}</span>
                                    <span style={{ color: colors.textMuted }}>{itpPct}%</span>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </CardBody>
              </Card>
            )}

            {/* Notices & Safety Observations status breakdown */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Card>
                <CardHeader>
                  <span style={{ fontSize: 15, fontWeight: 600, color: colors.textPrimary }}>Notices</span>
                  <Button size="sm" variant="ghost" onClick={() => router.push(`/projects/${id}/notices`)}>Open register -&gt;</Button>
                </CardHeader>
                <CardBody>
                  {notices.length === 0 ? (
                    <div style={{ fontSize: 13, color: colors.textMuted }}>No notices raised yet.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {Array.from(new Set(notices.map(n => n.type))).map(type => {
                        const typeNotices = notices.filter(n => n.type === type)
                        const openCount = typeNotices.filter(n => n.status === 'open').length
                        const pendingCount = typeNotices.filter(n => n.status === 'pending_response').length
                        const closedCount = typeNotices.filter(n => n.status === 'closed').length
                        const expanded = !!expandedNoticeTypes[type]
                        return (
                          <div key={type}>
                            <div
                              onClick={() => toggleNoticeType(type)}
                              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, cursor: 'pointer', padding: '4px 0' }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ color: colors.textMuted, fontSize: 11, width: 14, display: 'inline-block' }}>{expanded ? '\u25BE' : '\u25B8'}</span>
                                <span style={{ fontWeight: 600, color: colors.textPrimary }}>{type}</span>
                              </div>
                              <span style={{ color: colors.textMuted, fontSize: 12 }}>{`${openCount} open \u00B7 ${pendingCount} pending \u00B7 ${closedCount} closed`}</span>
                            </div>
                            {expanded && (
                              <div style={{ marginTop: 4, marginLeft: 22, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {typeNotices.map(n => (
                                  <div
                                    key={n.id}
                                    onClick={() => router.push(`/projects/${id}/notices/${n.id}`)}
                                    style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, cursor: 'pointer', color: colors.textSecondary, padding: '3px 0' }}
                                  >
                                    <span>{n.notice_number} - {n.title}</span>
                                    <span style={{ color: colors.textMuted }}>{n.status === 'open' ? 'Open' : n.status === 'pending_response' ? 'Pending' : 'Closed'}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </CardBody>
              </Card>

              <Card>
                <CardHeader>
                  <span style={{ fontSize: 15, fontWeight: 600, color: colors.textPrimary }}>Safety Observations</span>
                  <Button size="sm" variant="ghost" onClick={() => router.push(`/projects/${id}/safety/observations`)}>Open register -&gt;</Button>
                </CardHeader>
                <CardBody>
                  {observations.length === 0 ? (
                    <div style={{ fontSize: 13, color: colors.textMuted }}>No safety observations raised yet.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {['open', 'closed'].map(status => {
                        const statusObs = observations.filter(o => o.status === status)
                        const pct = observations.length > 0 ? Math.round((statusObs.length / observations.length) * 100) : 0
                        const expanded = !!expandedObsStatus[status]
                        return (
                          <div key={status}>
                            <div
                              onClick={() => toggleObsStatus(status)}
                              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, marginBottom: 4, cursor: 'pointer' }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ color: colors.textMuted, fontSize: 11, width: 14, display: 'inline-block' }}>{expanded ? '\u25BE' : '\u25B8'}</span>
                                <span style={{ color: colors.textSecondary }}>{status === 'open' ? 'Open' : 'Closed'}</span>
                              </div>
                              <span style={{ color: colors.textMuted }}>{statusObs.length}</span>
                            </div>
                            <ProgressBar percent={pct} />
                            {expanded && (
                              <div style={{ marginTop: 6, marginLeft: 22, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {statusObs.map(o => (
                                  <div
                                    key={o.id}
                                    onClick={() => router.push(`/projects/${id}/safety/observations/${o.id}`)}
                                    style={{ fontSize: 12, cursor: 'pointer', color: colors.textSecondary, padding: '3px 0' }}
                                  >
                                    {o.observation_number} - {o.category}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </CardBody>
              </Card>
            </div>

            {/* Quick actions */}
            <Card>
              <CardHeader>
                <span style={{ fontSize: 15, fontWeight: 600, color: colors.textPrimary }}>Quick Actions</span>
              </CardHeader>
              <CardBody>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                  <QuickAction
                    icon="\uD83D\uDCCB" label="Generate ITP" description="Create a new Inspection & Test Plan"
                    color={colors.teal} onClick={() => router.push(`/projects/${id}/itps/new`)}
                  />
                  <QuickAction
                    icon="\u26A0" label="Generate SWMS" description="Create a Safe Work Method Statement"
                    color={colors.orange} onClick={() => router.push(`/projects/${id}/swms/new`)}
                  />
                  <QuickAction
                    icon="\u2600" label="Generate Pre-Start" description="Auto-fill today's safety controls from the scheduled SWMS"
                    color={colors.primary} onClick={() => {}} disabled
                    disabledLabel="Coming soon"
                  />
                </div>
              </CardBody>
            </Card>
          </div>
        )}

        {/* QUALITY TAB */}
        {tab === 'quality' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 600, color: colors.textPrimary }}>Inspection & Test Plans</h2>
                <p style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2 }}>{itps.length} ITPs on this project</p>
              </div>
              <Button onClick={() => router.push(`/projects/${id}/itps/new`)}>+ Generate ITP</Button>
            </div>

            {itps.length === 0 ? (
              <Card>
                <EmptyState
                  icon="\uD83D\uDCCB"
                  title="No ITPs yet"
                  description="Generate your first Inspection and Test Plan using AI."
                  action={<Button onClick={() => router.push(`/projects/${id}/itps/new`)}>+ Generate ITP</Button>}
                />
              </Card>
            ) : (
              <Card padding={0}>
                {itps.map((itp, i) => (
                  <ITPRow key={itp.id} itp={itp} onClick={() => router.push(`/projects/${id}/itps/${itp.id}`)} last={i === itps.length - 1} />
                ))}
              </Card>
            )}
          </div>
        )}

        {/* SAFETY TAB */}
        {tab === 'safety' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 600, color: colors.textPrimary }}>Safe Work Method Statements</h2>
                <p style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2 }}>{swms.length} SWMS on this project</p>
              </div>
              <Button variant="orange" onClick={() => router.push(`/projects/${id}/swms/new`)}>+ Generate SWMS</Button>
            </div>

            {swms.length === 0 ? (
              <Card>
                <EmptyState
                  icon="\u26A0"
                  title="No SWMS yet"
                  description="Generate your first Safe Work Method Statement using AI."
                  action={<Button variant="orange" onClick={() => router.push(`/projects/${id}/swms/new`)}>+ Generate SWMS</Button>}
                />
              </Card>
            ) : (
              <Card padding={0}>
                {swms.map((s, i) => (
                  <SWMSRow key={s.id} swms={s} onClick={() => router.push(`/projects/${id}/swms/${s.id}`)} last={i === swms.length - 1} />
                ))}
              </Card>
            )}
          </div>
        )}
      </div>
    </PageShell>
  )
}

// ---- ROW COMPONENTS ----

function ITPRow({ itp, onClick, last = false }: { itp: ITP; onClick: () => void; last?: boolean }) {
  const date = new Date(itp.created_at).toLocaleDateString('en-NZ', { day: '2-digit', month: 'short', year: 'numeric' })
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', padding: '14px 20px', gap: 14, cursor: 'pointer',
        borderBottom: last ? 'none' : `1px solid ${colors.border}`,
        transition: 'background 0.1s ease',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = colors.bg)}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      <div style={{ width: 36, height: 36, borderRadius: 8, background: colors.tealLight, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 16 }}>{'\uD83D\uDCCB'}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: colors.textPrimary, whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }}>{itp.title}</div>
        <div style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2, display: 'flex', gap: 10 }}>
          <span>{itp.itp_number}</span>
          <span>{'\u00B7'}</span>
          <span>{itp.discipline}</span>
          <span>{'\u00B7'}</span>
          <span>{date}</span>
        </div>
      </div>
      <Badge variant={itp.status as any ?? 'draft'}>{itp.status ?? 'Draft'}</Badge>
      <span style={{ color: colors.textMuted, fontSize: 18 }}>{'\u203A'}</span>
    </div>
  )
}

function SWMSRow({ swms, onClick, last = false }: { swms: SWMS; onClick: () => void; last?: boolean }) {
  const date = new Date(swms.created_at).toLocaleDateString('en-NZ', { day: '2-digit', month: 'short', year: 'numeric' })
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', padding: '14px 20px', gap: 14, cursor: 'pointer',
        borderBottom: last ? 'none' : `1px solid ${colors.border}`,
        transition: 'background 0.1s ease',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = colors.bg)}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      <div style={{ width: 36, height: 36, borderRadius: 8, background: colors.orangeLight, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 16 }}>{'\u26A0'}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: colors.textPrimary, whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }}>{swms.title}</div>
        <div style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2, display: 'flex', gap: 10 }}>
          <span>{swms.swms_number}</span>
          <span>{'\u00B7'}</span>
          <span>Rev {swms.revision}</span>
          <span>{'\u00B7'}</span>
          <span>{swms.discipline}</span>
          <span>{'\u00B7'}</span>
          <span>{date}</span>
        </div>
      </div>
      <Badge variant={swms.status as any ?? 'draft'}>{swms.status ?? 'Draft'}</Badge>
      <span style={{ color: colors.textMuted, fontSize: 18 }}>{'\u203A'}</span>
    </div>
  )
}

function QuickAction({ icon, label, description, color, onClick, disabled, disabledLabel }: {
  icon: string; label: string; description: string; color: string;
  onClick: () => void; disabled?: boolean; disabledLabel?: string
}) {
  return (
    <div
      onClick={disabled ? undefined : onClick}
      style={{
        padding: '16px', borderRadius: 10, border: `1px solid ${colors.border}`,
        cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.6 : 1,
        transition: 'all 0.15s ease', background: '#fff',
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.borderColor = color }}
      onMouseLeave={e => { if (!disabled) e.currentTarget.style.borderColor = colors.border }}
    >
      <div style={{ fontSize: 24, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: colors.textPrimary, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13, color: colors.textSecondary }}>{disabled ? disabledLabel : description}</div>
    </div>
  )
}
'@ | Set-Content -LiteralPath 'src\app\projects\[id]\page.tsx' -Encoding UTF8
Write-Host "DONE - page.tsx fully rewritten and repaired" -ForegroundColor Green
Write-Host "`nPress Enter to close this window..." -ForegroundColor Cyan
Read-Host
