'use client'
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { PageShell, PageHeader, Card, Button, Input, Textarea, Select, Alert } from '@/components/ui'

const NOTICE_TYPES = [
  { value: 'RFI', label: 'RFI - Request for Information' },
  { value: 'EWN', label: 'EWN - Early Warning Notice' },
  { value: 'NCR', label: 'NCR - Non-Conformance Report' },
  { value: 'DCR', label: 'DCR - Design Change Request' },
  { value: 'DCN', label: 'DCN - Design Change Notice' },
  { value: 'UPC', label: 'UPC - Unforeseen Physical Condition' },
  { value: 'CE', label: 'CE - Compensation Event' },
  { value: 'Custom', label: 'Custom' },
]

export default function RaiseNoticePage() {
  const router = useRouter()
  const params = useParams()
  const projectId = params.id as string
  const supabase = createClient()

  const [type, setType] = useState('RFI')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [itpId, setItpId] = useState('')
  const [swmsId, setSwmsId] = useState('')
  const [lotId, setLotId] = useState('')
  const [itps, setItps] = useState<{ id: string; label: string }[]>([])
  const [swmsList, setSwmsList] = useState<{ id: string; label: string }[]>([])
  const [lots, setLots] = useState<{ id: string; label: string }[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      const { data: itpData } = await supabase.from('itps').select('id, itp_number, title').eq('project_id', projectId)
      setItps((itpData ?? []).map((i: any) => ({ id: i.id, label: `${i.itp_number} - ${i.title}` })))

      const { data: swmsData } = await supabase.from('swms').select('id, swms_number, title').eq('project_id', projectId)
      setSwmsList((swmsData ?? []).map((s: any) => ({ id: s.id, label: `${s.swms_number} - ${s.title}` })))

      const { data: lotData } = await supabase.from('lots').select('*').eq('project_id', projectId)
      setLots((lotData ?? []).map((l: any) => ({ id: l.id, label: l.name || l.lot_number || l.title || l.id })))
    }
    load()
  }, [projectId])

  async function saveNotice() {
    if (!title.trim()) { setError('Please enter a title.'); return }
    setSaving(true)
    setError('')

    const { data: userData } = await supabase.auth.getUser()
    const user = userData?.user

    const { count } = await supabase
      .from('notices').select('id', { count: 'exact', head: true }).eq('project_id', projectId).eq('type', type)
    const noticeNumber = `${type}-${String((count ?? 0) + 1).padStart(3, '0')}`

    const { data: notice, error: insError } = await supabase.from('notices').insert({
      project_id: projectId,
      type,
      notice_number: noticeNumber,
      title,
      description,
      status: 'open',
      raised_by: user?.id ?? null,
      raised_by_email: user?.email ?? null,
      itp_id: itpId || null,
      swms_id: swmsId || null,
      lot_id: lotId || null,
    }).select('id').single()

    if (insError) { setError(insError.message); setSaving(false); return }
    router.push(`/projects/${projectId}/notices/${notice.id}`)
  }

  return (
    <PageShell projectId={projectId} activeSection="notices">
      <PageHeader
        title="Raise Notice"
        subtitle="RFI, NCR, EWN, DCR, DCN, UPC, CE, or a custom notice type"
        breadcrumbs={[{ label: 'Notices', href: `/projects/${projectId}/notices` }, { label: 'Raise' }]}
        actions={<Button onClick={saveNotice} disabled={saving}>{saving ? 'Saving...' : 'Raise Notice'}</Button>}
      />

      <div style={{ padding: '24px 32px', maxWidth: 760, margin: '0 auto' }}>
        {error && <div style={{ marginBottom: 16 }}><Alert variant="error">{error}</Alert></div>}

        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Select label="Notice Type" value={type} onChange={setType} options={NOTICE_TYPES} />
            <Input label="Title" required value={title} onChange={setTitle} placeholder="Short summary of the issue" />
            <Textarea label="Description" rows={4} value={description} onChange={setDescription} placeholder="What happened, what's needed, or what's changing" />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Select
                label="Link to ITP (optional)"
                value={itpId}
                onChange={setItpId}
                options={[{ value: '', label: 'None' }, ...itps.map(i => ({ value: i.id, label: i.label }))]}
              />
              <Select
                label="Link to SWMS (optional)"
                value={swmsId}
                onChange={setSwmsId}
                options={[{ value: '', label: 'None' }, ...swmsList.map(s => ({ value: s.id, label: s.label }))]}
              />
            </div>
            <Select
              label="Link to Lot (optional)"
              value={lotId}
              onChange={setLotId}
              options={[{ value: '', label: 'None' }, ...lots.map(l => ({ value: l.id, label: l.label }))]}
            />
          </div>
        </Card>
      </div>
    </PageShell>
  )
}
