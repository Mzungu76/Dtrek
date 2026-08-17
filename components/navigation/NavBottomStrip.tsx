'use client'
import { ChevronUp, Pause, Play, Square } from 'lucide-react'

interface Props {
  distanceRemainingM: number
  etaDate: Date | null
  elevationRemainingM: number | null
  timerRunning: boolean
  onTogglePlayPause: () => void
  onStop: () => void
  /** Apre NavStatsSheet — il resto (tempi dettagliati, altimetria, percorso/POI/guida, foto/nota/specie) vive lì, non più in una scheda sempre montata sopra la mappa. */
  onExpand: () => void
}

function formatKm(m: number): string {
  return (m / 1000).toFixed(1)
}
function formatEta(d: Date): string {
  return d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
}

const ICON_BTN = 'w-9 h-9 rounded-full bg-black/45 backdrop-blur-sm text-white flex items-center justify-center shadow-sm shrink-0'
const TEXT_SHADOW = '0 1px 3px rgba(0,0,0,0.75), 0 1px 8px rgba(0,0,0,0.5)'

/**
 * Soluzione B: sostituisce la scheda bianca trascinabile — una sola riga sottile, sospesa sul
 * bordo inferiore con un velo di sfumatura invece di uno sfondo pieno, la mappa resta visibile
 * sotto e ai lati. I tre numeri essenziali restano sempre a vista; tutto il resto (tempi,
 * altimetria, percorso/POI/guida, foto/nota/specie) è un tocco più in là, in NavStatsSheet —
 * niente più trascinamento a tre livelli da imparare.
 */
export default function NavBottomStrip({
  distanceRemainingM, etaDate, elevationRemainingM, timerRunning, onTogglePlayPause, onStop, onExpand,
}: Props) {
  return (
    <div className="absolute bottom-0 inset-x-0 z-10 pointer-events-none">
      <div className="h-24 bg-gradient-to-t from-black/55 to-transparent" />
      <div
        className="absolute bottom-0 inset-x-0 flex flex-col items-center gap-1 pb-[calc(env(safe-area-inset-bottom)+10px)] px-4 pointer-events-none"
      >
        <button
          onClick={onExpand}
          className="pointer-events-auto flex items-center gap-1 text-white/70 text-[10px] font-semibold uppercase tracking-wide"
        >
          <ChevronUp className="w-3 h-3" /> Dettagli
        </button>

        <div className="w-full flex items-center justify-between gap-3">
          <button onClick={onTogglePlayPause} className={`${ICON_BTN} pointer-events-auto`} aria-label={timerRunning ? 'Pausa' : 'Avvia'}>
            {timerRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>

          <button onClick={onExpand} className="pointer-events-auto flex-1 min-w-0 text-center">
            <span className="font-mono text-[15px] font-bold text-white" style={{ textShadow: TEXT_SHADOW }}>
              {formatKm(distanceRemainingM)} km
              <span className="mx-1.5 text-white/50">·</span>
              {etaDate ? formatEta(etaDate) : '—'}
              <span className="mx-1.5 text-white/50">·</span>
              {elevationRemainingM != null ? `+${Math.round(elevationRemainingM)} m` : '—'}
            </span>
          </button>

          <button onClick={onStop} className={`${ICON_BTN} pointer-events-auto bg-red-600/90`} aria-label="Termina escursione">
            <Square className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
