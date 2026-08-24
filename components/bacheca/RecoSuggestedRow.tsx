import Link from 'next/link'
import { Sparkles, Heart } from 'lucide-react'
import RouteThumb from '@/components/RouteThumb'
import type { RecommendationCard } from '@/lib/routeBuilder/generateRecommendations'
import { recoCardSummary } from '@/lib/routeBuilder/recoCardSummary'

/**
 * Riga scorrevole di "Percorsi suggeriti" — stessa card compatta usata in app/bacheca/page.tsx,
 * estratta qui perché Fase 5 di docs/diario-fulcro-piano.md la riusa anche come intermezzo dentro
 * "Dentro un Diario" (app/diari/[id]/page.tsx): stesso motore (generateRecommendations.ts), stessa
 * UI, un solo posto dove viene disegnata invece di due copie della stessa card.
 */
export default function RecoSuggestedRow({ cards }: { cards: RecommendationCard[] }) {
  return (
    <div className="flex gap-2.5 overflow-x-auto pb-1 -mx-4 px-4" style={{ scrollbarWidth: 'none' }}>
      {cards.map(card => {
        const s = recoCardSummary(card)
        return (
          // Porta alla card vera in "Percorsi per te" invece di salvare direttamente tra i
          // pianificati — un percorso "consigliato" è ancora una proposta da valutare (mappa,
          // descrizione, verdetto comfort), non una scelta già fatta.
          <Link
            key={card.id}
            href={`/percorsi-per-te?focus=${encodeURIComponent(card.id)}`}
            className="shrink-0 w-[170px] flex flex-col bg-white border border-stone-200 rounded-2xl overflow-hidden shadow-sm text-left"
          >
            <div className="relative h-[90px] shrink-0 bg-gradient-to-b from-forest-50 to-stone-50 bg-topography">
              <div className="absolute inset-3">
                <RouteThumb polyline={s.polyline} color="#2d7a3d" strokeWidth={2.5} />
              </div>
              <div className={`absolute top-2 left-2 max-w-[calc(100%-16px)] flex items-center gap-1 px-2 py-0.5 rounded-full text-white text-[9px] font-semibold uppercase tracking-wide ${s.isRevisit ? 'bg-forest-600/90' : 'bg-terra-600/90'}`}>
                {s.isRevisit ? <Heart className="w-2.5 h-2.5 shrink-0" fill="currentColor" /> : <Sparkles className="w-2.5 h-2.5 shrink-0" />}
                <span className="truncate">{s.isRevisit ? 'Preferito' : (s.reasonTag ?? 'Consigliato')}</span>
              </div>
            </div>
            <div className="p-2.5 min-w-0">
              <p className="text-[12.5px] font-semibold text-stone-800 leading-snug line-clamp-2">{s.title}</p>
              <p className="text-[11px] text-stone-400 mt-1">
                {(s.distanceMeters / 1000).toFixed(1)} km · {s.hasElevation ? '' : '~'}+{Math.round(s.elevationGain)} m
              </p>
            </div>
          </Link>
        )
      })}
    </div>
  )
}
