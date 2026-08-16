'use client'
import { useState } from 'react'
import { ShieldCheck, ShieldAlert, ShieldQuestion } from 'lucide-react'
import Sheet from '@/components/ui/Sheet'
import type { TrailConfidenceResult } from '@/lib/navigation/trailConfidence'

interface Props {
  confidence: TrailConfidenceResult | null
}

const LABEL_STYLE: Record<TrailConfidenceResult['label'], { bg: string; text: string; icon: typeof ShieldCheck; word: string }> = {
  alta:  { bg: 'bg-emerald-600', text: 'text-white', icon: ShieldCheck,   word: 'Affidabilità alta' },
  media: { bg: 'bg-amber-500',   text: 'text-white', icon: ShieldQuestion, word: 'Affidabilità media' },
  bassa: { bg: 'bg-red-600',     text: 'text-white', icon: ShieldAlert,   word: 'Affidabilità bassa' },
}

/**
 * Fase 8 (seguito) di docs/navigator-orizzonti-roadmap.md — prima superficie UI per
 * computeTrailConfidence(). Un solo badge per l'intera escursione (non un overlay per
 * segmento sulla mappa, vedi useTrailConfidence.ts per il perché), nascosto finché il primo
 * calcolo non arriva — nessun placeholder "in caricamento" che occuperebbe spazio per un
 * dato non essenziale alla navigazione.
 */
export default function TrailConfidenceBadge({ confidence }: Props) {
  const [open, setOpen] = useState(false)
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

      <Sheet open={open} onClose={() => setOpen(false)} title="Affidabilità del percorso">
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
      </Sheet>
    </>
  )
}
