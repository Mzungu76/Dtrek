import type { ReactNode } from 'react'
import type { AccentTheme } from './types'

export function StatCard({ value, label, sub, icon, accent }: {
  value: string; label: string; sub?: string; icon?: ReactNode; accent: AccentTheme
}) {
  return (
    <div style={{ background: accent.bg, border: `1px solid ${accent.border}`, borderRadius: 10, padding: '14px 12px' }}>
      {icon && (
        <div style={{ width: 26, height: 26, borderRadius: 6, background: accent.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
          {icon}
        </div>
      )}
      <div style={{ fontSize: 22, fontWeight: 900, color: accent.text, fontFamily: 'Arial Black, sans-serif', lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 8, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 2, fontFamily: 'Arial, sans-serif', marginTop: 4 }}>{label}</div>
      {sub && <div style={{ fontSize: 8, color: '#9ca3af', fontStyle: 'italic', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}
