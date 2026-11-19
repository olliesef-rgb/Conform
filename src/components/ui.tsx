// Conform - Shared Component Library
// Professional design system - clean, fast, construction SaaS

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

// -- DESIGN TOKENS ---------------------------------------------------------
export const colors = {
  bg:           '#FFFBF5',
  surface:      '#FFFFFF',
  border:       '#E2E6EA',
  borderDark:   '#CDD3DA',
  primary:      '#2563EB',
  primaryDark:  '#1D4ED8',
  primaryLight: '#EFF6FF',
  teal:         '#0D9488',
  tealLight:    '#F0FDFA',
  orange:       '#EA580C',
  orangeLight:  '#FFF7ED',
  textPrimary:  '#0F1923',
  textSecondary:'#52637A',
  textMuted:    '#8A9BB0',
  success:      '#4C8C2C',
  successLight: '#E2F6D5',
  warning:      '#B45309',
  warningLight: '#FFFBEB',
  danger:       '#DC2626',
  dangerLight:  '#FEF2F2',
  purple:       '#6D28D9',
  purpleLight:  '#F5F3FF',
  accent:       '#9FE870',
  accentInk:    '#163300',
  accentSoft:   '#E2F6D5',
  sidebar:      '#163300',
  sidebarBorder:'rgba(255,255,255,0.08)',
  sidebarText:  '#BFE0A8',
  sidebarActive:'#9FE870',
  sidebarActiveText: '#163300',
}

// -- ICON SET (no emojis) ------------------------------------------------
export const Icon = {
  project: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="1" width="6" height="6" rx="1.5" fill="currentColor" opacity="0.7"/>
      <rect x="9" y="1" width="6" height="6" rx="1.5" fill="currentColor"/>
      <rect x="1" y="9" width="6" height="6" rx="1.5" fill="currentColor"/>
      <rect x="9" y="9" width="6" height="6" rx="1.5" fill="currentColor" opacity="0.7"/>
    </svg>
  ),
  itp: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="1" width="12" height="14" rx="2" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="5" y1="5" x2="11" y2="5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="5" y1="8" x2="11" y2="8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="5" y1="11" x2="8" y2="11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  ),
  lots: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 2L14 5.5L8 9L2 5.5L8 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M2 9.5L8 13L14 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  library: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="2" width="3" height="12" rx="1" stroke="currentColor" strokeWidth="1.3"/>
      <rect x="6.5" y="2" width="3" height="12" rx="1" stroke="currentColor" strokeWidth="1.3"/>
      <rect x="11" y="4" width="3" height="10" rx="1" stroke="currentColor" strokeWidth="1.3" transform="rotate(8 12.5 9)"/>
    </svg>
  ),
  swms: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 1L14 4.5V11.5L8 15L2 11.5V4.5L8 1Z" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="8" y1="6" x2="8" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="8" cy="11" r="0.75" fill="currentColor"/>
    </svg>
  ),
  chevronRight: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  plus: () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <line x1="7" y1="2" x2="7" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="2" y1="7" x2="12" y2="7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  check: () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M2 7l3.5 3.5L12 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  warning: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 2L14.5 13H1.5L8 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      <line x1="8" y1="7" x2="8" y2="10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="8" cy="11.5" r="0.75" fill="currentColor"/>
    </svg>
  ),
  overview: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="8" cy="8" r="2" fill="currentColor"/>
    </svg>
  ),
  quality: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M2 8l4 4 8-8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  safety: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 1.5L13.5 4v5c0 3-2.5 5-5.5 5.5C5 14 2.5 12 2.5 9V4L8 1.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
    </svg>
  ),
  notices: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 2a6 6 0 100 12A6 6 0 008 2z" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="8" y1="5" x2="8" y2="8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="8" cy="10.5" r="0.75" fill="currentColor"/>
    </svg>
  ),
  reports: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="9" width="3" height="5" rx="1" fill="currentColor" opacity="0.5"/>
      <rect x="6.5" y="6" width="3" height="8" rx="1" fill="currentColor" opacity="0.75"/>
      <rect x="11" y="3" width="3" height="11" rx="1" fill="currentColor"/>
    </svg>
  ),
  settings: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  ),
  export: () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M7 1v8M4 6l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M2 10v2a1 1 0 001 1h8a1 1 0 001-1v-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
}

// -- BUTTON ---------------------------------------------------------------
interface ButtonProps {
  children: React.ReactNode
  onClick?: () => void
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'teal' | 'orange'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  fullWidth?: boolean
  href?: string
  download?: boolean
  type?: 'button' | 'submit'
  icon?: React.ReactNode
}

export function Button({
  children, onClick, variant = 'primary', size = 'md',
  disabled = false, fullWidth = false, href, download, type = 'button', icon
}: ButtonProps) {
  const sizes = {
    sm:  { padding: '6px 14px', fontSize: 13, height: 32 },
    md:  { padding: '9px 18px', fontSize: 14, height: 38 },
    lg:  { padding: '12px 26px', fontSize: 15, height: 46 },
  }
  const variants: Record<string, React.CSSProperties> = {
    primary:   { background: colors.accent,  color: colors.accentInk, border: `1px solid ${colors.accentInk}` },
    secondary: { background: '#fff', color: colors.textPrimary, border: `1px solid ${colors.border}` },
    danger:    { background: colors.danger,   color: '#fff', border: `1px solid #B91C1C` },
    ghost:     { background: 'transparent',   color: colors.textSecondary, border: '1px solid transparent' },
    teal:      { background: colors.teal,     color: '#fff', border: `1px solid #0F766E` },
    orange:    { background: colors.orange,   color: '#fff', border: `1px solid #C2410C` },
  }
  const style: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    gap: 6, fontFamily: 'inherit', fontWeight: 600, borderRadius: 9999,
    cursor: disabled ? 'not-allowed' : 'pointer',
    textDecoration: 'none', whiteSpace: 'nowrap',
    width: fullWidth ? '100%' : 'auto',
    opacity: disabled ? 0.45 : 1,
    transition: 'opacity 0.1s, filter 0.1s',
    letterSpacing: '-0.01em',
    ...sizes[size],
    ...variants[variant],
  }
  if (href) return <a href={href} download={download} style={style}>{icon}{children}</a>
  return (
    <button type={type} onClick={onClick} disabled={disabled} style={style}>
      {icon}{children}
    </button>
  )
}

// -- CARD -----------------------------------------------------------------
export function Card({ children, padding = 20, style = {}, onClick, hover = false }: {
  children: React.ReactNode; padding?: number | string; style?: React.CSSProperties; onClick?: () => void; hover?: boolean
}) {
  return (
    <div onClick={onClick} style={{
      background: colors.surface, border: `1px solid ${colors.border}`,
      borderRadius: 14, padding, boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
      cursor: onClick ? 'pointer' : 'default', ...style,
    }}>
      {children}
    </div>
  )
}

export function CardHeader({ children, style = {} }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      padding: '14px 20px', borderBottom: `1px solid ${colors.border}`,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', ...style,
    }}>{children}</div>
  )
}

export function CardBody({ children, padding = '16px 20px' }: { children: React.ReactNode; padding?: string }) {
  return <div style={{ padding }}>{children}</div>
}

// -- BADGE ----------------------------------------------------------------
type BadgeVariant = 'blue' | 'teal' | 'orange' | 'green' | 'yellow' | 'red' | 'purple' | 'grey'
  | 'H' | 'W' | 'R' | 'S' | 'M' | 'draft' | 'active' | 'closed' | 'pending' | 'approved' | 'rejected' | 'open'

const BADGE_STYLES: Record<string, { bg: string; color: string; border: string }> = {
  blue:     { bg: '#EFF6FF', color: '#1E40AF', border: '#BFDBFE' },
  teal:     { bg: '#F0FDFA', color: '#115E59', border: '#99F6E4' },
  orange:   { bg: '#FFF7ED', color: '#9A3412', border: '#FED7AA' },
  green:    { bg: '#ECFDF5', color: '#065F46', border: '#A7F3D0' },
  yellow:   { bg: '#FFFBEB', color: '#78350F', border: '#FDE68A' },
  red:      { bg: '#FEF2F2', color: '#991B1B', border: '#FECACA' },
  purple:   { bg: '#F5F3FF', color: '#4C1D95', border: '#DDD6FE' },
  grey:     { bg: '#F8F9FA', color: '#374151', border: '#E5E7EB' },
  open:     { bg: '#FEF2F2', color: '#991B1B', border: '#FECACA' },
  H:        { bg: '#FEF2F2', color: '#991B1B', border: '#FECACA' },
  W:        { bg: '#FFFBEB', color: '#78350F', border: '#FDE68A' },
  R:        { bg: '#EFF6FF', color: '#1E40AF', border: '#BFDBFE' },
  S:        { bg: '#F0FDFA', color: '#115E59', border: '#99F6E4' },
  M:        { bg: '#F5F3FF', color: '#4C1D95', border: '#DDD6FE' },
  draft:    { bg: '#F8F9FA', color: '#52637A', border: '#E2E6EA' },
  active:   { bg: '#E2F6D5', color: '#163300', border: '#C5EDAB' },
  closed:   { bg: '#EFF6FF', color: '#1E40AF', border: '#BFDBFE' },
  pending:  { bg: '#FFFBEB', color: '#78350F', border: '#FDE68A' },
  approved: { bg: '#E2F6D5', color: '#163300', border: '#C5EDAB' },
  rejected: { bg: '#FEF2F2', color: '#991B1B', border: '#FECACA' },
}

export function Badge({ variant, children }: { variant: BadgeVariant; children?: React.ReactNode }) {
  const s = BADGE_STYLES[variant] ?? BADGE_STYLES.grey
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999,
      letterSpacing: '0.02em', whiteSpace: 'nowrap',
    }}>
      {children ?? variant}
    </span>
  )
}

// -- INPUT ----------------------------------------------------------------
export function Input({ label, value, onChange, placeholder, type = 'text', required, hint, error }: {
  label?: string; value: string; onChange: (v: string) => void; placeholder?: string;
  type?: string; required?: boolean; hint?: string; error?: string
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {label && (
        <label style={{ fontSize: 13, fontWeight: 500, color: colors.textPrimary }}>
          {label}{required && <span style={{ color: colors.danger }}> *</span>}
        </label>
      )}
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{
        width: '100%', padding: '8px 11px', fontSize: 14,
        border: `1px solid ${error ? colors.danger : colors.border}`,
        borderRadius: 8, fontFamily: 'inherit', color: colors.textPrimary,
        background: '#fff', outline: 'none', boxSizing: 'border-box',
      }} />
      {hint && !error && <span style={{ fontSize: 12, color: colors.textMuted }}>{hint}</span>}
      {error && <span style={{ fontSize: 12, color: colors.danger }}>{error}</span>}
    </div>
  )
}

// -- TEXTAREA -------------------------------------------------------------
export function Textarea({ label, value, onChange, placeholder, rows = 3, required, hint }: {
  label?: string; value: string; onChange: (v: string) => void; placeholder?: string;
  rows?: number; required?: boolean; hint?: string
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {label && (
        <label style={{ fontSize: 13, fontWeight: 500, color: colors.textPrimary }}>
          {label}{required && <span style={{ color: colors.danger }}> *</span>}
        </label>
      )}
      <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows} style={{
        width: '100%', padding: '8px 11px', fontSize: 14,
        border: `1px solid ${colors.border}`, borderRadius: 8,
        fontFamily: 'inherit', color: colors.textPrimary,
        background: '#fff', outline: 'none', resize: 'none', boxSizing: 'border-box',
      }} />
      {hint && <span style={{ fontSize: 12, color: colors.textMuted }}>{hint}</span>}
    </div>
  )
}

// -- SELECT ---------------------------------------------------------------
export function Select({ label, value, onChange, options, required }: {
  label?: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[]; required?: boolean
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {label && (
        <label style={{ fontSize: 13, fontWeight: 500, color: colors.textPrimary }}>
          {label}{required && <span style={{ color: colors.danger }}> *</span>}
        </label>
      )}
      <select value={value} onChange={e => onChange(e.target.value)} style={{
        width: '100%', padding: '8px 11px', fontSize: 14,
        border: `1px solid ${colors.border}`, borderRadius: 8,
        fontFamily: 'inherit', color: colors.textPrimary,
        background: '#fff', outline: 'none', boxSizing: 'border-box',
      }}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}

// -- FORM SECTION ---------------------------------------------------------
export function FormSection({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ marginBottom: 14, paddingBottom: 10, borderBottom: `1px solid ${colors.border}` }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>{subtitle}</div>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>{children}</div>
    </div>
  )
}

// -- DIVIDER --------------------------------------------------------------
export function Divider({ margin = 20 }: { margin?: number }) {
  return <div style={{ borderTop: `1px solid ${colors.border}`, margin: `${margin}px 0` }} />
}

// -- STAT CARD ------------------------------------------------------------
export function StatCard({ label, value, sub, color = colors.textPrimary }: {
  label: string; value: string | number; sub?: string; color?: string; icon?: string
}) {
  return (
    <Card padding="16px 20px">
      <div style={{ fontSize: 11, fontWeight: 600, color: colors.textMuted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color, lineHeight: 1, letterSpacing: '-0.02em' }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 4 }}>{sub}</div>}
    </Card>
  )
}

// -- PROGRESS BAR ---------------------------------------------------------
export function ProgressBar({ percent, color = colors.accentInk, height = 6, showLabel = false }: {
  percent: number; color?: string; height?: number; showLabel?: boolean
}) {
  const pct = Math.min(100, Math.max(0, percent))
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ flex: 1, background: colors.border, borderRadius: 99, height, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 99, transition: 'width 0.4s ease' }} />
      </div>
      {showLabel && <span style={{ fontSize: 12, fontWeight: 600, color: colors.textSecondary, minWidth: 32 }}>{pct}%</span>}
    </div>
  )
}

// -- SEGMENTED BAR --------------------------------------------------------
export function SegmentedBar({ activities, holdPoints, ncrs, tests, overall }: {
  activities: number; holdPoints: number; ncrs: number; tests: number; overall: number
}) {
  const segments = [
    { label: 'Activities', value: activities, color: colors.teal },
    { label: 'Hold Points', value: holdPoints, color: colors.primary },
    { label: 'NCRs', value: ncrs, color: ncrs < 100 ? colors.danger : colors.success },
    { label: 'Tests', value: tests, color: colors.warning },
  ]
  return (
    <div>
      <div style={{ display: 'flex', gap: 3, height: 8, borderRadius: 99, overflow: 'hidden', marginBottom: 8 }}>
        {segments.map(s => (
          <div key={s.label} style={{ flex: 1, background: `${colors.border}`, borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ width: `${s.value}%`, height: '100%', background: s.color }} />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        {segments.map(s => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 7, height: 7, borderRadius: 2, background: s.color }} />
            <span style={{ fontSize: 11, color: colors.textMuted }}>{s.label}</span>
          </div>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 700, color: colors.textPrimary }}>{overall}%</span>
      </div>
    </div>
  )
}

// -- SKELETON -------------------------------------------------------------
export function Skeleton({ width = '100%', height = 14, radius = 5 }: { width?: string | number; height?: number; radius?: number }) {
  return <div style={{ width, height, borderRadius: radius, background: '#EEF0F3', animation: 'shimmer 1.5s infinite', backgroundSize: '200% 100%' }} />
}

export function SkeletonCard() {
  return (
    <Card>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Skeleton height={16} width="55%" />
        <Skeleton height={12} width="35%" />
        <Skeleton height={12} />
        <Skeleton height={12} width="75%" />
      </div>
    </Card>
  )
}

// -- EMPTY STATE ----------------------------------------------------------
export function EmptyState({ icon, title, description, action }: {
  icon: React.ReactNode; title: string; description: string; action?: React.ReactNode
}) {
  return (
    <div style={{ textAlign: 'center', padding: '56px 24px' }}>
      <div style={{ fontSize: 36, marginBottom: 14, opacity: 0.3, display: 'flex', justifyContent: 'center' }}>{icon}</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: colors.textPrimary, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 24, maxWidth: 340, margin: '0 auto 24px' }}>{description}</div>
      {action}
    </div>
  )
}

// -- ALERT ----------------------------------------------------------------
export function Alert({ variant, children }: { variant: 'info' | 'success' | 'warning' | 'error'; children: React.ReactNode }) {
  const s = {
    info:    { bg: '#EFF6FF', border: '#BFDBFE', color: '#1E40AF' },
    success: { bg: '#E2F6D5', border: '#C5EDAB', color: '#163300' },
    warning: { bg: '#FFFBEB', border: '#FDE68A', color: '#78350F' },
    error:   { bg: '#FEF2F2', border: '#FECACA', color: '#991B1B' },
  }[variant]
  return (
    <div style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 8, padding: '11px 14px', fontSize: 13, color: s.color, lineHeight: 1.5 }}>
      {children}
    </div>
  )
}

// -- PAGE SHELL -----------------------------------------------------------
export function PageShell({ children, projectId, activeSection }: {
  children: React.ReactNode; projectId?: string; activeSection?: string
}) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: colors.bg }}>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: ${colors.bg}; -webkit-font-smoothing: antialiased; }
        @keyframes shimmer { 0%,100% { opacity: 1 } 50% { opacity: 0.5 } }
        @keyframes spin { to { transform: rotate(360deg); } }
        input:focus, textarea:focus, select:focus { outline: none !important; border-color: ${colors.accentInk} !important; box-shadow: 0 0 0 3px rgba(159,232,112,0.25) !important; }
        button { font-family: inherit; }
        a { color: inherit; text-decoration: none; }
        ::placeholder { color: ${colors.textMuted}; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${colors.borderDark}; border-radius: 3px; }
      `}</style>
      <Sidebar projectId={projectId} activeSection={activeSection} />
      <main style={{ flex: 1, minWidth: 0, overflow: 'auto' }}>{children}</main>
    </div>
  )
}

// -- SIDEBAR --------------------------------------------------------------
function PreStartIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2.5" y="1.5" width="11" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M5.5 4.5h5M5.5 7.5h5M5.5 10.5h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  )
}
function AuditLogIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8.5" r="6" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M8 5.3V8.5l2.2 1.3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M5.2 1.8L8 1l1 1" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
    </svg>
  )
}

function DocumentsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M4 1.5h5.5L13 5v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2.5a1 1 0 0 1 1-1z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
      <path d="M9.5 1.5V5H13" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
      <path d="M5 8.5h6M5 11h6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
    </svg>
  )
}

function ResourcingIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v20M2 12h20" />
    </svg>
  )
}

function ActionsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M2.5 4.5l1.8 1.8 2.7-3.1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M2.5 10.5l1.8 1.8 2.7-3.1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M9 3.5h4.5M9 11.5h4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  )
}

function Sidebar({ projectId, activeSection }: { projectId?: string; activeSection?: string }) {
  const [storedProjectId, setStoredProjectId] = useState<string | undefined>(undefined)
  const [projectName, setProjectName] = useState<string | null>(null)

  // Keep the Project nav links visible on cross-project pages (like My Actions) by
  // remembering the last project the user was in. Not an active-link match there -
  // activeSection won't match any of these keys - so nothing lights up, it's just
  // there so Overview/Quality/Safety/etc. don't disappear and the sidebar doesn't
  // feel like it reset.
  useEffect(() => {
    if (projectId) {
      try { localStorage.setItem('conform_last_project_id', projectId) } catch {}
    } else {
      try {
        const stored = localStorage.getItem('conform_last_project_id')
        if (stored) setStoredProjectId(stored)
      } catch {}
    }
  }, [projectId])

  const effectiveProjectId = projectId ?? storedProjectId

  useEffect(() => {
    if (!effectiveProjectId) { setProjectName(null); return }
    const supabase = createClient()
    supabase.from('projects').select('name').eq('id', effectiveProjectId).single().then(({ data }: any) => {
      setProjectName(data?.name ?? null)
    })
  }, [effectiveProjectId])

  const topLinks = [
    { href: '/dashboard', icon: <Icon.project />, label: 'Projects', key: 'projects' },
    { href: '/my-actions', icon: <ActionsIcon />, label: 'My Actions', key: 'my-actions' },
  ]
  const projectLinks = effectiveProjectId ? [
    { href: `/projects/${effectiveProjectId}`, icon: <Icon.overview />, label: 'Overview', key: 'overview' },
    { href: `/projects/${effectiveProjectId}/prestarts`, icon: <PreStartIcon />, label: 'Pre-Starts', key: 'prestarts' },
    { href: `/projects/${effectiveProjectId}/allocations`, icon: <ResourcingIcon />, label: 'Resourcing', key: 'allocations' },
    { href: `/projects/${effectiveProjectId}/quality`, icon: <Icon.quality />, label: 'Quality', key: 'quality' },
    { href: `/projects/${effectiveProjectId}/safety`, icon: <Icon.safety />, label: 'Safety', key: 'safety' },
    { href: `/projects/${effectiveProjectId}/notices`, icon: <Icon.notices />, label: 'Notices', key: 'notices' },
    { href: `/projects/${effectiveProjectId}/documents`, icon: <DocumentsIcon />, label: 'Documents', key: 'documents' },
    { href: `/projects/${effectiveProjectId}/library`, icon: <Icon.library />, label: 'Library', key: 'library' },
    { href: `/projects/${effectiveProjectId}/reports`, icon: <Icon.reports />, label: 'Reports', key: 'reports' },
    { href: `/projects/${effectiveProjectId}/audit-log`, icon: <AuditLogIcon />, label: 'Audit Log', key: 'audit-log' },
  ] : []

  return (
    <div style={{
      width: 216, flexShrink: 0, background: colors.sidebar,
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      position: 'sticky', top: 0, height: '100vh',
    }}>
      {/* Logo */}
      <div style={{ padding: '20px 16px', borderBottom: `1px solid ${colors.sidebarBorder}`, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 30, height: 30, background: colors.accent, borderRadius: 7,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            transform: 'skewX(-14deg)',
          }}>
            <svg width="15" height="15" viewBox="0 0 14 14" fill="none" style={{ transform: 'skewX(14deg)' }}>
              <path d="M2 7.5l3 3 7-7" stroke={colors.accentInk} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span style={{ fontFamily: 'var(--font-wordmark)', fontStyle: 'italic', fontWeight: 900, fontSize: 17, color: '#F4F6F1', letterSpacing: '0.005em' }}>CONFORM</span>
        </div>
        <div style={{ fontSize: 9, fontWeight: 600, fontStyle: 'italic', letterSpacing: '0.1em', textTransform: 'uppercase', color: colors.accent, marginTop: 6, textAlign: 'center' }}>Conformance Assured</div>
      </div>

      {effectiveProjectId && (
        <div style={{ padding: '10px 14px', borderBottom: `1px solid ${colors.sidebarBorder}`, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#5C8A45' }}>Current Project</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#F4F6F1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={projectName ?? undefined}>
            {projectName ?? 'Loading...'}
          </div>
        </div>
      )}

      {/* Nav */}
      <nav style={{ padding: '14px 10px', flex: 1 }}>
        {topLinks.map(l => <SidebarLink key={l.key} href={l.href} icon={l.icon} label={l.label} active={activeSection === l.key} />)}
        {projectLinks.length > 0 && (
          <>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#5C8A45', padding: '14px 10px 5px' }}>
              Project
            </div>
            {projectLinks.map(l => <SidebarLink key={l.key} href={l.href} icon={l.icon} label={l.label} active={activeSection === l.key} />)}
          </>
        )}
      </nav>

      {/* Bottom */}
      <div style={{ padding: '10px 10px', borderTop: `1px solid ${colors.sidebarBorder}` }}>
        <SidebarLink href="/settings" icon={<Icon.settings />} label="Settings" active={false} />
      </div>
    </div>
  )
}

function SidebarLink({ href, icon, label, active }: { href: string; icon: React.ReactNode; label: string; active: boolean }) {
  return (
    <Link href={href} style={{
      display: 'flex', alignItems: 'center', gap: 9, padding: '8px 12px',
      borderRadius: 9999, marginBottom: 3, color: active ? colors.accentInk : colors.sidebarText,
      background: active ? colors.accent : 'transparent',
      fontSize: 13, fontWeight: active ? 600 : 400,
    }}>
      <span style={{ opacity: active ? 1 : 0.8, display: 'flex', alignItems: 'center' }}>{icon}</span>
      {label}
    </Link>
  )
}

// -- PAGE HEADER ----------------------------------------------------------
export function PageHeader({ title, subtitle, breadcrumbs, actions }: {
  title: string; subtitle?: string; breadcrumbs?: { label: string; href?: string }[]; actions?: React.ReactNode
}) {
  return (
    <div style={{ background: colors.surface, borderBottom: `1px solid ${colors.border}`, padding: '18px 28px' }}>
      {breadcrumbs && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
          {breadcrumbs.map((b, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span style={{ color: colors.textMuted, fontSize: 12 }}>\u203A</span>}
              {b.href
                ? <Link href={b.href} style={{ fontSize: 12, color: colors.textSecondary }}>{b.label}</Link>
                : <span style={{ fontSize: 12, color: colors.textMuted }}>{b.label}</span>}
            </React.Fragment>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: colors.textPrimary, letterSpacing: '-0.02em', lineHeight: 1.2 }}>{title}</h1>
          {subtitle && <p style={{ fontSize: 13, color: colors.textSecondary, marginTop: 3 }}>{subtitle}</p>}
        </div>
        {actions && <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' }}>{actions}</div>}
      </div>
    </div>
  )
}

// -- TABLE ----------------------------------------------------------------
export function Table({ headers, rows, emptyMessage = 'No records found' }: {
  headers: string[]; rows: React.ReactNode[][]; emptyMessage?: string
}) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: colors.bg }}>
            {headers.map(h => (
              <th key={h} style={{
                padding: '9px 14px', textAlign: 'left',
                fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
                letterSpacing: '0.06em', color: colors.textMuted,
                borderBottom: `1px solid ${colors.border}`,
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={headers.length} style={{ padding: '40px 14px', textAlign: 'center', color: colors.textMuted, fontSize: 13 }}>{emptyMessage}</td></tr>
          ) : rows.map((row, i) => (
            <tr key={i} style={{ borderBottom: `1px solid ${colors.border}` }}>
              {row.map((cell, j) => (
                <td key={j} style={{ padding: '11px 14px', color: colors.textPrimary, verticalAlign: 'middle' }}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// -- LOADING --------------------------------------------------------------
export function LoadingPage({ message = 'Loading...' }: { message?: string }) {
  return (
    <div style={{
      minHeight: '100vh', background: colors.bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12,
    }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ width: 32, height: 32, border: `2px solid ${colors.border}`, borderTopColor: colors.accentInk, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      <div style={{ fontSize: 13, color: colors.textSecondary }}>{message}</div>
    </div>
  )
}

export function GeneratingIndicator({ stage }: { stage: string }) {
  return (
    <div style={{ background: colors.accentSoft, border: `1px solid #C5EDAB`, borderRadius: 10, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ width: 28, height: 28, border: `2px solid #C5EDAB`, borderTopColor: colors.accentInk, borderRadius: '50%', animation: 'spin 0.7s linear infinite', flexShrink: 0 }} />
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: colors.accentInk }}>Generating with AI</div>
        <div style={{ fontSize: 12, color: '#2F5E1C', marginTop: 1 }}>{stage}</div>
      </div>
    </div>
  )
}

// -- NOTICE TYPES ---------------------------------------------------------
export const NOTICE_TYPES = {
  ncr:      { label: 'NCR',           color: colors.danger,   bg: '#FEF2F2', border: '#FECACA' },
  rfi:      { label: 'RFI',           color: colors.primary,  bg: '#EFF6FF', border: '#BFDBFE' },
  ewn:      { label: 'EWN',           color: colors.warning,  bg: '#FFFBEB', border: '#FDE68A' },
  ce:       { label: 'CE',            color: colors.purple,   bg: '#F5F3FF', border: '#DDD6FE' },
  dcr:      { label: 'DCR',           color: colors.teal,     bg: '#F0FDFA', border: '#99F6E4' },
  hpr:      { label: 'Hold Point',    color: '#991B1B',       bg: '#FEF2F2', border: '#FECACA' },
  wpr:      { label: 'Witness Point', color: '#78350F',       bg: '#FFFBEB', border: '#FDE68A' },
  lab_test: { label: 'Lab Test',      color: colors.teal,     bg: '#F0FDFA', border: '#99F6E4' },
  survey:   { label: 'Survey',        color: colors.primary,  bg: '#EFF6FF', border: '#BFDBFE' },
  safety:   { label: 'Safety Event',  color: colors.danger,   bg: '#FEF2F2', border: '#FECACA' },
}

export function NoticeTypeBadge({ type }: { type: keyof typeof NOTICE_TYPES }) {
  const t = NOTICE_TYPES[type]
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', background: t.bg, color: t.color, border: `1px solid ${t.border}`, fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 5 }}>
      {t.label}
    </span>
  )
}



