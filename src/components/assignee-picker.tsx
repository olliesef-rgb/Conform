'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { colors } from '@/components/ui'

interface ProfileOption { id: string; full_name: string }

// Type-ahead name picker for assigning an ITP / Notice / Safety Observation to
// someone. Scoped to organisationId so you only ever see people in your own
// organisation, never the whole app's user base.
export function AssigneePicker({ organisationId, currentName, onAssign, onUnassign, disabled }: {
  organisationId: string | null
  currentName: string | null
  onAssign: (id: string, name: string) => void
  onUnassign: () => void
  disabled?: boolean
}) {
  const supabase = createClient()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [options, setOptions] = useState<ProfileOption[]>([])
  const [searching, setSearching] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  async function search(q: string) {
    setQuery(q)
    setOpen(true)
    if (!organisationId) return
    setSearching(true)
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('organisation_id', organisationId)
      .ilike('full_name', `%${q}%`)
      .order('full_name')
      .limit(8)
    setOptions(data ?? [])
    setSearching(false)
  }

  function pick(opt: ProfileOption) {
    onAssign(opt.id, opt.full_name)
    setQuery('')
    setOptions([])
    setOpen(false)
  }

  if (currentName && !open) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: colors.accentSoft, color: colors.accentInk,
          fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 999,
        }}>
          {currentName}
        </span>
        {!disabled && (
          <button
            onClick={() => { setOpen(true); search('') }}
            style={{ fontSize: 12, color: colors.textSecondary, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
          >
            Reassign
          </button>
        )}
        {!disabled && (
          <button
            onClick={onUnassign}
            style={{ fontSize: 12, color: colors.danger, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
          >
            Unassign
          </button>
        )}
      </div>
    )
  }

  return (
    <div ref={ref} style={{ position: 'relative', maxWidth: 320 }}>
      <input
        type="text"
        value={query}
        onChange={e => search(e.target.value)}
        onFocus={() => { setOpen(true); if (options.length === 0) search('') }}
        placeholder="Type a name..."
        disabled={disabled}
        style={{
          width: '100%', padding: '8px 11px', fontSize: 13,
          border: `1px solid ${colors.border}`, borderRadius: 8,
          fontFamily: 'inherit', color: colors.textPrimary,
          background: '#fff', outline: 'none', boxSizing: 'border-box',
        }}
      />
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 4, background: '#fff',
          border: `1px solid ${colors.border}`, borderRadius: 8, boxShadow: '0 4px 14px rgba(0,0,0,0.12)',
          zIndex: 20, maxHeight: 220, overflowY: 'auto', minWidth: 220, width: '100%',
        }}>
          {searching ? (
            <div style={{ padding: '8px 12px', fontSize: 12, color: colors.textMuted }}>Searching...</div>
          ) : options.length === 0 ? (
            <div style={{ padding: '8px 12px', fontSize: 12, color: colors.textMuted }}>
              {query.trim() ? 'No matching people in your organisation.' : 'Start typing a name...'}
            </div>
          ) : options.map(o => (
            <div
              key={o.id}
              onClick={() => pick(o)}
              style={{ padding: '8px 12px', fontSize: 13, cursor: 'pointer', color: colors.textPrimary }}
              onMouseDown={e => e.preventDefault()}
            >
              {o.full_name}
            </div>
          ))}
          {currentName && (
            <div
              style={{ padding: '8px 12px', fontSize: 12, color: colors.textMuted, cursor: 'pointer', borderTop: `1px solid ${colors.border}` }}
              onMouseDown={e => e.preventDefault()}
              onClick={() => { setOpen(false); setQuery('') }}
            >
              Cancel
            </div>
          )}
        </div>
      )}
    </div>
  )
}
