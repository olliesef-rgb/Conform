New-Item -ItemType Directory -Force -Path 'src\app\projects\[id]\prestarts' | Out-Null
New-Item -ItemType Directory -Force -Path 'src\app\projects\[id]\prestarts\new' | Out-Null
New-Item -ItemType Directory -Force -Path 'src\app\projects\[id]\prestarts\[prestartId]' | Out-Null

# ---------------------------------------------------------------------------
# 1. LIST PAGE
# ---------------------------------------------------------------------------
$listPage = @'
'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { PageShell, PageHeader, Card, Button, Badge, EmptyState, SkeletonCard, Icon, colors } from '@/components/ui'

interface Prestart {
  id: string
  date: string
  crew: string | null
  weather: string | null
  signed_by: string | null
  signed_at: string | null
}

export default function PrestartsPage() {
  const router = useRouter()
  const params = useParams()
  const projectId = params.id as string
  const supabase = createClient()

  const [prestarts, setPrestarts] = useState<Prestart[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('prestarts')
        .select('id, date, crew, weather, signed_by, signed_at')
        .eq('project_id', projectId)
        .order('date', { ascending: false })
      setPrestarts(data ?? [])
      setLoading(false)
    }
    load()
  }, [projectId])

  return (
    <PageShell projectId={projectId} activeSection="prestarts">
      <PageHeader
        title="Pre-Starts"
        subtitle="Daily pre-start briefings and permits for this project"
        actions={<Button onClick={() => router.push(`/projects/${projectId}/prestarts/new`)}>+ New Pre-Start</Button>}
      />

      <div style={{ padding: 32 }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
          </div>
        ) : prestarts.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Icon.safety />}
              title="No pre-starts yet"
              description="Record your first daily pre-start briefing for this project."
              action={<Button onClick={() => router.push(`/projects/${projectId}/prestarts/new`)}>+ New Pre-Start</Button>}
            />
          </Card>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {prestarts.map(p => (
              <Card
                key={p.id}
                hover
                onClick={() => router.push(`/projects/${projectId}/prestarts/${p.id}`)}
                padding={0}
                style={{ cursor: 'pointer' }}
              >
                <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                    background: colors.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: colors.accentInk,
                  }}><Icon.safety /></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 15, fontWeight: 600, color: colors.textPrimary }}>
                        {new Date(p.date).toLocaleDateString('en-NZ', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' })}
                      </span>
                      {p.signed_at ? (
                        <Badge variant="closed">SIGNED</Badge>
                      ) : (
                        <Badge variant="open">NOT SIGNED</Badge>
                      )}
                    </div>
                    <span style={{ fontSize: 13, color: colors.textSecondary }}>
                      {p.weather ? p.weather + ' \u00B7 ' : ''}{p.crew ? p.crew.split('\n').filter(Boolean).length + ' crew listed' : 'No crew listed'}
                    </span>
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
'@

Set-Content -LiteralPath 'src\app\projects\[id]\prestarts\page.tsx' -Value $listPage -Encoding UTF8
Write-Host "Written: prestarts\page.tsx (list)" -ForegroundColor Green

Write-Host "`nPress Enter to continue to part 2..." -ForegroundColor Cyan
Read-Host
