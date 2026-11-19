$detailPage = @'
'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { PageShell, PageHeader, Card, Badge, Button, LoadingPage, colors } from '@/components/ui'

interface Prestart {
  id: string
  date: string
  crew: string | null
  weather: string | null
  swms_id: string | null
  critical_risks_snapshot: string | null
  site_layout_url: string | null
  site_layout_notes: string | null
  emergency_procedures: string | null
  nearest_medical_facility: string | null
  site_constraints: string | null
  simultaneous_operations: string | null
  notes: string | null
  signed_by: string | null
  signed_at: string | null
}

interface Permit { id: string; permit_type: string; status: string; reference: string | null; notes: string | null }
interface Delivery { id: string; supplier: string | null; description: string; expected_time: string | null; quantity: string | null; status: string }
interface SwmsRef { id: string; swms_number: string; title: string }

const sectionStyle: React.CSSProperties = { padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }
const valueStyle: React.CSSProperties = { fontSize: 14, color: colors.textPrimary, whiteSpace: 'pre-wrap' as const }

export default function PrestartDetailPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string
  const prestartId = params.prestartId as string
  const supabase = createClient()

  const [prestart, setPrestart] = useState<Prestart | null>(null)
  const [permits, setPermits] = useState<Permit[]>([])
  const [deliveries, setDeliveries] = useState<Delivery[]>([])
  const [swms, setSwms] = useState<SwmsRef | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: p } = await supabase.from('prestarts').select('*').eq('id', prestartId).single()
      setPrestart(p)

      const { data: permitData } = await supabase.from('prestart_permits').select('*').eq('prestart_id', prestartId)
      setPermits(permitData ?? [])

      const { data: deliveryData } = await supabase.from('prestart_deliveries').select('*').eq('prestart_id', prestartId)
      setDeliveries(deliveryData ?? [])

      if (p?.swms_id) {
        const { data: s } = await supabase.from('swms').select('id, swms_number, title').eq('id', p.swms_id).single()
        setSwms(s)
      }

      setLoading(false)
    }
    load()
  }, [prestartId])

  if (loading) return <LoadingPage />
  if (!prestart) return <PageShell><div style={{ padding: 32 }}><Card><div style={{ padding: 20 }}>Pre-start not found.</div></Card></div></PageShell>

  const activePermits = permits.filter(p => p.status !== 'not_required')

  return (
    <PageShell projectId={projectId} activeSection="prestarts">
      <PageHeader
        title={new Date(prestart.date).toLocaleDateString('en-NZ', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' })}
        subtitle="Daily Pre-Start Record"
        breadcrumbs={[
          { label: 'Pre-Starts', href: '/projects/' + projectId + '/prestarts' },
          { label: new Date(prestart.date).toLocaleDateString('en-NZ') },
        ]}
        actions={prestart.signed_at ? <Badge variant="closed">SIGNED</Badge> : <Badge variant="open">NOT SIGNED</Badge>}
      />

      <div style={{ padding: 32, display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 900 }}>
        <Card>
          <div style={sectionStyle}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <div style={labelStyle}>Weather</div>
                <div style={valueStyle}>{prestart.weather || '-'}</div>
              </div>
              <div>
                <div style={labelStyle}>Linked SWMS</div>
                <div style={valueStyle}>
                  {swms ? (
                    <span style={{ color: colors.accentInk, cursor: 'pointer' }} onClick={() => router.push('/projects/' + projectId + '/swms/' + swms.id)}>
                      {swms.swms_number} - {swms.title}
                    </span>
                  ) : '-'}
                </div>
              </div>
            </div>
            <div>
              <div style={labelStyle}>Crew / Attendees</div>
              <div style={valueStyle}>{prestart.crew || '-'}</div>
            </div>
          </div>
        </Card>

        {prestart.critical_risks_snapshot && (
          <Card>
            <div style={sectionStyle}>
              <div style={labelStyle}>Critical Risks (from linked SWMS at time of briefing)</div>
              <div style={{ ...valueStyle, fontFamily: 'monospace', fontSize: 12, background: colors.bg, padding: 12, borderRadius: 8 }}>{prestart.critical_risks_snapshot}</div>
            </div>
          </Card>
        )}

        {(prestart.site_layout_url || prestart.site_layout_notes) && (
          <Card>
            <div style={sectionStyle}>
              <div style={labelStyle}>Site Layout</div>
              {prestart.site_layout_url && (
                <a href={prestart.site_layout_url} target="_blank" rel="noreferrer" style={{ color: colors.accentInk, fontSize: 13 }}>View site layout plan</a>
              )}
              {prestart.site_layout_notes && <div style={valueStyle}>{prestart.site_layout_notes}</div>}
            </div>
          </Card>
        )}

        {(prestart.emergency_procedures || prestart.nearest_medical_facility) && (
          <Card>
            <div style={sectionStyle}>
              <div style={labelStyle}>Emergency Procedures</div>
              <div style={valueStyle}>{prestart.emergency_procedures || '-'}</div>
              <div style={labelStyle}>Nearest Medical Facility</div>
              <div style={valueStyle}>{prestart.nearest_medical_facility || '-'}</div>
            </div>
          </Card>
        )}

        {(prestart.site_constraints || prestart.simultaneous_operations) && (
          <Card>
            <div style={sectionStyle}>
              <div style={labelStyle}>Site Constraints</div>
              <div style={valueStyle}>{prestart.site_constraints || '-'}</div>
              <div style={labelStyle}>Simultaneous Operations</div>
              <div style={valueStyle}>{prestart.simultaneous_operations || '-'}</div>
            </div>
          </Card>
        )}

        <Card>
          <div style={sectionStyle}>
            <div style={labelStyle}>Permits</div>
            {activePermits.length === 0 ? (
              <div style={{ fontSize: 13, color: colors.textMuted }}>No permits required for this day.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {activePermits.map(p => (
                  <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, padding: '6px 0', borderBottom: '1px solid ' + colors.border }}>
                    <span style={{ fontWeight: 600, color: colors.textPrimary }}>{p.permit_type}</span>
                    <span style={{ color: colors.textSecondary }}>{p.reference || ''}</span>
                    <Badge variant={p.status === 'approved' ? 'closed' : 'open'}>{p.status.toUpperCase()}</Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        <Card>
          <div style={sectionStyle}>
            <div style={labelStyle}>Expected Site Deliveries</div>
            {deliveries.length === 0 ? (
              <div style={{ fontSize: 13, color: colors.textMuted }}>No deliveries expected.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {deliveries.map(d => (
                  <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, padding: '6px 0', borderBottom: '1px solid ' + colors.border }}>
                    <div>
                      <span style={{ fontWeight: 600, color: colors.textPrimary }}>{d.description}</span>
                      {d.supplier && <span style={{ color: colors.textSecondary }}> - {d.supplier}</span>}
                    </div>
                    <span style={{ color: colors.textSecondary }}>{d.expected_time || ''} {d.quantity || ''}</span>
                    <Badge variant={d.status === 'arrived' ? 'closed' : 'open'}>{d.status.toUpperCase()}</Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        {prestart.notes && (
          <Card>
            <div style={sectionStyle}>
              <div style={labelStyle}>Notes</div>
              <div style={valueStyle}>{prestart.notes}</div>
            </div>
          </Card>
        )}

        <Card>
          <div style={sectionStyle}>
            <div style={labelStyle}>Sign-Off</div>
            <div style={valueStyle}>
              {prestart.signed_at
                ? 'Signed by ' + prestart.signed_by + ' on ' + new Date(prestart.signed_at).toLocaleString('en-NZ')
                : 'Not yet signed off.'}
            </div>
          </div>
        </Card>
      </div>
    </PageShell>
  )
}
'@

Set-Content -LiteralPath 'src\app\projects\[id]\prestarts\[prestartId]\page.tsx' -Value $detailPage -Encoding UTF8
Write-Host "Written: prestarts\[prestartId]\page.tsx (detail view)" -ForegroundColor Green

Write-Host "`nPress Enter to close this window..." -ForegroundColor Cyan
Read-Host
