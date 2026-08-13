type Tone = 'unlocked' | 'trial' | 'expired'

// [tavola, cristallo sinistro, cristallo destro, padiglione sinistro, padiglione centrale] — sfumature
// via via più scure per dare volume a un taglio brillante stilizzato, invece di un'icona piatta a
// tinta unita. Una sola faccia (rightPavilion) riusa leftCrown per restare simmetrica sotto la luce.
const PALETTES: Record<Tone, [string, string, string, string, string]> = {
  unlocked: ['#8cc894', '#58aa63', '#378d44', '#20592b', '#193b20'],
  trial:    ['#fde68a', '#fcd34d', '#fbbf24', '#d97706', '#b45309'],
  expired:  ['#fecaca', '#fca5a5', '#f87171', '#dc2626', '#b91c1c'],
}

/**
 * Gioiello sfaccettato (taglio brillante stilizzato) per lo stato Premium/prova sull'avatar
 * (components/Navbar.tsx) — al posto di un'icona piatta monocolore, ogni faccetta ha una sua
 * sfumatura per dare l'illusione di volume/3D, più uno scintillio bianco in alto a sinistra dove
 * la luce colpirebbe la faccetta superiore.
 */
export default function GemIcon({ tone, size = 12, className = '' }: { tone: Tone; size?: number; className?: string }) {
  const [table, leftCrown, rightCrown, leftPavilion, centerPavilion] = PALETTES[tone]
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className}>
      <polygon points="6,3 11,3 8,9 2,9" fill={leftCrown} />
      <polygon points="11,3 13,3 16,9 8,9" fill={table} />
      <polygon points="13,3 18,3 22,9 16,9" fill={rightCrown} />
      <polygon points="2,9 8,9 12,22" fill={leftPavilion} />
      <polygon points="8,9 16,9 12,22" fill={centerPavilion} />
      <polygon points="16,9 22,9 12,22" fill={leftCrown} />
      <path d="M6 3h12l4 6-10 13L2 9Z" fill="none" stroke={centerPavilion} strokeWidth="0.75" strokeLinejoin="round" />
      <path d="M9.5 4.8 10 5.9 11.1 6.4 10 6.9 9.5 8 9 6.9 7.9 6.4 9 5.9Z" fill="white" opacity="0.9" />
    </svg>
  )
}
