'use client'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { ShieldCheck, ShieldAlert, ShieldQuestion, X } from 'lucide-react'
import type { TrailConfidenceResult } from '@/lib/navigation/trailConfidence'
import { useModalBackHandler } from '@/lib/navigation/useModalBackHandler'

interface Props {
  confidence: TrailConfidenceResult | null
}

const LABEL_STYLE: Record<TrailConfidenceResult['label'], { bg: string; text: string; icon: typeof ShieldCheck; word: string }> = {
  alta:       { bg: 'bg-emerald-600', text: 'text-white',       icon: ShieldCheck,    word: 'Affidabilità alta' },
  media:      { bg: 'bg-amber-500',   text: 'text-white',       icon: ShieldQuestion, word: 'Affidabilità media' },
  bassa:      { bg: 'bg-red-600',     text: 'text-white',       icon: ShieldAlert,    word: 'Affidabilità bassa' },
  // Grigio neutro, deliberatamente distinto da 'bassa' (rosso): "non sappiamo" non è "rischioso",
  // è l'assenza di qualunque segnale di base (Trail Score/meteo/clima) su cui fondare un giudizio.
  sconosciuta: { bg: 'bg-stone-500', text: 'text-white',        icon: ShieldQuestion, word: 'Affidabilità sconosciuta' },
}

/**
 * Fase 8 (seguito) di docs/navigator-orizzonti-roadmap.md — prima superficie UI per
 * computeTrailConfidence(). Un solo badge per l'intera escursione (non un overlay per
 * segmento sulla mappa, vedi useTrailConfidence.ts per il perché), nascosto finché il primo
 * calcolo non arriva — nessun placeholder "in caricamento" che occuperebbe spazio per un
 * dato non essenziale alla navigazione.
 *
 * Il dettaglio è un popup centrato, non più il Sheet dal basso condiviso — questo badge vive
 * dentro la rotaia azioni (un contenitore posizionato con il proprio z-index, che crea un
 * proprio contesto di stacking), quindi un Sheet ancorato in basso poteva finire coperto da un
 * avviso "fuori percorso" più recente nel DOM anche se dichiarava uno z-index più alto — un
 * popup centrato, portato in document.body, evita il problema alla radice invece di limitarsi
 * a spostarlo altrove sullo schermo.
 */
export default function TrailConfidenceBadge({ confidence }: Props) {
  const [open, setOpen] = useState(false)
  useModalBackHandler(open, () => setOpen(false))
  if (!confidence) return null

  const style = LABEL_STYLE[confidence.label]
  const Icon = style.icon

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title={style.word}
        className={`w-11 h-11 rounded-full flex items-center justify-center shadow-lg border border-white/40 ${style.bg}`}
      >
        <Icon className={`w-5 h-5 ${style.text}`} />
      </button>

      {open && createPortal(
        <div className="fixed inset-0 z-[3000] bg-black/50 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-lg font-semibold text-stone-900">Affidabilità del percorso</h2>
              <button onClick={() => setOpen(false)} className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center text-stone-400 hover:text-stone-600 transition-colors shrink-0" aria-label="Chiudi">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div className={`flex items-center gap-2.5 px-4 py-3 rounded-xl ${style.bg}`}>
                <Icon className={`w-5 h-5 shrink-0 ${style.text}`} />
                <p className={`text-sm font-semibold ${style.text}`}>{style.word}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-1.5">Perché</p>
                <ul className="space-y-1">
                  {confidence.factors.map((f, i) => (
                    <li key={i} className="text-sm text-stone-700 flex items-start gap-1.5">
                      <span className="text-stone-400 mt-1">•</span> {f}
                    </li>
                  ))}
                </ul>
              </div>
              <p className="text-[11px] text-stone-400 leading-relaxed">
                Combina il Trail Score calcolato in pianificazione, le condizioni meteo/clima recenti
                e — quando disponibili — le conferme di altri escursionisti. Non tiene ancora conto
                della qualità del segnale GPS osservata dal vivo né della copertura di rete.
              </p>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
