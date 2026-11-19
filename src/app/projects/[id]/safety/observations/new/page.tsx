'use client'
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { PageShell, PageHeader, Card, Button, Input, Textarea, Select, Alert } from '@/components/ui'

const CATEGORIES = [
  { value: 'Hazard', label: 'Hazard' },
  { value: 'Near Miss', label: 'Near Miss' },
  { value: 'Unsafe Act', label: 'Unsafe Act' },
  { value: 'Unsafe Condition', label: 'Unsafe Condition' },
  { value: 'Positive Observation', label: 'Positive Observation' },
]

export default function RaiseSafetyObservationPage() {
  const router = useRouter()
  const params = useParams()
  const projectId = params.id as string
  const supabase = createClient()

  const [category, setCategory] = useState('Hazard')
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState('')
  const [lotId, setLotId] = useState('')
  const [lots, setLots] = useState<{ id: string; label: string }[]>([])
  const [swmsId, setSwmsId] = useState('')
  const [swmsList, setSwmsList] = useState<{ id: string; label: string }[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      const { data: lotData } = await supabase.from('lots').select('*').eq('project_id', projectId)
      setLots((lotData ?? []).map((l: any) => ({ id: l.id, label: l.name || l.lot_number || l.title || l.id })))

      const { data: swmsData } = await supabase.from('swms').select('id, swms_number, title').eq('project_id', projectId)
      setSwmsList((swmsData ?? []).map((s: any) => ({ id: s.id, label: `${s.swms_number} - ${s.title}` })))
    }
    load()
  }, [projectId])

  async function saveObservation() {
    if (!description.trim()) { setError('Please describe what was observed.'); return }
    setSaving(true)
    setError('')

    const { data: userData } = await supabase.auth.getUser()
    const user = userData?.user

    const { count } = await supabase
      .from('safety_observations').select('id', { count: 'exact', head: true }).eq('project_id', projectId)
    const observationNumber = `SO-${String((count ?? 0) + 1).padStart(3, '0')}`

    const { data: observation, error: insError } = await supabase.from('safety_observations').insert({
      project_id: projectId,
      observation_number: observationNumber,
      category,
      description,
      location,
      status: 'open',
      raised_by: user?.id ?? null,
      raised_by_email: user?.email ?? null,
      lot_id: lotId || null,
      swms_id: swmsId || null,
    }).select('id').single()

    if (insError) { setError(insError.message); setSaving(false); return }
    router.push(`/projects/${projectId}/safety/observations/${observation.id}`)
  }

  return (
    <PageShell projectId={projectId} activeSection="safety">
      <PageHeader
        title="Raise Safety Observation"
        subtitle="Hazard, near miss, unsafe act/condition, or a positive observation"
        breadcrumbs={[{ label: 'Observations', href: `/projects/${projectId}/safety/observations` }, { label: 'Raise' }]}
        actions={<Button onClick={saveObservation} disabled={saving}>{saving ? 'Saving...' : 'Raise Observation'}</Button>}
      />

      <div style={{ padding: '24px 32px', maxWidth: 760, margin: '0 auto' }}>
        {error && <div style={{ marginBottom: 16 }}><Alert variant="error">{error}</Alert></div>}

        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Select label="Category" value={category} onChange={setCategory} options={CATEGORIES} />
            <Textarea label="Description" rows={4} required value={description} onChange={setDescription} placeholder="What did you observe?" />
            <Input label="Location" value={location} onChange={setLocation} placeholder="e.g. Shaft 6, Ch.340" />
            <Select
              label="Link to Lot (optional)"
              value={lotId}
              onChange={setLotId}
              options={[{ value: '', label: 'None' }, ...lots.map(l => ({ value: l.id, label: l.label }))]}
            />
            <Select
              label="Link to SWMS (optional)"
              value={swmsId}
              onChange={setSwmsId}
              options={[{ value: '', label: 'None' }, ...swmsList.map(s => ({ value: s.id, label: s.label }))]}
            />
          </div>
        </Card>
      </div>
    </PageShell>
  )
}

