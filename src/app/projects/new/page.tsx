'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function NewProject() {
  const [name, setName] = useState('')
  const [client, setClient] = useState('')
  const [clientType, setClientType] = useState('other')
  const [contractNumber, setContractNumber] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClient()

  async function create() {
    if (!name || !client) { setError('Project name and client are required'); return }
    setLoading(true)
    setError('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth/login'); return }

    // Get organisation directly from profiles
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('organisation_id')
      .eq('id', user.id)
      .maybeSingle()

    console.log('Profile lookup:', profile, profileError)

    let orgId = profile?.organisation_id

    // If no profile exists yet, create org and profile on the fly
    if (!orgId) {
      const { data: org, error: orgError } = await supabase
        .from('organisations')
        .insert({ name: user.email?.split('@')[0] || 'My Organisation' })
        .select('id')
        .single()

      console.log('Org created:', org, orgError)

      if (org) {
        orgId = org.id
        await supabase.from('profiles').insert({
          id: user.id,
          organisation_id: org.id,
          full_name: user.email?.split('@')[0] || 'User',
          role: 'admin',
        })
      }
    }

    if (!orgId) {
      setError('Could not find or create organisation. Please try again.')
      setLoading(false)
      return
    }

    const { data, error: projError } = await supabase
      .from('projects')
      .insert({
        name,
        client,
        client_type: clientType,
        contract_number: contractNumber,
        start_date: startDate || null,
        end_date: endDate || null,
        organisation_id: orgId,
        created_by: user.id,
        status: 'active',
      })
      .select('id')
      .single()

    console.log('Project created:', data, projError)

    if (projError) { setError(projError.message); setLoading(false); return }
    router.push(`/projects/${data.id}`)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', fontFamily: 'system-ui, sans-serif' }}>
      <style>{`* { box-sizing: border-box; margin: 0; padding: 0; }
        .inp { width: 100%; background: #111; border: 1px solid #222; border-radius: 6px; padding: 11px 14px; color: #e0e0e0; font-size: 14px; outline: none; font-family: inherit; }
        .inp:focus { border-color: #4ade80; }
        .lbl { color: #555; font-size: 11px; letter-spacing: 0.08em; display: block; margin-bottom: 6px; text-transform: uppercase; }
      `}</style>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 24px', borderBottom: '1px solid #1a1a1a' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 8, height: 8, background: '#4ade80', borderRadius: '50%' }} />
          <span style={{ color: '#e0e0e0', fontSize: 14, fontWeight: 500, letterSpacing: '0.05em' }}>QUALITYDOCS</span>
        </div>
        <button onClick={() => router.push('/dashboard')} style={{ background: 'none', border: '1px solid #222', borderRadius: 6, padding: '6px 12px', color: '#666', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
          {'\u2190'} Back
        </button>
      </div>

      <div style={{ maxWidth: 560, margin: '0 auto', padding: '40px 24px' }}>
        <h1 style={{ color: '#e0e0e0', fontSize: 20, fontWeight: 500, marginBottom: 8 }}>New Project</h1>
        <p style={{ color: '#555', fontSize: 13, marginBottom: 32 }}>Create a project to start generating ITPs and SWMS</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <label className="lbl">Project Name *</label>
            <input className="inp" placeholder="e.g. Central Interceptor" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div>
            <label className="lbl">Client *</label>
            <input className="inp" placeholder="e.g. Watercare Services Limited" value={client} onChange={e => setClient(e.target.value)} />
          </div>
          <div>
            <label className="lbl">Client Type</label>
            <select className="inp" value={clientType} onChange={e => setClientType(e.target.value)}>
              <option value="watercare">Watercare</option>
              <option value="auckland_transport">Auckland Transport</option>
              <option value="auckland_council">Auckland Council</option>
              <option value="nzta">NZTA</option>
              <option value="other_council">Other Council</option>
              <option value="private">Private</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="lbl">Contract Number</label>
            <input className="inp" placeholder="e.g. 6661" value={contractNumber} onChange={e => setContractNumber(e.target.value)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
            <div>
              <label className="lbl">Start Date</label>
              <input className="inp" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div>
              <label className="lbl">Finish Date</label>
              <input className="inp" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>
          </div>

          {error && <p style={{ color: '#f87171', fontSize: 13 }}>{error}</p>}

          <button onClick={create} disabled={loading} style={{ background: '#4ade80', color: '#0a0a0a', border: 'none', borderRadius: 6, padding: '13px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', marginTop: 8 }}>
            {loading ? 'Creating...' : 'Create Project'}
          </button>
        </div>
      </div>
    </div>
  )
}
