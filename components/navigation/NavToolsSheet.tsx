'use client'
import { Signpost, Radio, Download, CheckCircle2, Mic, HelpCircle, Square, Box } from 'lucide-react'
import Sheet from '@/components/ui/Sheet'
import { ONLINE_OPTIONS, type MapMode } from './MapModeSwitcher'
import TrailConfidenceBadge from './TrailConfidenceBadge'
import ParkingSpotControl from './ParkingSpotControl'
import type { TrailConfidenceResult } from '@/lib/navigation/trailConfidence'
import type { ParkingSpot } from '@/lib/navigation/navigationStore'

interface Props {
  open: boolean
  onClose: () => void
  // Sulla mappa
  showNearbyTrails: boolean; onToggleNearbyTrails: () => void
  showPois: boolean; onTogglePois: () => void
  showSlope: boolean; onToggleSlope: () => void
  mapMode: MapMode; onMapModeChange: (m: MapMode) => void
  is3D: boolean; onToggle3D: () => void
  isOnline: boolean
  showNatura2000: boolean; onToggleNatura2000: () => void
  // Sicurezza
  onEscape: () => void
  liveSharingEnabled: boolean; onLiveShare: () => void
  parkingSpot: ParkingSpot | null
  position: { lat: number; lon: number } | null
  parkingDistanceM: number | null; parkingBearingDeg: number | null
  onSaveParking: () => void; onClearParking: () => void
  trailConfidence: TrailConfidenceResult | null
  // App
  hasRoute: boolean; offlineReady: boolean; onOffline: () => void
  onGiulia: () => void
  onHelp: () => void
  onEnd: () => void
}

const TILE = 'w-full min-h-[76px] rounded-2xl flex flex-col items-center justify-center gap-1.5 px-1 text-[12px] font-semibold leading-tight text-center transition-colors'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500 mb-2">{title}</p>
      {children}
    </div>
  )
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={`min-h-[44px] px-3.5 rounded-full text-[13px] font-semibold border transition-colors ${
        on ? 'bg-terra-500 border-terra-500 text-white' : 'bg-white border-stone-300 text-stone-600'
      }`}
    >
      {children}
    </button>
  )
}

/**
 * Tutti i controlli secondari della navigazione in un punto solo, con etichette, raggruppati per
 * scopo — al posto delle due rotaie di icone sparse ai lati della mappa. Si apre dal pulsante
 * "Strumenti" del pannello inferiore. Usa lo Sheet condiviso, quindi dentro l'app Android il
 * tasto/gesto indietro lo chiude prima di qualunque altra cosa (backHandlerStack). Le azioni che
 * aprono un altro foglio/popup chiudono prima questo, così non restano due fogli sovrapposti.
 */
export default function NavToolsSheet(p: Props) {
  const then = (fn: () => void) => () => { p.onClose(); fn() }
  const modes = p.isOnline ? ONLINE_OPTIONS : ONLINE_OPTIONS.filter((o) => o.id === 'offline')
  const rich = p.mapMode !== 'offline'

  return (
    <Sheet open={p.open} onClose={p.onClose} title="Strumenti">
      <div className="space-y-5 max-h-[68vh] overflow-y-auto -mx-1 px-1">
        <Section title="Sulla mappa">
          <div className="flex flex-wrap gap-2">
            <Chip on={p.showNearbyTrails} onClick={p.onToggleNearbyTrails}>Sentieri vicini</Chip>
            <Chip on={p.showPois} onClick={p.onTogglePois}>Punti di interesse</Chip>
            <Chip on={p.showSlope} onClick={p.onToggleSlope}>Pendenze</Chip>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            {modes.map((o) => (
              <Chip key={o.id} on={p.mapMode === o.id} onClick={() => p.onMapModeChange(o.id)}>{o.label}</Chip>
            ))}
          </div>
          {rich && (
            <div className="flex flex-wrap gap-2 mt-2">
              <Chip on={p.is3D} onClick={p.onToggle3D}><span className="inline-flex items-center gap-1.5"><Box className="w-4 h-4" /> Vista 3D</span></Chip>
              <Chip on={p.showNatura2000} onClick={p.onToggleNatura2000}>Confini Natura 2000</Chip>
            </div>
          )}
        </Section>

        <Section title="Sicurezza">
          <div className="grid grid-cols-3 gap-2">
            <button onClick={then(p.onEscape)} className={`${TILE} bg-terra-50 text-terra-700 ring-1 ring-terra-400`}>
              <Signpost className="w-6 h-6" /> Vie d&apos;uscita
            </button>
            <button onClick={then(p.onLiveShare)} className={`${TILE} ${p.liveSharingEnabled ? 'bg-sky-600 text-white' : 'bg-stone-100 text-stone-800'}`}>
              <Radio className="w-6 h-6" /> {p.liveSharingEnabled ? 'Live attiva' : 'Posizione live'}
            </button>
            <ParkingSpotControl
              variant="tile" spot={p.parkingSpot} position={p.position}
              distanceM={p.parkingDistanceM} bearingToSpotDeg={p.parkingBearingDeg}
              onSave={p.onSaveParking} onClear={p.onClearParking}
            />
          </div>
          {p.trailConfidence && (
            <div className="mt-2">
              <TrailConfidenceBadge confidence={p.trailConfidence} variant="tile" />
            </div>
          )}
        </Section>

        <Section title="App">
          <div className="grid grid-cols-3 gap-2">
            {p.hasRoute && (
              <button onClick={then(p.onOffline)} className={`${TILE} ${p.offlineReady ? 'bg-emerald-600 text-white' : 'bg-stone-100 text-stone-800'}`}>
                {p.offlineReady ? <CheckCircle2 className="w-6 h-6" /> : <Download className="w-6 h-6" />}
                {p.offlineReady ? 'Mappa scaricata' : 'Scarica offline'}
              </button>
            )}
            <button onClick={then(p.onGiulia)} className={`${TILE} bg-stone-100 text-stone-800`}>
              <Mic className="w-6 h-6" /> Chiedi a Giulia
            </button>
            <button onClick={then(p.onHelp)} className={`${TILE} bg-stone-100 text-stone-800`}>
              <HelpCircle className="w-6 h-6" /> Come funziona
            </button>
            <button onClick={then(p.onEnd)} className={`${TILE} bg-red-50 text-red-700`}>
              <Square className="w-6 h-6" /> Termina
            </button>
          </div>
        </Section>
      </div>
    </Sheet>
  )
}
