'use client'
import { Camera, ChevronUp, Pause, Play, Square, LayoutGrid } from 'lucide-react'

interface Props {
  /** Riga di sintesi già formattata dal chiamante (es. "4,2 km · 13:40 · +180 m" per il
   *  pianificato, "3,1 km · 48:12 · +95 m · 4,2 km/h" per la registrazione libera) — il
   *  componente resta così identico tra i due contesti, cambia solo cosa gli passa il chiamante. */
  summary: string
  /** Se presente, al posto della pillola di testo `summary` mostra un pannello con i dati in
   *  colonna (numero grande, unità sotto) e i pulsanti etichettati. Usato dalla navigazione su
   *  percorso; la registrazione libera resta sulla pillola. */
  metrics?: { value: string; unit: string }[]
  /** Apre la scheda "Strumenti" (solo con `metrics`). */
  onOpenTools?: () => void
  timerRunning: boolean
  onTogglePlayPause: () => void
  /** Assente nella navigazione su percorso: "Termina" sta in Strumenti / Dettagli. */
  onStop?: () => void
  /** Apre il pannello dettagli a schermo intero — il resto (tempi, altimetria, nota testuale/...)
   *  vive lì, non più in una scheda sempre montata sopra la mappa. */
  onExpand: () => void
  /** Scatto rapido durante la navigazione (apre FieldNoteSheet con la fotocamera già pronta) —
   *  unico accesso diretto sopra la mappa: era l'azione più cercata e più nascosta (raggiungibile
   *  solo da Dettagli), ma resta un solo pulsante in più per non appesantire una barra pensata
   *  per restare minimale. Una nota di solo testo resta un tocco più in là, in Dettagli. */
  onOpenFoto: () => void
  /** DTREK-AUDIT.md P1 #20 — interruttore manuale (nessun sensore di luce disponibile a una
   *  pagina web): sfondo pieno opaco invece di semi-trasparente sotto sole forte. */
  highContrast?: boolean
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
export default function NavBottomStrip({ summary, metrics, onOpenTools, timerRunning, onTogglePlayPause, onStop, onExpand, onOpenFoto, highContrast }: Props) {
  // DTREK-AUDIT.md P1 #20 — sfondo pieno opaco (bg-black, non bg-black/40-45) sotto sole forte per
  // testo/pulsanti icona: la trasparenza lascia passare troppa luce su uno schermo molto luminoso
  // perché restino leggibili/riconoscibili.
  const iconBtn = highContrast ? ICON_BTN.replace('bg-black/45', 'bg-black') : ICON_BTN
  const summaryBg = highContrast ? 'bg-black' : 'bg-black/40 backdrop-blur-sm'
  if (metrics) {
    const panel = highContrast ? 'bg-black' : 'bg-stone-900/95 backdrop-blur-sm'
    const btn = 'pointer-events-auto h-14 rounded-2xl flex flex-col items-center justify-center gap-0.5 text-[12px] font-semibold text-white'
    return (
      <div className="absolute bottom-0 inset-x-0 z-10 pointer-events-none px-2 pb-[calc(env(safe-area-inset-bottom)+8px)]">
        <div className={`pointer-events-auto rounded-3xl px-3 pt-3 pb-3 shadow-2xl ${panel}`}>
          <button onClick={onExpand} className="w-full grid grid-cols-3 text-center mb-3" aria-label="Apri i dettagli">
            {metrics.map((m, i) => (
              <span key={i} className={`min-w-0 ${i > 0 ? 'border-l border-white/15' : ''}`}>
                <span className="block font-mono font-bold text-[30px] leading-none text-white tabular-nums">{m.value}</span>
                <span className="block text-[12px] text-white/65 mt-1">{m.unit}</span>
              </span>
            ))}
          </button>
          <div className="grid grid-cols-3 gap-2">
            <button onClick={onTogglePlayPause} className={`${btn} bg-terra-500`}>
              {timerRunning ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
              {timerRunning ? 'Pausa' : 'Avvia'}
            </button>
            <button onClick={onOpenFoto} className={`${btn} bg-white/15`}>
              <Camera className="w-6 h-6" /> Foto
            </button>
            <button onClick={onOpenTools} className={`${btn} bg-white/15 lg:hidden`}>
              <LayoutGrid className="w-6 h-6" /> Strumenti
            </button>
          </div>
        </div>
      </div>
    )
  }

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
          <button onClick={onTogglePlayPause} className={`${iconBtn} pointer-events-auto`} aria-label={timerRunning ? 'Pausa' : 'Avvia'}>
            {timerRunning ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
          </button>

          <button
            onClick={onExpand}
            // Sfondo pieno semi-opaco, non solo l'ombra: la distanza residua/ora d'arrivo è un
            // dato di sicurezza (rientro prima del buio), non solo un dettaglio — deve restare
            // leggibile anche su una mappa molto chiara sotto sole forte.
            className={`pointer-events-auto flex-1 min-w-0 text-center ${summaryBg} rounded-full px-4 py-2`}
          >
            <span className="font-mono text-[20px] font-bold text-white" style={{ textShadow: TEXT_SHADOW }}>
              {summary}
            </span>
          </button>

          <button onClick={onOpenFoto} className={`${iconBtn} pointer-events-auto`} aria-label="Scatta una foto">
            <Camera className="w-5 h-5" />
          </button>

          {onStop && (
            <button onClick={onStop} className={`${iconBtn} pointer-events-auto bg-red-600/90`} aria-label="Termina">
              <Square className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
