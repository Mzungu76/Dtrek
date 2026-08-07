'use client'

/**
 * components/video/VideoPresetPicker.tsx — la porta d'ingresso allo studio: prima si sceglie un
 * carattere, poi si aggiusta.
 *
 * Prima lo studio si apriva a stato vuoto (o a quello lasciato dall'ultima sessione) e i preset
 * erano un comando fra tanti nel binario di destra — facili da non notare mai, visto che stavano
 * sotto a "Proporzioni" e "Fluidità". Chi non li trovava componeva il video da zero, un controllo
 * alla volta, senza sapere che sei minuti di lavoro erano già pronti in un tocco.
 *
 * Qui il preset è la PRIMA domanda, non una fra tante: sei schede intere, una per carattere,
 * ciascuna con un paragrafo vero — non c'è una mappa a fianco a cui appoggiarsi, quindi il testo
 * deve bastare da solo a far immaginare il risultato. "Manuale" è un preset come gli altri (stessa
 * meccanica, stesso applyFullPreset in RouteMap3D.tsx) e non un'eccezione: azzera tutto invece di
 * accendere qualcosa, per chi vuole partire da un foglio bianco invece che da un'idea altrui.
 *
 * Qualunque scelta apre lo STESSO studio, mai la generazione diretta: il preset resta un punto di
 * partenza da vedere e aggiustare (formato, dati a schermo, effetti…), non un comando definitivo —
 * lo stesso principio che regge ogni preset dall'inizio di questo file di regia.
 */

import { X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface PresetPickerEntry {
  key: string
  label: string
  desc: string
  long: string
  icon: LucideIcon
}

interface Props {
  title: string
  routeHasPhotos: boolean
  entries: PresetPickerEntry[]
  onChoose: (key: string) => void
  onClose: () => void
}

export default function VideoPresetPicker({ title, routeHasPhotos, entries, onChoose, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-30 bg-stone-50 flex flex-col pointer-events-auto">

      <div className="shrink-0 flex items-center gap-3 px-4 py-2.5 border-b border-stone-200 bg-white">
        <div className="min-w-0 flex-1">
          <p className="text-terra-600 text-[9px] font-bold tracking-[0.16em]">STUDIO VIDEO</p>
          <h2 className="text-stone-900 font-display font-bold text-sm leading-tight truncate">{title}</h2>
        </div>
        <button onClick={onClose} className="shrink-0 text-stone-500 hover:text-stone-900" aria-label="Annulla">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-5 py-6">
          <h1 className="font-display font-bold text-stone-900 text-xl leading-tight">Che video vuoi fare?</h1>
          <p className="text-stone-500 text-[13px] mt-1.5 mb-6 leading-relaxed">
            Ogni preset imposta insieme formato, ritmo, stacchi, dati a schermo ed effetti. Dopo si apre lo studio,
            dove ogni singola voce resta modificabile.
            {!routeHasPhotos && ' Su questo percorso non ci sono ancora foto: si possono aggiungere anche dopo.'}
          </p>

          <div className="space-y-2.5">
            {entries.map(e => {
              const Icon = e.icon
              return (
                <button key={e.key} onClick={() => onChoose(e.key)}
                  className="w-full text-left bg-white border border-stone-200 hover:border-forest-300 hover:bg-forest-50/40 rounded-2xl px-4 py-3.5 flex items-start gap-3.5 transition-colors">
                  <span className="shrink-0 w-10 h-10 rounded-xl bg-stone-100 flex items-center justify-center text-stone-600">
                    <Icon className="w-[18px] h-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2 flex-wrap">
                      <span className="font-display font-bold text-stone-900 text-[15px]">{e.label}</span>
                      <span className="text-stone-400 text-[10.5px] font-mono">{e.desc}</span>
                    </span>
                    <span className="block text-stone-500 text-[12.5px] leading-relaxed mt-1">{e.long}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
