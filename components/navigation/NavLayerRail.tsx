'use client'
import { Route, MapPin, Mountain } from 'lucide-react'

interface Props {
  /** I sentieri vicini tratteggiati marroni (nearbyTrails, stile CalTopo) — MAI il percorso
   *  pianificato principale, che resta sempre visibile: è la traccia da seguire, non un layer
   *  opzionale da poter spegnere per errore. */
  showNearbyTrails: boolean
  onToggleNearbyTrails: () => void
  showPois: boolean
  onTogglePois: () => void
  showSlope: boolean
  onToggleSlope: () => void
}

const ITEMS = [
  { key: 'nearbyTrails' as const, icon: Route, label: 'Sentieri vicini' },
  { key: 'pois' as const, icon: MapPin, label: 'Punti di interesse' },
  { key: 'slope' as const, icon: Mountain, label: 'Pendenze' },
]

/**
 * Soluzione B (piano di restyling Navigator): rotaia sinistra, agganciata al bordo dello
 * schermo invece di una scheda che sottrae mappa — gli interruttori dei layer restano a un
 * tocco senza mai competere con lo spazio della mappa stessa.
 *
 * "Sentieri vicini" nasconde/mostra i tracciati OSM tratteggiati marroni intorno al percorso
 * (contesto, non la traccia da seguire) — POI nasconde/mostra i punti di interesse — Pendenze
 * sostituisce la linea verde a colore unico del percorso principale con i tratti colorati per
 * pendenza (lib/navigation/routeSlopeSegments.ts, gli stessi colori del profilo altimetrico e
 * della mappa nella scheda del percorso) quando c'è un profilo altimetrico da cui ricavarli.
 */
export default function NavLayerRail({ showNearbyTrails, onToggleNearbyTrails, showPois, onTogglePois, showSlope, onToggleSlope }: Props) {
  const state: Record<(typeof ITEMS)[number]['key'], [boolean, () => void]> = {
    nearbyTrails: [showNearbyTrails, onToggleNearbyTrails],
    pois: [showPois, onTogglePois],
    slope: [showSlope, onToggleSlope],
  }

  return (
    // Non si posiziona da sé — il chiamante (ActiveNavigationView.tsx) lo raggruppa col pulsante
    // "centra sulla mia posizione" in un'unica colonna sinistra centrata verticalmente, così i due
    // non finiscono a contendersi lo stesso punto sullo schermo.
    <div className="flex flex-col gap-2 py-2 pl-1.5 pr-2 rounded-r-2xl bg-stone-900/55 backdrop-blur-sm">
      {ITEMS.map(({ key, icon: Icon, label }) => {
        const [on, toggle] = state[key]
        return (
          <button
            key={key}
            onClick={toggle}
            aria-pressed={on}
            aria-label={label}
            title={label}
            className={`w-11 h-11 rounded-full flex items-center justify-center shadow-sm transition-colors ${
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
