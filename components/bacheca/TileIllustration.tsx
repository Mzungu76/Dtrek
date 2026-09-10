// Illustrazioni piatte disegnate a mano (SVG inline, nessun asset esterno) per le card della
// filmstrip di Bacheca — al posto delle icone lucide su sfondo a gradiente. Raggruppate per
// "famiglia" tematica (9 in tutto) invece di un disegno diverso per ognuna delle ~30 card: card
// concettualmente imparentate condividono la stessa scena, tinta nel colore della card.
export type IllustrationKind =
  | 'pulse' | 'trophy' | 'trend' | 'bars' | 'calendar'
  | 'mountain' | 'route' | 'seasons' | 'backpack'

interface Props {
  kind: IllustrationKind
  tone: string
  className?: string
}

export default function TileIllustration({ kind, tone, className = 'w-full h-full' }: Props) {
  const props = { tone, className }
  switch (kind) {
    case 'pulse':    return <PulseIllustration {...props} />
    case 'trophy':   return <TrophyIllustration {...props} />
    case 'trend':    return <TrendIllustration {...props} />
    case 'bars':     return <BarsIllustration {...props} />
    case 'calendar': return <CalendarIllustration {...props} />
    case 'mountain': return <MountainIllustration {...props} />
    case 'route':    return <RouteIllustration {...props} />
    case 'seasons':  return <SeasonsIllustration {...props} />
    case 'backpack': return <BackpackIllustration {...props} />
  }
}

function PulseIllustration({ tone, className }: { tone: string; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className}>
      <circle cx="32" cy="32" r="26" fill={`${tone}1f`} />
      <path d="M10 34h9l4-10 6 18 5-13 3 5h17" fill="none" stroke={tone} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function TrophyIllustration({ tone, className }: { tone: string; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className}>
      <circle cx="32" cy="32" r="26" fill={`${tone}1f`} />
      <path d="M24 18h16v10a8 8 0 01-16 0V18z" fill={tone} opacity="0.85" />
      <path d="M24 20h-6a5 5 0 005 6M40 20h6a5 5 0 01-5 6" fill="none" stroke={tone} strokeWidth="2" strokeLinecap="round" />
      <rect x="29" y="36" width="6" height="7" fill={tone} opacity="0.85" />
      <rect x="22" y="43" width="20" height="4" rx="1.5" fill={tone} />
    </svg>
  )
}

function TrendIllustration({ tone, className }: { tone: string; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className}>
      <circle cx="32" cy="32" r="26" fill={`${tone}1f`} />
      <path d="M14 40l10-8 8 6 12-16 6 5" fill="none" stroke={tone} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="50" cy="27" r="3" fill={tone} />
    </svg>
  )
}

function BarsIllustration({ tone, className }: { tone: string; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className}>
      <circle cx="32" cy="32" r="26" fill={`${tone}1f`} />
      <rect x="16" y="34" width="7" height="14" rx="1.5" fill={tone} opacity="0.55" />
      <rect x="28" y="24" width="7" height="24" rx="1.5" fill={tone} opacity="0.8" />
      <rect x="40" y="18" width="7" height="30" rx="1.5" fill={tone} />
    </svg>
  )
}

function CalendarIllustration({ tone, className }: { tone: string; className?: string }) {
  const dots = [0, 1, 2, 3].flatMap(row => [0, 1, 2, 3].map(col => ({ row, col })))
  return (
    <svg viewBox="0 0 64 64" className={className}>
      <circle cx="32" cy="32" r="26" fill={`${tone}1f`} />
      <rect x="16" y="18" width="32" height="28" rx="4" fill="none" stroke={tone} strokeWidth="2" />
      <path d="M16 26h32" stroke={tone} strokeWidth="2" />
      {dots.map(({ row, col }, i) => (
        <rect key={i} x={21 + col * 6.5} y={31 + row * 5.5} width="4" height="4" rx="1"
          fill={tone} opacity={(row + col) % 3 === 0 ? 0.9 : 0.25} />
      ))}
    </svg>
  )
}

function MountainIllustration({ tone, className }: { tone: string; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className}>
      <circle cx="32" cy="32" r="26" fill={`${tone}1f`} />
      <path d="M12 44l12-18 8 10 6-8 14 16z" fill={tone} opacity="0.85" />
      <path d="M24 26l4 5-4 5-4-5z" fill="#fff" opacity="0.9" />
      <path d="M32 30l1.5-4h-3z" fill={tone} />
    </svg>
  )
}

function RouteIllustration({ tone, className }: { tone: string; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className}>
      <circle cx="32" cy="32" r="26" fill={`${tone}1f`} />
      <path d="M14 46c8 0 6-12 14-12s6 12 14 12 6-20 16-20" fill="none" stroke={tone} strokeWidth="2.5" strokeLinecap="round" strokeDasharray="1 6.5" />
      <circle cx="14" cy="46" r="3" fill={tone} />
      <path d="M46 14l4 2-4 2z" fill={tone} />
      <circle cx="48" cy="16" r="3.5" fill="none" stroke={tone} strokeWidth="2" />
    </svg>
  )
}

function SeasonsIllustration({ tone, className }: { tone: string; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className}>
      <circle cx="32" cy="32" r="26" fill={`${tone}1f`} />
      <circle cx="26" cy="26" r="8" fill={tone} opacity="0.85" />
      {Array.from({ length: 8 }).map((_, i) => {
        const a = (i / 8) * Math.PI * 2
        const x1 = 26 + Math.cos(a) * 11, y1 = 26 + Math.sin(a) * 11
        const x2 = 26 + Math.cos(a) * 15, y2 = 26 + Math.sin(a) * 15
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={tone} strokeWidth="2" strokeLinecap="round" opacity="0.6" />
      })}
      <path d="M38 40c4 0 8 3 8 7H30c0-4 4-7 8-7z" fill={tone} opacity="0.5" />
    </svg>
  )
}

function BackpackIllustration({ tone, className }: { tone: string; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className}>
      <circle cx="32" cy="32" r="26" fill={`${tone}1f`} />
      <rect x="20" y="24" width="24" height="24" rx="7" fill={tone} opacity="0.85" />
      <path d="M25 24v-4a7 7 0 0114 0v4" fill="none" stroke={tone} strokeWidth="2.5" />
      <rect x="27" y="32" width="10" height="8" rx="2" fill="#fff" opacity="0.85" />
      <circle cx="32" cy="46" r="2" fill="#fff" opacity="0.7" />
    </svg>
  )
}
