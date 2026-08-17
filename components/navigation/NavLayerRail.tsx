'use client'
import { Route, MapPin, Mountain } from 'lucide-react'

interface Props {
  showRoute: boolean
  onToggleRoute: () => void
  showPois: boolean
  onTogglePois: () => void
  showSlope: boolean
  onToggleSlope: () => void
}

const ITEMS = [
  { key: 'route' as const, icon: Route, label: 'Percorso' },
  { key: 'pois' as const, icon: MapPin, label: 'Punti di interesse' },
  { key: 'slope' as const, icon: Mountain, label: 'Pendenze' },
]

/**
 * Soluzione B (piano di restyling Navigator): rotaia sinistra, agganciata al bordo dello
 * schermo invece di una scheda che sottrae mappa — gli interruttori dei layer restano a un
 * tocco senza mai competere con lo spazio della mappa stessa. Percorso e POI nascondono/
 * mostrano quanto già disegnato oggi; Pendenze sostituisce la linea verde a colore unico con i
 * tratti colorati per difficoltà (lib/navigation/routeSlopeSegments.ts) quando c'è un profilo
 * altimetrico da cui ricavarli.
 */
export default function NavLayerRail({ showRoute, onToggleRoute, showPois, onTogglePois, showSlope, onToggleSlope }: Props) {
  const state: Record<(typeof ITEMS)[number]['key'], [boolean, () => void]> = {
    route: [showRoute, onToggleRoute],
    pois: [showPois, onTogglePois],
    slope: [showSlope, onToggleSlope],
  }

  return (
    <div
      className="absolute left-0 z-10 flex flex-col gap-2 py-2 pl-1.5 pr-2 rounded-r-2xl bg-stone-900/55 backdrop-blur-sm"
      style={{ top: 'calc(50% + 20px)' }}
    >
      {ITEMS.map(({ key, icon: Icon, label }) => {
        const [on, toggle] = state[key]
        return (
          <button
            key={key}
            onClick={toggle}
            aria-pressed={on}
            aria-label={label}
            title={label}
            className={`w-10 h-10 rounded-full flex items-center justify-center shadow-sm transition-colors ${
              on ? 'bg-terra-500 text-white' : 'bg-white/15 text-white/55 border border-dashed border-white/40'
            }`}
          >
            <Icon className="w-[18px] h-[18px]" />
          </button>
        )
      })}
    </div>
  )
}
