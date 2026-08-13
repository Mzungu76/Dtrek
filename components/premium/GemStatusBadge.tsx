'use client'
import GemIcon from './GemIcon'
import { useEntitlement, entitlementGemTone, entitlementLabel } from '@/lib/useEntitlement'

interface Props {
  /** Diametro del cerchietto bianco, in px. */
  size?: number
  /** Classi di posizionamento (es. "absolute -bottom-1 -right-1") — decise dal chiamante perché
   *  cambiano a seconda di cos'altro occupa gli angoli dell'avatar che lo ospita (es. il badge
   *  traguardi in components/profilo/SectionIdentita.tsx). */
  className?: string
}

/**
 * Lo stesso gioiello di stato (verde/ambra/rosso) ovunque compaia una foto profilo — non solo la
 * piccola icona persistente in Navbar, ma anche gli avatar grandi di /profilo e Impostazioni,
 * così il segnale "hai/non hai Dtrek sbloccato" si vede da qualunque punto dell'app si guardi la
 * propria foto, non solo dalla Navbar (docs/navigator-dtrek-boundary.md).
 */
export default function GemStatusBadge({ size = 16, className = '' }: Props) {
  const entitlement = useEntitlement()
  const tone = entitlementGemTone(entitlement)
  if (!tone) return null
  const label = entitlementLabel(entitlement)

  return (
    <span
      title={label ?? undefined}
      className={`rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.3)] flex items-center justify-center overflow-hidden ${className}`}
      style={{ width: size, height: size }}
    >
      <GemIcon tone={tone} size={Math.round(size * 0.7)} />
    </span>
  )
}
