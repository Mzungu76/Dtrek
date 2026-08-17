'use client'
import { ChevronUp, Pause, Play, Square } from 'lucide-react'

interface Props {
  /** Riga di sintesi già formattata dal chiamante (es. "4,2 km · 13:40 · +180 m" per il
   *  pianificato, "3,1 km · 48:12 · +95 m · 4,2 km/h" per la registrazione libera) — il
   *  componente resta così identico tra i due contesti, cambia solo cosa gli passa il chiamante. */
  summary: string
  timerRunning: boolean
  onTogglePlayPause: () => void
  onStop: () => void
  /** Apre il pannello dettagli a schermo intero — il resto (tempi, altimetria, foto/nota/...) vive
   *  lì, non più in una scheda sempre montata sopra la mappa. */
  onExpand: () => void
}

// 44px: pausa/riprendi e stop sono tra i controlli più toccati durante il cammino — stesso
// minimo di tocco dei controlli secondari della rotaia azioni, non più piccoli di quelli.
const ICON_BTN = 'w-11 h-11 rounded-full bg-black/45 backdrop-blur-sm text-white flex items-center justify-center shadow-sm shrink-0'
const TEXT_SHADOW = '0 1px 3px rgba(0,0,0,0.75), 0 1px 8px rgba(0,0,0,0.5)'

/**
 * Soluzione B: sostituisce la scheda bianca trascinabile — una sola riga sottile, sospesa sul
 * bordo inferiore con un velo di sfumatura invece di uno sfondo pieno, la mappa resta visibile
 * sotto e ai lati. I numeri essenziali restano sempre a vista; tutto il resto è un tocco più in
 * là, nel pannello dettagli — niente più trascinamento a tre livelli da imparare. Condiviso tra
 * il percorso pianificato (ActiveNavigationView.tsx) e la registrazione libera
 * (app/navigatore/traccia/page.tsx): stessa striscia, contenuto diverso.
 */
export default function NavBottomStrip({ summary, timerRunning, onTogglePlayPause, onStop, onExpand }: Props) {
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
            {timerRunning ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
          </button>

          <button
            onClick={onExpand}
            // Sfondo pieno semi-opaco, non solo l'ombra: la distanza residua/ora d'arrivo è un
            // dato di sicurezza (rientro prima del buio), non solo un dettaglio — deve restare
            // leggibile anche su una mappa molto chiara sotto sole forte.
            className="pointer-events-auto flex-1 min-w-0 text-center bg-black/40 backdrop-blur-sm rounded-full px-4 py-2"
          >
            <span className="font-mono text-[20px] font-bold text-white" style={{ textShadow: TEXT_SHADOW }}>
              {summary}
            </span>
          </button>

          <button onClick={onStop} className={`${ICON_BTN} pointer-events-auto bg-red-600/90`} aria-label="Termina">
            <Square className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  )
}
