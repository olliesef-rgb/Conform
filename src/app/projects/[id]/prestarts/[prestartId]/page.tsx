'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { PageShell, PageHeader, Card, Badge, Button, LoadingPage, colors } from '@/components/ui'

interface Prestart {
  id: string
  date: string
  site_area: string | null
  crew: string | null
  weather: string | null
  planned_works: string | null
  nominated_supervisor: string | null
  nominated_first_aiders: string | null
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
interface SignOn { id: string; name: string; company: string | null; signed_at: string }
interface LabourMember { id: string; person_name: string; company: string | null; is_subcontractor: boolean | null; role: string | null }
interface PlantItem { id: string; description: string; company: string | null; is_subcontractor: boolean | null }

const sectionStyle: React.CSSProperties = { padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }
const valueStyle: React.CSSProperties = { fontSize: 14, color: colors.textPrimary, whiteSpace: 'pre-wrap' as const }
const inputStyle: React.CSSProperties = {
  padding: '9px 12px', borderRadius: 8, border: '1px solid ' + colors.border, fontSize: 13, fontFamily: 'inherit',
}

function typeLabel(isSub: boolean | null): string {
  return isSub === null ? '' : isSub ? 'Subcontractor' : 'Internal'
}

export default function PrestartDetailPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string
  const prestartId = params.prestartId as string
  const supabase = createClient()

  const [prestart, setPrestart] = useState<Prestart | null>(null)
  const [permits, setPermits] = useState<Permit[]>([])
  const [deliveries, setDeliveries] = useState<Delivery[]>([])
  const [swmsList, setSwmsList] = useState<SwmsRef[]>([])
  const [signons, setSignons] = useState<SignOn[]>([])
  const [labourMembers, setLabourMembers] = useState<LabourMember[]>([])
  const [plantItems, setPlantItems] = useState<PlantItem[]>([])
  const [loading, setLoading] = useState(true)

  const [newName, setNewName] = useState('')
  const [newCompany, setNewCompany] = useState('')
  const [confirmAttendance, setConfirmAttendance] = useState(false)
  const [signing, setSigning] = useState(false)

  async function loadSignons() {
    const { data } = await supabase.from('prestart_signons').select('*').eq('prestart_id', prestartId).order('signed_at', { ascending: true })
    setSignons(data ?? [])
  }

  useEffect(() => {
    async function load() {
      const { data: p } = await supabase.from('prestarts').select('*').eq('id', prestartId).single()
      setPrestart(p)

      const { data: permitData } = await supabase.from('prestart_permits').select('*').eq('prestart_id', prestartId)
      setPermits(permitData ?? [])

      const { data: deliveryData } = await supabase.from('prestart_deliveries').select('*').eq('prestart_id', prestartId)
      setDeliveries(deliveryData ?? [])

      const { data: labourData } = await supabase.from('prestart_labour').select('*').eq('prestart_id', prestartId).order('sort_order')
      setLabourMembers(labourData ?? [])

      const { data: plantData } = await supabase.from('prestart_plant').select('*').eq('prestart_id', prestartId).order('sort_order')
      setPlantItems(plantData ?? [])

      const { data: swmsLinks } = await supabase
        .from('prestart_swms')
        .select('swms:swms_id(id, swms_number, title)')
        .eq('prestart_id', prestartId)
      setSwmsList(((swmsLinks ?? []) as any[]).map(row => row.swms).filter(Boolean))

      await loadSignons()
      setLoading(false)
    }
    load()
  }, [prestartId])

  async function handleSignOn() {
    if (!newName.trim() || !confirmAttendance) return
    setSigning(true)
    await supabase.from('prestart_signons').insert({
      prestart_id: prestartId,
      name: newName.trim(),
      company: newCompany.trim() || null,
    })
    setNewName('')
    setNewCompany('')
    setConfirmAttendance(false)
    await loadSignons()
    setSigning(false)
  }

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
        actions={
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Button variant="secondary" onClick={() => router.push('/projects/' + projectId + '/prestarts/' + prestartId + '/edit')}>Edit</Button>
            <Button variant="secondary" href={'/api/export/prestarts/' + prestartId + '/full'} download>Print Full Pre-Start</Button>
            <Button variant="secondary" href={'/api/export/prestarts/' + prestartId + '/signon'} download>Print Sign-On Sheet</Button>
            {prestart.signed_at ? <Badge variant="closed">SIGNED</Badge> : <Badge variant={"open" as any}>NOT SIGNED</Badge>}
          </div>
        }
      />

      <div style={{ padding: 32, display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 900 }}>
        <Card>
          <div style={sectionStyle}>
            {prestart.site_area && (
              <div>
                <div style={labelStyle}>Site / Area</div>
                <div style={valueStyle}>{prestart.site_area}</div>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <div style={labelStyle}>Weather</div>
                <div style={valueStyle}>{prestart.weather || '-'}</div>
              </div>
              <div>
                <div style={labelStyle}>Linked SWMS</div>
                <div style={valueStyle}>
                  {swmsList.length === 0 ? '-' : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {swmsList.map(s => (
                        <span key={s.id} style={{ color: colors.accentInk, cursor: 'pointer' }} onClick={() => router.push('/projects/' + projectId + '/swms/' + s.id)}>
                          {s.swms_number} - {s.title}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <div style={sectionStyle}>
            <div style={labelStyle}>Crew / Attendees (as planned)</div>
            {labourMembers.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {labourMembers.map(l => (
                  <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, padding: '6px 0', borderBottom: '1px solid ' + colors.border }}>
                    <span style={{ fontWeight: 600, color: colors.textPrimary }}>
                      {l.person_name}{l.role ? ' - ' + l.role : ''}{l.company ? ' (' + l.company + ')' : ''}
                    </span>
                    {typeLabel(l.is_subcontractor) && <span style={{ color: colors.textMuted }}>{typeLabel(l.is_subcontractor)}</span>}
                  </div>
                ))}
              </div>
            ) : (
              <div style={valueStyle}>{prestart.crew || '-'}</div>
            )}
          </div>
        </Card>

        {plantItems.length > 0 && (
          <Card>
            <div style={sectionStyle}>
              <div style={labelStyle}>Plant On Site</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {plantItems.map(p => (
                  <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, padding: '6px 0', borderBottom: '1px solid ' + colors.border }}>
                    <span style={{ fontWeight: 600, color: colors.textPrimary }}>
                      {p.description}{p.company ? ' (' + p.company + ')' : ''}
                    </span>
                    {typeLabel(p.is_subcontractor) && <span style={{ color: colors.textMuted }}>{typeLabel(p.is_subcontractor)}</span>}
                  </div>
                ))}
              </div>
            </div>
          </Card>
        )}

        {(prestart.planned_works || prestart.nominated_supervisor || prestart.nominated_first_aiders) && (
          <Card>
            <div style={sectionStyle}>
              <div style={labelStyle}>Planned Works Today</div>
              <div style={valueStyle}>{prestart.planned_works || '-'}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 8 }}>
                <div>
                  <div style={labelStyle}>Nominated Supervisor</div>
                  <div style={valueStyle}>{prestart.nominated_supervisor || '-'}</div>
                </div>
                <div>
                  <div style={labelStyle}>Nominated First Aiders</div>
                  <div style={valueStyle}>{prestart.nominated_first_aiders || '-'}</div>
                </div>
              </div>
            </div>
          </Card>
        )}

        <Card>
          <div style={sectionStyle}>
            <div style={labelStyle}>Digital Sign-On</div>
            {signons.length === 0 ? (
              <div style={{ fontSize: 13, color: colors.textMuted }}>No one has signed on yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {signons.map(s => (
                  <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '6px 0', borderBottom: '1px solid ' + colors.border }}>
                    <span style={{ fontWeight: 600, color: colors.textPrimary }}>{s.name}{s.company ? ' - ' + s.company : ''}</span>
                    <span style={{ color: colors.textMuted }}>{new Date(s.signed_at).toLocaleString('en-NZ')}</span>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 10, alignItems: 'center', marginTop: 8 }}>
              <input type="text" placeholder="Your name" value={newName} onChange={e => setNewName(e.target.value)} style={inputStyle} />
              <input type="text" placeholder="Company (optional)" value={newCompany} onChange={e => setNewCompany(e.target.value)} style={inputStyle} />
              <Button size="sm" onClick={handleSignOn} disabled={signing || !newName.trim() || !confirmAttendance}>{signing ? 'Signing...' : 'Sign On'}</Button>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: colors.textSecondary }}>
              <input type="checkbox" checked={confirmAttendance} onChange={e => setConfirmAttendance(e.target.checked)} />
              I confirm my attendance at this pre-start briefing
            </label>
            <div style={{ fontSize: 12, color: colors.textMuted }}>
              Crew without access to this page can sign the printed sheet instead - use "Print Sign-On Sheet" above.
            </div>
          </div>
        </Card>

        {prestart.critical_risks_snapshot && (
          <Card>
            <div style={sectionStyle}>
              <div style={labelStyle}>Critical Risks (from linked SWMS at time of briefing, grouped by SWMS)</div>
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
                    <Badge variant={(p.status === 'approved' ? 'closed' : 'open') as any}>{p.status.toUpperCase()}</Badge>
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
                    <Badge variant={(d.status === 'arrived' ? 'closed' : 'open') as any}>{d.status.toUpperCase()}</Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        {prestart.notes && (
          <Card>
            <div style={sectionStyle}>
              <div style={labelStyle}>Additional Notes</div>
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

