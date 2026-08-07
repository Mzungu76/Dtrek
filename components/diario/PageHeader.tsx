import { FONT } from '@/lib/designTokens'
import type { AccentTheme } from './types'

export function PageHeader({ label, title }: { label: string; title: string }) {
  return (
    <>
      <p style={{ fontFamily: FONT.barlow, fontSize: 9, fontWeight: 700, letterSpacing: 4, color: '#e08d3c', textTransform: 'uppercase', margin: '0 0 8px' }}>
        {label}
      </p>
      <h2 style={{ fontFamily: FONT.display, fontSize: 32, fontWeight: 700, color: '#193b20', margin: '0 0 40px', letterSpacing: -0.5 }}>
        {title}
      </h2>
    </>
  )
}

export function PillHeader({ label, accent }: { label: string; accent: AccentTheme }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
      <span style={{ background: accent.iconBg, color: accent.text, padding: '3px 10px', borderRadius: 20, fontSize: 9, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', fontFamily: FONT.barlow }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 1, background: '#f3f4f6' }} />
    </div>
  )
}
