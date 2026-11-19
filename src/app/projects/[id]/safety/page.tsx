'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  PageShell, PageHeader, Card, Button, Badge, Icon,
  EmptyState, SkeletonCard, colors
} from '@/components/ui'

interface SWMS {
  id: string
  swms_number: string
  title: string
  discipline: string
  status: string
  revision: string
  created_at: string
}

interface Observation {
  id: string
  category: string
  observation_number: string
  description: string
  status: string
  raised_at: string
}

type SafetyTab = 'swms' | 'observations'

export default function SafetyPage() {
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const projectId = params.id as string
  const supabase = createClient()

  const initialTab = (searchParams.get('tab') === 'observations' ? 'observations' : 'swms') as SafetyTab
  const [tab, setTab] = useState<SafetyTab>(initialTab)

  const [swmsList, setSwmsList] = useState<SWMS[]>([])
  const [observations, setObservations] = useState<Observation[]>([])
  const [statusFilter, setStatusFilter] = useState('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [{ data: swmsData }, { data: obsData }] = await Promise.all([
        supabase.from('swms').select('id, swms_number, title, discipline, status, revision, created_at').eq('project_id', projectId).order('created_at', { ascending: false }),
        supabase.from('safety_observations').select('id, category, observation_number, description, status, raised_at').eq('project_id', projectId).order('raised_at', { ascending: false }),
      ])
      setSwmsList(swmsData ?? [])
      setObservations(obsData ?? [])
      setLoading(false)
    }
    load()
  }, [projectId])

  function switchTab(next: SafetyTab) {
    setTab(next)
    router.replace(`/projects/${projectId}/safety?tab=${next}`)
  }

  const filteredObs = observations.filter(o => statusFilter === 'all' || o.status === statusFilter)
  const openCount = observations.filter(o => o.status === 'open').length
  const closedCount = observations.filter(o => o.status === 'closed').length

  return (
    <PageShell projectId={projectId} activeSection="safety">
      <PageHeader
        title="Safety"
        subtitle="SWMS and safety observations for this project"
        actions={
          tab === 'swms' ? (
            <Button size="sm" onClick={() => router.push(`/projects/${projectId}/swms/new`)}>+ Generate SWMS</Button>
          ) : (
            <Button size="sm" onClick={() => router.push(`/projects/${projectId}/safety/observations/new`)}>+ Raise Observation</Button>
          )
        }
      />

      <div style={{ background: colors.surface, borderBottom: `1px solid ${colors.border}`, padding: '0 32px', display: 'flex', gap: 0 }}>
        {([
          { key: 'swms', label: `SWMS (${swmsList.length})` },
          { key: 'observations', label: `Observations (${observations.length})` },
        ] as { key: SafetyTab; label: string }[]).map(t => (
          <button
            key={t.key}
            onClick={() => switchTab(t.key)}
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

      <div style={{ padding: '32px' }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
          </div>
        ) : tab === 'swms' ? (
          swmsList.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Icon.swms />}
                title="No SWMS yet"
                description="Generate your first Safe Work Method Statement for this project using AI."
                action={<Button onClick={() => router.push(`/projects/${projectId}/swms/new`)}>+ Generate First SWMS</Button>}
              />
            </Card>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {swmsList.map(s => (
                <Card
                  key={s.id}
                  hover
                  onClick={() => router.push(`/projects/${projectId}/swms/${s.id}`)}
                  padding={0}
                  style={{ cursor: 'pointer' }}
                >
                  <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{
                      width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                      background: colors.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: colors.accentInk,
                    }}><Icon.swms /></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 15, fontWeight: 600, color: colors.textPrimary }}>
                          {s.swms_number} &mdash; {s.title}
                        </span>
                        <Badge variant={s.status as any}>{(s.status || 'draft').toUpperCase()}</Badge>
                      </div>
                      <span style={{ fontSize: 13, color: colors.textSecondary }}>
                        {s.discipline} &middot; Rev {s.revision}
                      </span>
                    </div>
                    <span style={{ color: colors.textMuted, flexShrink: 0, display: 'flex' }}><Icon.chevronRight /></span>
                  </div>
                </Card>
              ))}
            </div>
          )
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                style={{ padding: '7px 12px', borderRadius: 8, border: `1px solid ${colors.border}`, fontSize: 13 }}
              >
                <option value="all">All Statuses</option>
                <option value="open">Open</option>
                <option value="closed">Closed</option>
              </select>
              <span style={{ fontSize: 13, color: colors.textMuted }}>{openCount} open &middot; {closedCount} closed</span>
            </div>

            {filteredObs.length === 0 ? (
              <Card>
                <EmptyState
                  icon={<Icon.swms />}
                  title="No safety observations yet"
                  description={observations.length > 0 ? 'No observations match this filter.' : 'Raise your first safety observation for this project.'}
                  action={observations.length === 0 ? <Button onClick={() => router.push(`/projects/${projectId}/safety/observations/new`)}>+ Raise Observation</Button> : undefined}
                />
              </Card>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {filteredObs.map(o => (
                  <Card
                    key={o.id}
                    hover
                    onClick={() => router.push(`/projects/${projectId}/safety/observations/${o.id}`)}
                    padding={0}
                    style={{ cursor: 'pointer' }}
                  >
                    <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
                      <div style={{
                        width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                        background: colors.accentSoft, color: colors.accentInk,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 700, textAlign: 'center', padding: 4,
                      }}>{o.category}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span style={{ fontSize: 15, fontWeight: 600, color: colors.textPrimary }}>
                            {o.observation_number} &mdash; {o.description}
                          </span>
                          <Badge variant={o.status as any}>{(o.status || 'open').toUpperCase()}</Badge>
                        </div>
                        <span style={{ fontSize: 13, color: colors.textSecondary }}>
                          Raised {new Date(o.raised_at).toLocaleDateString('en-NZ')}
                        </span>
                      </div>
                      <span style={{ color: colors.textMuted, flexShrink: 0, display: 'flex' }}><Icon.chevronRight /></span>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </PageShell>
  )
}
