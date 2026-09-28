'use client'
import { MapPin, ChevronRight } from 'lucide-react'
import type { BorgoWalkStop } from '@/lib/borgoWalkPolyline'

interface Props {
  title: string
  /** Uno per tappa, stesso ordine di lib/borgoWalkPolyline.ts's groupWalkStopsByTappa. */
  tappaGroups: BorgoWalkStop[][]
  onPick: (tappaIndex: number) => void
  onCancel: () => void
}

/**
 * Schermata di scelta della tappa, mostrata da app/guida/[id]/naviga prima di avviare la
 * navigazione GPS quando il Borgo/Città ha più tappe — verifica utente ("I borghi contengono
 * varie tappe con percorsi indipendenti... implementare questo sistema in Navigator"): prima
 * d'ora l'unico modo per navigare era ripartire sempre dall'inizio della tappa 1, senza poter
 * scegliere direttamente una tappa successiva (es. il giorno 2 di un cammino su più giornate).
 * Ogni scelta qui produce una sessione di navigazione indipendente, limitata alla sola tappa
 * scelta (route+stop tagliati a monte in naviga/page.tsx) — non la sessione continua con avviso a
 * metà percorso di TappaCompleteDialog, che resta comunque attiva se in futuro qualcuno percorre
 * più tappe di fila senza tornare qui in mezzo.
 */
export default function TappaPicker({ title, tappaGroups, onPick, onCancel }: Props) {
  return (
    <div className="fixed inset-0 flex flex-col bg-slate-900 text-white">
      <div className="px-6 pt-[calc(env(safe-area-inset-top)+24px)] pb-4">
        <button onClick={onCancel} className="text-sm text-slate-400 hover:text-slate-200 mb-3">
          ← Torna al percorso
        </button>
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="text-sm text-slate-400 mt-1">Questo percorso ha più tappe — scegli quella da percorrere ora.</p>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-8 flex flex-col gap-3">
        {tappaGroups.map((stops, i) => (
          <button
            key={i}
            onClick={() => onPick(i)}
            className="flex items-center gap-3 bg-slate-800 hover:bg-slate-700 transition-colors rounded-2xl px-4 py-4 text-left"
          >
            <div className="w-9 h-9 shrink-0 rounded-full bg-sky-600 flex items-center justify-center font-bold text-sm">
              {i + 1}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-[15px]">Tappa {i + 1}</p>
              <p className="text-[13px] text-slate-400 flex items-center gap-1 mt-0.5">
                <MapPin className="w-3.5 h-3.5" /> {stops.length} {stops.length === 1 ? 'punto' : 'punti'}
                {stops[0]?.name && ` · da ${stops[0].name}`}
              </p>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-500 shrink-0" />
          </button>
        ))}
      </div>
    </div>
  )
}
