'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { PageShell, PageHeader, Card, LoadingPage, colors } from '@/components/ui'

interface AuditRow {
  id: string
  table_name: string
  record_id: string
  action: string
  changed_by: string | null
  changed_at: string
  old_data: any
  new_data: any
}

const TABLE_LABELS: Record<string, string> = {
  notices: 'Notice',
  prestarts: 'Pre-Start',
  swms: 'SWMS',
  itps: 'ITP',
  lots: 'Lot',
  safety_observations: 'Safety Observation',
}

const ACTION_COLORS: Record<string, { bg: string; text: string }> = {
  INSERT: { bg: '#E3F3DC', text: '#2F6B1F' },
  UPDATE: { bg: '#FFF3C4', text: '#8A6300' },
  DELETE: { bg: '#FBDADA', text: '#B3261E' },
}

// Fields every tracked table carries that aren't meaningful to show as a
// "changed from/to" line.
const SKIP_FIELDS = new Set(['id', 'project_id', 'created_at', 'updated_at'])

function recordLabel(table: string, data: any): string {
  if (!data) return ''
  switch (table) {
    case 'notices':
      return (data.notice_number ? data.notice_number + ' - ' : '') + (data.title ?? '')
    case 'prestarts':
      return data.date ? new Date(data.date).toLocaleDateString('en-NZ') : (data.id ?? '')
    case 'swms':
      return (data.swms_number ? data.swms_number + ' - ' : '') + (data.title ?? '')
    case 'itps':
      return (data.itp_number ? data.itp_number + ' - ' : '') + (data.title ?? '')
    case 'lots':
      return data.name || data.lot_number || data.title || data.id
    case 'safety_observations':
      return data.title || data.description || data.id
    default:
      return data.id ?? ''
  }
}

function formatValue(v: any): string {
  if (v === null || v === undefined || v === '') return '(empty)'
  if (typeof v === 'object') return JSON.stringify(v)
  const s = String(v)
  return s.length > 80 ? s.slice(0, 80) + '...' : s
}

function diffFields(oldData: any, newData: any): { field: string; from: any; to: any }[] {
  if (!oldData || !newData) return []
  const fields = new Set([...Object.keys(oldData), ...Object.keys(newData)])
  const diffs: { field: string; from: any; to: any }[] = []
  for (const f of fields) {
    if (SKIP_FIELDS.has(f)) continue
    const a = oldData[f]
    const b = newData[f]
    if (JSON.stringify(a) !== JSON.stringify(b)) diffs.push({ field: f, from: a, to: b })
  }
  return diffs
}

export default function AuditLogPage() {
  const params = useParams()
  const projectId = params.id as string
  const supabase = createClient()

  const [rows, setRows] = useState<AuditRow[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [tableFilter, setTableFilter] = useState('all')

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('audit_log')
        .select('*')
        .eq('project_id', projectId)
        .order('changed_at', { ascending: false })
        .limit(300)
      const auditRows = (data ?? []) as AuditRow[]
      setRows(auditRows)

      const userIds = Array.from(new Set(auditRows.map(r => r.changed_by).filter(Boolean))) as string[]
      if (userIds.length > 0) {
        const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', userIds)
        const map: Record<string, string> = {}
        for (const p of (profiles ?? []) as any[]) map[p.id] = p.full_name
        setNames(map)
      }
      setLoading(false)
    }
    load()
  }, [projectId])

  const filtered = useMemo(() => {
    if (tableFilter === 'all') return rows
    return rows.filter(r => r.table_name === tableFilter)
  }, [rows, tableFilter])

  const tablesPresent = useMemo(() => Array.from(new Set(rows.map(r => r.table_name))), [rows])

  if (loading) return <LoadingPage />

  return (
    <PageShell projectId={projectId} activeSection="audit-log">
      <PageHeader
        title="Audit Log"
        subtitle="Who changed what, and when - across notices, pre-starts, SWMS, ITPs, lots and safety observations"
      />

      <div style={{ padding: '24px 32px', maxWidth: 1000, margin: '0 auto' }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <select
            value={tableFilter}
            onChange={e => setTableFilter(e.target.value)}
            style={{ padding: '7px 12px', borderRadius: 8, border: `1px solid ${colors.border}`, fontSize: 13 }}
          >
            <option value="all">All Record Types</option>
            {tablesPresent.map(t => (
              <option key={t} value={t}>{TABLE_LABELS[t] ?? t}</option>
            ))}
          </select>
        </div>

        {filtered.length === 0 ? (
          <Card>
            <div style={{ padding: '32px 0', textAlign: 'center', color: colors.textMuted, fontSize: 13 }}>
              {rows.length === 0 ? 'No tracked changes yet on this project.' : 'No entries match this filter.'}
            </div>
          </Card>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map(r => {
              const ac = ACTION_COLORS[r.action] ?? ACTION_COLORS.UPDATE
              const label = recordLabel(r.table_name, r.new_data ?? r.old_data)
              const who = r.changed_by ? (names[r.changed_by] ?? 'Unknown user') : 'System'
              const diffs = r.action === 'UPDATE' ? diffFields(r.old_data, r.new_data) : []
              return (
                <Card key={r.id} padding={0}>
                  <div style={{ padding: '14px 18px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <span style={{ background: ac.bg, color: ac.text, fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, letterSpacing: '0.02em' }}>{r.action}</span>
                      <span style={{ background: colors.accentSoft, color: colors.accentInk, fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 4 }}>
                        {TABLE_LABELS[r.table_name] ?? r.table_name}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary, flex: 1, minWidth: 0 }}>{label}</span>
                      <span style={{ fontSize: 12, color: colors.textMuted }}>{new Date(r.changed_at).toLocaleString('en-NZ')}</span>
                    </div>
                    <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 4 }}>by {who}</div>

                    {diffs.length > 0 && (
                      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4, borderTop: `1px solid ${colors.border}`, paddingTop: 10 }}>
                        {diffs.map(d => (
                          <div key={d.field} style={{ fontSize: 12, color: colors.textSecondary }}>
                            <span style={{ fontWeight: 600 }}>{d.field}</span>: {formatValue(d.from)} <span style={{ color: colors.textMuted }}>&rarr;</span> {formatValue(d.to)}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </PageShell>
  )
}
