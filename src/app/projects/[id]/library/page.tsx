'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  PageShell, PageHeader, Card, Button, Input, Badge, Icon,
  LoadingPage, Alert, SkeletonCard, colors
} from '@/components/ui'

interface LibItp {
  id: string
  itp_number: string
  title: string
  discipline: string
  project_id: string
  projects: { name: string } | null
}

interface LibSwms {
  id: string
  swms_number: string
  title: string
  discipline: string
  project_id: string
  projects: { name: string } | null
}

export default function LibraryPage() {
  const router = useRouter()
  const params = useParams()
  const projectId = params.id as string
  const supabase = createClient()

  const [tab, setTab] = useState<'itps' | 'swms'>('itps')
  const [search, setSearch] = useState('')
  const [itps, setItps] = useState<LibItp[]>([])
  const [swms, setSwms] = useState<LibSwms[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [resultMsg, setResultMsg] = useState('')

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile } = await supabase.from('profiles').select('organisation_id').eq('id', user?.id).single()
      const orgId = profile?.organisation_id

      const { data: itpData } = await supabase
        .from('itps')
        .select('id, itp_number, title, discipline, project_id, projects(name)')
        .eq('organisation_id', orgId)
        .neq('project_id', projectId)
        .order('itp_number')
      setItps((itpData as any) ?? [])

      const { data: swmsData } = await supabase
        .from('swms')
        .select('id, swms_number, title, discipline, project_id, projects(name)')
        .eq('organisation_id', orgId)
        .neq('project_id', projectId)
        .order('swms_number')
      setSwms((swmsData as any) ?? [])

      setLoading(false)
    }
    load()
  }, [projectId])

  function toggle(id: string) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id); else next.add(id)
    setSelected(next)
  }

  async function importSelected() {
    setImporting(true)
    setResultMsg('')
    const { data: { user } } = await supabase.auth.getUser()
    let count = 0

    if (tab === 'itps') {
      for (const id of selected) {
        const { data: original } = await supabase.from('itps').select('*').eq('id', id).single()
        if (!original) continue
        const { embedding, generation_prompt, ...rest } = original as any
        delete rest.id
        const { data: newItp } = await supabase.from('itps').insert({
          ...rest,
          project_id: projectId,
          lot_id: null,
          status: 'draft',
          created_by: user?.id,
        }).select('id').single()
        if (!newItp) continue

        const { data: activities } = await supabase.from('itp_activities').select('*').eq('itp_id', id)
        if (activities && activities.length > 0) {
          const copies = activities.map((a: any) => {
            const { id: _oldId, itp_id, is_complete, completed_by, completed_at, ...fields } = a
            return { ...fields, itp_id: newItp.id, is_complete: false }
          })
          await supabase.from('itp_activities').insert(copies)
        }

        const { data: checklist } = await supabase.from('itp_qa_checklist').select('*').eq('itp_id', id)
        if (checklist && checklist.length > 0) {
          const copies = checklist.map((c: any) => {
            const { id: _oldId, itp_id, checked, ...fields } = c
            return { ...fields, itp_id: newItp.id, checked: false }
          })
          await supabase.from('itp_qa_checklist').insert(copies)
        }
        count++
      }
    } else {
      for (const id of selected) {
        const { data: original } = await supabase.from('swms').select('*').eq('id', id).single()
        if (!original) continue
        const { embedding, ...rest } = original as any
        delete rest.id
        const { data: newSwms } = await supabase.from('swms').insert({
          ...rest,
          project_id: projectId,
          status: 'draft',
          created_by: user?.id,
        }).select('id').single()
        if (!newSwms) continue

        const { data: activities } = await supabase.from('swms_activities').select('*').eq('swms_id', id)
        if (activities && activities.length > 0) {
          const copies = activities.map((a: any) => {
            const { id: _oldId, swms_id, ...fields } = a
            return { ...fields, swms_id: newSwms.id }
          })
          await supabase.from('swms_activities').insert(copies)
        }
        count++
      }
    }

    setImporting(false)
    setSelected(new Set())
    setResultMsg(`Imported ${count} item${count === 1 ? '' : 's'} into this project as drafts. Review and edit before use.`)
  }

  if (loading) {
    return (
      <PageShell projectId={projectId} activeSection="library">
        <PageHeader title="Library" subtitle="Reuse an ITP or SWMS from another project - imported as an editable draft" />
        <div style={{ padding: 32, display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 820 }}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </PageShell>
    )
  }

  const list = tab === 'itps' ? itps : swms
  const filtered = list.filter((item: any) => {
    const num = tab === 'itps' ? item.itp_number : item.swms_number
    const q = search.toLowerCase()
    return num?.toLowerCase().includes(q) || item.title?.toLowerCase().includes(q) || item.projects?.name?.toLowerCase().includes(q)
  })

  return (
    <PageShell projectId={projectId} activeSection="library">
      <PageHeader
        title="Library"
        subtitle="Reuse an ITP or SWMS from another project - imported as an editable draft"
      />

      <div style={{ padding: '32px', maxWidth: 820 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <Button variant={tab === 'itps' ? 'primary' : 'secondary'} size="sm" onClick={() => { setTab('itps'); setSelected(new Set()) }}>
            ITPs ({itps.length})
          </Button>
          <Button variant={tab === 'swms' ? 'primary' : 'secondary'} size="sm" onClick={() => { setTab('swms'); setSelected(new Set()) }}>
            SWMS ({swms.length})
          </Button>
        </div>

        <div style={{ marginBottom: 16 }}>
          <Input value={search} onChange={setSearch} placeholder="Search by number, title, or project..." />
        </div>

        {resultMsg && <div style={{ marginBottom: 16 }}><Alert variant="success">{resultMsg}</Alert></div>}

        {filtered.length === 0 ? (
          <Card>
            <div style={{ textAlign: 'center', padding: '32px', fontSize: 13, color: colors.textMuted }}>
              No {tab === 'itps' ? 'ITPs' : 'SWMS'} found in other projects.
            </div>
          </Card>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map((item: any) => {
              const number = tab === 'itps' ? item.itp_number : item.swms_number
              const isSelected = selected.has(item.id)
              return (
                <Card key={item.id} padding={0} onClick={() => toggle(item.id)} style={{ cursor: 'pointer', borderColor: isSelected ? colors.accentInk : colors.border }}>
                  <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <input type="checkbox" checked={isSelected} onChange={() => toggle(item.id)} style={{ width: 16, height: 16, flexShrink: 0, accentColor: colors.accentInk }} />
                    <div style={{
                      width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                      background: colors.primaryLight, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: colors.primary,
                    }}>{tab === 'itps' ? <Icon.itp /> : <Icon.swms />}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary }}>{number} - {item.title}</div>
                      <div style={{ fontSize: 12, color: colors.textMuted }}>From: {item.projects?.name ?? 'Unknown project'}</div>
                    </div>
                    {item.discipline && <Badge variant="grey">{item.discipline}</Badge>}
                  </div>
                </Card>
              )
            })}
          </div>
        )}

        {selected.size > 0 && (
          <div style={{ position: 'sticky', bottom: 24, marginTop: 20, display: 'flex', justifyContent: 'center' }}>
            <Card style={{ display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 4px 16px rgba(0,0,0,0.1)' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary }}>{selected.size} selected</span>
              <Button onClick={importSelected} disabled={importing}>
                {importing ? 'Importing...' : `Import ${selected.size} into this project`}
              </Button>
            </Card>
          </div>
        )}
      </div>
    </PageShell>
  )
}

