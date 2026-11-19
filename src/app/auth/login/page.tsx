'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [name, setName] = useState('')
  const router = useRouter()
  const supabase = createClient()

  async function handleSubmit() {
    setLoading(true)
    setError('')
    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) { setError(error.message); setLoading(false); return }
      router.push('/dashboard')
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) { setError(error.message); setLoading(false); return }
      if (data.user) {
        const { data: org } = await supabase
          .from('organisations')
          .insert({ name: name || email.split('@')[0] })
          .select('id').single()
        if (org) {
          await supabase.from('profiles').insert({
            id: data.user.id,
            organisation_id: org.id,
            full_name: name || email.split('@')[0],
            role: 'admin',
          })
        }
        router.push('/dashboard')
      }
    }
    setLoading(false)
  }

  return (
    <div style={{
      minHeight: '100vh', background: '#FFFBF5',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .inp {
          width: 100%; background: #ffffff; border: 1px solid #D8DDE3;
          border-radius: 10px; padding: 11px 14px; color: #0E0F0C;
          font-size: 14px; outline: none; font-family: inherit;
          transition: border-color 0.15s;
        }
        .inp:focus { border-color: #163300; box-shadow: 0 0 0 3px rgba(159,232,112,0.3); }
        .inp::placeholder { color: #9AA3AF; }
        .btn {
          width: 100%; background: #9FE870; color: #163300;
          border: 1px solid #163300; border-radius: 9999px; padding: 12px;
          font-size: 14px; font-weight: 700; cursor: pointer;
          font-family: inherit; transition: opacity 0.15s;
        }
        .btn:hover { opacity: 0.9; }
        .btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .lbl { color: #6B7268; font-size: 11px; letter-spacing: 0.06em;
          display: block; margin-bottom: 6px; text-transform: uppercase;
          font-weight: 500; }
        .tog { background: none; border: none; color: #163300;
          cursor: pointer; font-size: 13px; text-decoration: underline;
          font-family: inherit; padding: 0; font-weight: 600; }
      `}</style>

      <div style={{ width: '100%', maxWidth: 400, padding: '0 24px' }}>
        <div style={{ marginBottom: 36, textAlign: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 11, marginBottom: 10 }}>
            <div style={{ width: 30, height: 30, background: '#9FE870', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transform: 'skewX(-14deg)' }}>
              <svg width="15" height="15" viewBox="0 0 14 14" fill="none" style={{ transform: 'skewX(14deg)' }}><path d="M2 7.5l3 3 7-7" stroke="#163300" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
            <span style={{ fontFamily: "var(--font-wordmark)", fontStyle: 'italic', fontWeight: 900, color: '#0E0F0C', fontSize: 25, letterSpacing: '0.005em' }}>
              CONFORM
            </span>
          </div>
          <p style={{ color: '#4E8B2C', fontSize: 11, fontWeight: 600, fontStyle: 'italic', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Conformance Assured
          </p>
        </div>

        <div style={{ background: '#ffffff', border: '1px solid #E3E7EC', borderRadius: 18, padding: 32, boxShadow: '0 1px 3px rgba(16,24,40,0.06)' }}>
          <h2 style={{ color: '#0E0F0C', fontSize: 16, fontWeight: 700, marginBottom: 22, fontFamily: 'inherit' }}>
            {mode === 'login' ? 'Sign in to your account' : 'Create your account'}
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {mode === 'signup' && (
              <div>
                <label className="lbl">Company / Name</label>
                <input className="inp" placeholder="e.g. GAJV Construction"
                  value={name} onChange={e => setName(e.target.value)} />
              </div>
            )}
            <div>
              <label className="lbl">Email</label>
              <input className="inp" type="email" placeholder="you@company.com"
                value={email} onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
            </div>
            <div>
              <label className="lbl">Password</label>
              <input className="inp" type="password" placeholder="••••••••"
                value={password} onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
            </div>
            {error && <p style={{ color: '#DC2626', fontSize: 13 }}>{error}</p>}
            <button className="btn" onClick={handleSubmit} disabled={loading} style={{ marginTop: 8 }}>
              {loading ? 'Please wait...' : mode === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </div>

          <p style={{ color: '#8A93A0', fontSize: 13, marginTop: 20, textAlign: 'center' }}>
            {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
            <button className="tog" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError('') }}>
              {mode === 'login' ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
