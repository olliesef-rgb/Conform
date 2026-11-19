'use client'

import { useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { PageShell, PageHeader, Card, Button, Input, Textarea, Alert } from '@/components/ui'

export default function NewLotPage() {
  const router = useRouter()
  const params = useParams()
  const projectId = params.id as string
  const supabase = createClient()

  const [lotNumber, setLotNumber] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit() {
    if (!lotNumber || !name) { setError('Lot number and name are required.'); return }
    setLoading(true)
    setError('')
    const { data: { user } } = await supabase.auth.getUser()
    const { data, error } = await supabase
      .from('lots')
      .insert({
        project_id: projectId,
        lot_number: lotNumber,
        name,
        description: description || null,
        created_by: user?.id,
      })
      .select('id')
      .single()
    if (error) { setError(error.message); setLoading(false); return }
    router.push(`/projects/${projectId}/lots/${data.id}`)
  }

  return (
    <PageShell projectId={projectId} activeSection="lots">
      <PageHeader
        title="New Lot"
        subtitle="Create a work package to group ITPs and track completion"
        breadcrumbs={[
          { label: 'Lots', href: `/projects/${projectId}/lots` },
          { label: 'New' },
        ]}
      />

      <div style={{ padding: '32px', maxWidth: 560 }}>
        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {error && <Alert variant="error">{error}</Alert>}
            <Input label="Lot number" required value={lotNumber} onChange={setLotNumber} placeholder="e.g. LOT-014" />
            <Input label="Name" required value={name} onChange={setName} placeholder="e.g. Shaft 4 — Base Slab" />
            <Textarea label="Description" value={description} onChange={setDescription} placeholder="Optional notes about this lot's scope" rows={3} />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <Button onClick={handleSubmit} disabled={loading}>{loading ? 'Creating...' : 'Create Lot'}</Button>
              <Button variant="secondary" onClick={() => router.push(`/projects/${projectId}/lots`)}>Cancel</Button>
            </div>
          </div>
        </Card>
      </div>
    </PageShell>
  )
}
