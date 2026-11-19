'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  PageShell, PageHeader, Card, Button, Badge, Icon,
  EmptyState, SkeletonCard, colors
} from '@/components/ui'

interface Lot {
  id: string
  lot_number: string
  name: string
  description?: string
  status: string
  created_at: string
}

interface ITP {
  id: string
  itp_number: string
  title: string
  discipline: string
  status: string
  revision: string
  created_at: string
  lot_id: string | null
}

type QualityTab = 'lots' | 'itps'

export default function QualityPage() {
  const router = useRouter()
  const params = useParams()
  const projectId = params.id as string
  const supabase = createClient()

  const [tab, setTab] = useState<QualityTab>('lots')
  const [lots, setLots] = useState<Lot[]>([])
  const [itps, setItps] = useState<ITP[]>([])
  const [loading, setLoading] = useState(true)
  const [updatingItpId, setUpdatingItpId] = useState<string | null>(null)

  async function load() {
    const [{ data: lotData }, { data: itpData }] = await Promise.all([
      supabase.from('lots').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
      supabase.from('itps').select('id, itp_number, title, discipline, status, revision, created_at, lot_id').eq('project_id', projectId).order('created_at', { ascending: false }),
    ])
    setLots(lotData ?? [])
    setItps(itpData ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [projectId])

  async function updateItpLot(itpId: string, newLotId: string) {
    setUpdatingItpId(itpId)
    await supabase.from('itps').update({ lot_id: newLotId || null }).eq('id', itpId)
    setItps(prev => prev.map(i => i.id === itpId ? { ...i, lot_id: newLotId || null } : i))
    setUpdatingItpId(null)
  }

  const lotLabel: Record<string, string> = {}
  lots.forEach(l => { lotLabel[l.id] = `${l.lot_number} - ${l.name}` })

  return (
    <PageShell projectId={projectId} activeSection="quality">
      <PageHeader
        title="Quality"
        subtitle="Lots and the ITPs tracked against them for this project"
        actions={
          tab === 'lots' ? (
            <Button size="sm" onClick={() => router.push(`/projects/${projectId}/lots/new`)}>+ New Lot</Button>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <Button size="sm" variant="secondary" onClick={() => router.push(`/projects/${projectId}/itps/manual`)}>+ Manual ITP</Button>
              <Button size="sm" onClick={() => router.push(`/projects/${projectId}/itps/new`)}>+ Generate ITP</Button>
            </div>
          )
        }
      />

      <div style={{ padding: '32px' }}>
        <div style={{ display: 'flex', gap: 4, background: colors.bg, padding: 4, borderRadius: 8, marginBottom: 20, width: 'fit-content' }}>
          {(['lots', 'itps'] as QualityTab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: '6px 16px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                background: tab === t ? '#fff' : 'transparent',
                color: tab === t ? colors.textPrimary : colors.textMuted,
                boxShadow: tab === t ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              {t === 'lots' ? `Lots (${lots.length})` : `ITPs (${itps.length})`}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
          </div>
        ) : tab === 'lots' ? (
          lots.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Icon.lots />}
                title="No lots yet"
                description="Create your first lot to group ITPs together and track completion as a work package."
                action={<Button onClick={() => router.push(`/projects/${projectId}/lots/new`)}>+ Create First Lot</Button>}
              />
            </Card>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {lots.map(lot => {
                const lotItpCount = itps.filter(i => i.lot_id === lot.id).length
                return (
                  <Card
                    key={lot.id}
                    hover
                    onClick={() => router.push(`/projects/${projectId}/lots/${lot.id}`)}
                    padding={0}
                    style={{ cursor: 'pointer' }}
                  >
                    <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
                      <div style={{
                        width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                        background: colors.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: colors.accentInk,
                      }}><Icon.lots /></div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span style={{ fontSize: 15, fontWeight: 600, color: colors.textPrimary }}>
                            {lot.lot_number} - {lot.name}
                          </span>
                          <Badge variant={lot.status === 'closed' ? 'closed' : 'active'}>
                            {lot.status.charAt(0).toUpperCase() + lot.status.slice(1)}
                          </Badge>
                        </div>
                        <span style={{ fontSize: 13, color: colors.textSecondary }}>
                          {lotItpCount} ITP{lotItpCount === 1 ? '' : 's'}{lot.description ? ` - ${lot.description}` : ''}
                        </span>
                      </div>
                      <span style={{ color: colors.textMuted, flexShrink: 0, display: 'flex' }}><Icon.chevronRight /></span>
                    </div>
                  </Card>
                )
              })}
            </div>
          )
        ) : (
          itps.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Icon.itp />}
                title="No ITPs yet"
                description="Generate your first Inspection and Test Plan for this project using AI."
                action={<Button onClick={() => router.push(`/projects/${projectId}/itps/new`)}>+ Generate First ITP</Button>}
              />
            </Card>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {itps.map(itp => (
                <Card key={itp.id} padding={0}>
                  <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div
                      onClick={() => router.push(`/projects/${projectId}/itps/${itp.id}`)}
                      style={{
                        width: 44, height: 44, borderRadius: 10, flexShrink: 0, cursor: 'pointer',
                        background: colors.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: colors.accentInk,
                      }}><Icon.itp /></div>
                    <div
                      onClick={() => router.push(`/projects/${projectId}/itps/${itp.id}`)}
                      style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 15, fontWeight: 600, color: colors.textPrimary }}>
                          {itp.itp_number} - {itp.title}
                        </span>
                        <Badge variant={itp.status as any}>{(itp.status || 'draft').toUpperCase()}</Badge>
                      </div>
                      <span style={{ fontSize: 13, color: colors.textSecondary }}>
                        {itp.discipline} &middot; Rev {itp.revision}
                      </span>
                    </div>
                    <div onClick={e => e.stopPropagation()} style={{ flexShrink: 0 }}>
                      <select
                        value={itp.lot_id ?? ''}
                        disabled={updatingItpId === itp.id}
                        onChange={e => updateItpLot(itp.id, e.target.value)}
                        style={{ padding: '7px 10px', borderRadius: 7, border: `1px solid ${colors.border}`, fontSize: 12, fontFamily: 'inherit', minWidth: 160 }}
                      >
                        <option value="">Unassigned</option>
                        {lots.map(l => (
                          <option key={l.id} value={l.id}>{l.lot_number} - {l.name}</option>
                        ))}
                      </select>
                    </div>
                    <span
                      onClick={() => router.push(`/projects/${projectId}/itps/${itp.id}`)}
                      style={{ color: colors.textMuted, flexShrink: 0, display: 'flex', cursor: 'pointer' }}
                    ><Icon.chevronRight /></span>
                  </div>
                </Card>
              ))}
            </div>
          )
        )}
      </div>
    </PageShell>
  )
}
