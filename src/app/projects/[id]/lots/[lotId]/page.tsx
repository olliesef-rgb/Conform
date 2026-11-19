'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  PageShell, PageHeader, Card, Button, Badge, Select, Icon,
  ProgressBar, LoadingPage, colors
} from '@/components/ui'

interface Lot {
  id: string
  lot_number: string
  name: string
  description?: string
  status: string
}

interface ItpSummary {
  id: string
  itp_number: string
  title: string
  status: string
}

export default function LotDetailPage() {
  const router = useRouter()
  const params = useParams()
  const projectId = params.id as string
  const lotId = params.lotId as string
  const supabase = createClient()

  const [lot, setLot] = useState<Lot | null>(null)
  const [assignedItps, setAssignedItps] = useState<ItpSummary[]>([])
  const [unassignedItps, setUnassignedItps] = useState<ItpSummary[]>([])
  const [selectedItpId, setSelectedItpId] = useState('')
  const [completedCount, setCompletedCount] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [assigning, setAssigning] = useState(false)

  async function loadAll() {
    const { data: lotData } = await supabase.from('lots').select('*').eq('id', lotId).single()
    setLot(lotData)

    const { data: assigned } = await supabase
      .from('itps')
      .select('id, itp_number, title, status')
      .eq('lot_id', lotId)
      .order('itp_number')
    setAssignedItps(assigned ?? [])

    const { data: unassigned } = await supabase
      .from('itps')
      .select('id, itp_number, title, status')
      .eq('project_id', projectId)
      .is('lot_id', null)
      .order('itp_number')
    setUnassignedItps(unassigned ?? [])

    if (assigned && assigned.length > 0) {
      const itpIds = assigned.map(i => i.id)
      const { data: activities } = await supabase
        .from('itp_activities')
        .select('is_complete')
        .in('itp_id', itpIds)
      const total = activities?.length ?? 0
      const complete = activities?.filter(a => a.is_complete).length ?? 0
      setTotalCount(total)
      setCompletedCount(complete)
    } else {
      setTotalCount(0)
      setCompletedCount(0)
    }

    setLoading(false)
  }

  useEffect(() => { loadAll() }, [lotId])

  async function assignItp() {
    if (!selectedItpId) return
    setAssigning(true)
    await supabase.from('itps').update({ lot_id: lotId }).eq('id', selectedItpId)
    setSelectedItpId('')
    setAssigning(false)
    loadAll()
  }

  async function unassignItp(itpId: string) {
    await supabase.from('itps').update({ lot_id: null }).eq('id', itpId)
    loadAll()
  }

  if (loading) return <LoadingPage message="Loading lot..." />
  if (!lot) return <LoadingPage message="Lot not found" />

  const percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

  return (
    <PageShell projectId={projectId} activeSection="quality">
      <PageHeader
        title={`${lot.lot_number} — ${lot.name}`}
        subtitle={lot.description}
        breadcrumbs={[
          { label: 'Lots', href: `/projects/${projectId}/quality` },
          { label: lot.lot_number },
        ]}
        actions={
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <a
              href={`/api/export/lots/${lotId}`}
              download
              style={{
                background: colors.accentInk, color: '#fff', border: 'none', borderRadius: 999,
                padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                textDecoration: 'none', display: 'inline-flex', alignItems: 'center'
              }}
            >
              Download Lot Package
            </a>
            <Badge variant={lot.status === 'closed' ? 'closed' : 'active'}>{lot.status}</Badge>
          </div>
        }
      />

      <div style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 820 }}>

        <Card>
          <div style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary, marginBottom: 10 }}>
            Activity Completion
          </div>
          <ProgressBar percent={percent} showLabel />
          <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 8 }}>
            {completedCount} of {totalCount} activities signed off across {assignedItps.length} ITP{assignedItps.length === 1 ? '' : 's'}
          </div>
        </Card>

        <Card>
          <div style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary, marginBottom: 14 }}>
            Assign an ITP to this lot
          </div>
          {unassignedItps.length === 0 ? (
            <div style={{ fontSize: 13, color: colors.textMuted }}>No unassigned ITPs available in this project.</div>
          ) : (
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <Select
                  label="ITP"
                  value={selectedItpId}
                  onChange={setSelectedItpId}
                  options={[
                    { value: '', label: 'Select an ITP...' },
                    ...unassignedItps.map(i => ({ value: i.id, label: `${i.itp_number} — ${i.title}` })),
                  ]}
                />
              </div>
              <Button onClick={assignItp} disabled={!selectedItpId || assigning}>
                {assigning ? 'Assigning...' : 'Assign'}
              </Button>
            </div>
          )}
        </Card>

        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary, marginBottom: 12 }}>
            ITPs in this lot ({assignedItps.length})
          </div>
          {assignedItps.length === 0 ? (
            <Card>
              <div style={{ textAlign: 'center', padding: '24px', fontSize: 13, color: colors.textMuted }}>
                No ITPs assigned yet. Use the form above to add one.
              </div>
            </Card>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {assignedItps.map(itp => (
                <Card key={itp.id} padding={0}>
                  <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 9, flexShrink: 0,
                      background: colors.primaryLight, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: colors.primary,
                    }}><Icon.itp /></div>
                    <div
                      style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
                      onClick={() => router.push(`/projects/${projectId}/itps/${itp.id}`)}
                    >
                      <div style={{ fontSize: 14, fontWeight: 600, color: colors.textPrimary }}>
                        {itp.itp_number} — {itp.title}
                      </div>
                      <Badge variant={itp.status as any}>{itp.status}</Badge>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => unassignItp(itp.id)}>Remove</Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

      </div>
    </PageShell>
  )
}

