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

export default function LotsPage() {
  const router = useRouter()
  const params = useParams()
  const projectId = params.id as string
  const supabase = createClient()
  const [lots, setLots] = useState<Lot[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('lots')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
      setLots(data ?? [])
      setLoading(false)
    }
    load()
  }, [projectId])

  return (
    <PageShell projectId={projectId} activeSection="lots">
      <PageHeader
        title="Lots"
        subtitle="Work packages for this project, grouping ITPs and tracking completion"
        actions={
          <Button size="sm" onClick={() => router.push(`/projects/${projectId}/lots/new`)}>+ New Lot</Button>
        }
      />

      <div style={{ padding: '32px' }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
          </div>
        ) : lots.length === 0 ? (
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
            {lots.map(lot => (
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
                        {lot.lot_number} — {lot.name}
                      </span>
                      <Badge variant={lot.status === 'closed' ? 'closed' : 'active'}>
                        {lot.status.charAt(0).toUpperCase() + lot.status.slice(1)}
                      </Badge>
                    </div>
                    {lot.description && (
                      <span style={{ fontSize: 13, color: colors.textSecondary }}>{lot.description}</span>
                    )}
                  </div>
                  <span style={{ color: colors.textMuted, flexShrink: 0, display: 'flex' }}><Icon.chevronRight /></span>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </PageShell>
  )
}
