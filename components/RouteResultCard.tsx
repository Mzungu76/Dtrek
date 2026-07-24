'use client'
// Card di un percorso risultato — "trovato" (già documentato altrove) o "costruito" (generato
// dall'algoritmo) — estratte da components/upload/RouteBuilder.tsx (erano renderFoundCard/
// renderBuiltCard, chiusure locali) perché anche app/percorsi-per-te/page.tsx le riusa per le
// proprie 5 schede consigliate. `onChoose` assente ⇒ nessun bottone footer di scelta (usato da
// Percorsi per te, che ha "Apri" al posto di "Scegli questo percorso" — passato comunque come
// `onChoose`, l'etichetta resta la stessa: la differenza reale è title/date, non l'azione in sé);
// `feedback` presente ⇒ mostra i bottoni ♥/✕ (solo in Percorsi per te, mai nel wizard).
import { Sparkles, TrendingUp, Route, ExternalLink, AlertTriangle, Check, X, Heart, Clock } from 'lucide-react'
import TrailPreviewMap from '@/components/TrailPreviewMap'
import { NamedPoiIcon, GroupPoiBadge } from '@/components/PoiIconChip'
import { isSpecificName } from '@/lib/wikipedia'
import { classifyTrackShape } from '@/lib/geoUtils'
import { routeTypeLabel } from '@/lib/routeBuilder/loopBuilder'
import type { ScoredCandidate as BuiltCandidate } from '@/lib/routeBuilder/scoreCandidates'
import type { FoundRouteItem } from '@/lib/routeBuilder/foundRoute'
import type { PoiItem, PoiType } from '@/lib/overpass'

export interface FeedbackControls {
  value: 'like' | 'dislike' | null
  onLike: () => void
  onDislike: () => void
}

function FeedbackButtons({ feedback }: { feedback: FeedbackControls }) {
  return (
    <div className="flex gap-1.5">
      <button
        onClick={feedback.onLike}
        aria-pressed={feedback.value === 'like'}
        aria-label="Mi piace"
        className={`w-8 h-8 rounded-full border flex items-center justify-center transition-colors ${
          feedback.value === 'like' ? 'bg-forest-50 border-forest-500 text-forest-600' : 'bg-white border-stone-300 text-stone-400 hover:border-stone-400'
        }`}
      >
        <Heart className="w-3.5 h-3.5" fill={feedback.value === 'like' ? 'currentColor' : 'none'} />
      </button>
      <button
        onClick={feedback.onDislike}
        aria-pressed={feedback.value === 'dislike'}
        aria-label="Non fa per me"
        className={`w-8 h-8 rounded-full border flex items-center justify-center transition-colors ${
          feedback.value === 'dislike' ? 'bg-terra-50 border-terra-500 text-terra-600' : 'bg-white border-stone-300 text-stone-400 hover:border-stone-400'
        }`}
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

// Esportata: riusata anche dallo step "Conferma" di RouteBuilder.tsx per lo stesso badge di
// verdetto (non solo dalle card qui sotto).
export function verdictStyle(v: string) {
  if (v === 'adatto') return { badge: 'bg-forest-50 text-forest-700 border-forest-200', Icon: Check, label: 'Adatto a te' }
  if (v === 'sconsigliato') return { badge: 'bg-red-50 text-red-700 border-red-200', Icon: X, label: 'Sconsigliato per te' }
  return { badge: 'bg-amber-50 text-amber-700 border-amber-200', Icon: AlertTriangle, label: 'Da valutare' }
}

export function PoiPreviewRow({ pois }: { pois: PoiItem[] }) {
  if (pois.length === 0) return null
  const named: PoiItem[] = []
  const groups = new Map<PoiType, PoiItem[]>()
  for (const poi of pois) {
    if (poi.name && isSpecificName(poi.name)) named.push(poi)
    else {
      const arr = groups.get(poi.type)
      if (arr) arr.push(poi)
      else groups.set(poi.type, [poi])
    }
  }
  return (
    <div data-hscroll className="flex gap-2.5 overflow-x-auto pb-1 -mx-1 px-1">
      {named.map(poi => <NamedPoiIcon key={poi.id} poi={poi} highlighted={false} />)}
      {Array.from(groups.entries()).map(([type, ps]) => <GroupPoiBadge key={type} type={type} pois={ps} />)}
    </div>
  )
}

// Al posto del pallino Trail Score/Sicurezza (che richiedeva una seconda chiamata DTM per-candidato,
// vedi lib/routeBuilder/useCandidateScores.ts, rimosso): calcolare quel punteggio per OGNI
// candidato mostrato — anche quelli che l'utente non sceglierà mai — raddoppiava di fatto le
// chiamate DTM già fatte per l'arricchimento dei candidati "Su misura". Il punteggio si vede solo
// dopo l'importazione (pagina guida), quando la quota è reale e il calcolo vale la pena di essere
// fatto una volta sola, per il solo percorso scelto.
export function ScorePendingBadge({ size = 52 }: { size?: number }) {
  return (
    <div
      className="shrink-0 rounded-xl bg-stone-800 flex flex-col items-center justify-center text-center gap-0.5 px-1"
      style={{ width: size, height: size }}
    >
      <Clock className="w-3.5 h-3.5 text-white/60" />
      <span className="text-white/60 text-[8px] leading-tight font-medium">dopo l&apos;import</span>
    </div>
  )
}

export function FoundRouteCard({ data, onChoose, feedback }: {
  data: FoundRouteItem
  onChoose?: () => void
  feedback?: FeedbackControls
}) {
  const vs = data.comfortVerdict ? verdictStyle(data.comfortVerdict) : null
  const track = data.track
  return (
    <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
      <TrailPreviewMap polyline={track.routePolyline} height="180px" />
      <div className="p-4 space-y-2.5">
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-terra-50 text-terra-700">
          <Sparkles className="w-3 h-3" /> Percorso trovato
        </span>

        <div>
          <h4 className="font-display text-base font-semibold text-stone-800">{data.name}</h4>
          {data.zone && <p className="text-xs text-stone-400 mt-0.5">{data.zone}</p>}
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="flex gap-4 text-sm">
            <div>
              <span className="font-semibold text-stone-800">{(track.distanceMeters / 1000).toFixed(1)} km</span>
              <p className="text-[10px] uppercase tracking-wide text-stone-400">Distanza</p>
            </div>
            <div>
              <span className="font-semibold text-stone-800 flex items-center gap-0.5">
                <TrendingUp className="w-3 h-3" />{track.hasElevation ? `${Math.round(track.elevationGain)} m` : '—'}
              </span>
              <p className="text-[10px] uppercase tracking-wide text-stone-400">Dislivello</p>
            </div>
            <div>
              <span className="font-semibold text-stone-800">
                {{ loop: 'Anello', out_and_back: 'Andata e ritorno', linear: 'Lineare' }[classifyTrackShape(track.routePolyline)]}
              </span>
              <p className="text-[10px] uppercase tracking-wide text-stone-400">Tipo</p>
            </div>
            {data.difficulty && (
              <div>
                <span className="font-semibold text-stone-800 capitalize">{data.difficulty}</span>
                <p className="text-[10px] uppercase tracking-wide text-stone-400">Difficoltà</p>
              </div>
            )}
          </div>
          <ScorePendingBadge />
        </div>

        {vs && (
          <div className={`flex items-start gap-2 px-3 py-2 rounded-xl border text-xs ${vs.badge}`}>
            <vs.Icon className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">{vs.label}</p>
              {data.comfortNote && <p className="mt-0.5 opacity-90">{data.comfortNote}</p>}
            </div>
          </div>
        )}

        {data.description && <p className="text-sm text-stone-600 leading-relaxed">{data.description}</p>}

        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-3">
            {data.sourceUrl ? (
              <a href={data.sourceUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-stone-400 hover:text-stone-600 transition-colors">
                <ExternalLink className="w-3 h-3" /> Fonte
              </a>
            ) : <span />}
            {feedback && <FeedbackButtons feedback={feedback} />}
          </div>
          {onChoose && (
            <button onClick={onChoose}
              className="px-4 py-2 rounded-full bg-terra-500 hover:bg-terra-600 text-white text-xs font-semibold uppercase tracking-wide transition-colors">
              {feedback ? 'Apri' : 'Scegli questo percorso'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export function BuiltRouteCard({ data, onChoose, feedback }: {
  data: BuiltCandidate
  onChoose?: () => void
  feedback?: FeedbackControls
}) {
  return (
    <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
      <TrailPreviewMap polyline={data.routePolyline} height="180px" />
      <div className="p-4 space-y-2.5">
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-forest-50 text-forest-700">
          <Route className="w-3 h-3" /> Su misura per te
        </span>

        <div className="flex items-center justify-between gap-3">
          <div className="flex gap-4 text-sm">
            <div>
              <span className="font-semibold text-stone-800">{(data.distanceMeters / 1000).toFixed(1)} km</span>
              <p className="text-[10px] uppercase tracking-wide text-stone-400">Distanza</p>
            </div>
            <div>
              <span className="font-semibold text-stone-800 flex items-center gap-0.5">
                <TrendingUp className="w-3 h-3" />{data.hasElevation ? '' : '~'}{Math.round(data.elevationGain)} m
              </span>
              <p className="text-[10px] uppercase tracking-wide text-stone-400">Dislivello{data.hasElevation ? '' : ' (stima)'}</p>
            </div>
            <div>
              <span className="font-semibold text-stone-800">{routeTypeLabel(data.type)}</span>
              <p className="text-[10px] uppercase tracking-wide text-stone-400">Tipo</p>
            </div>
          </div>
          <ScorePendingBadge />
        </div>

        <PoiPreviewRow pois={data.pois ?? []} />

        {data.matchNote && <p className="text-sm text-stone-600 leading-relaxed">{data.matchNote}</p>}

        {!data.hasElevation && (
          <p className="text-xs text-sky-800 bg-sky-50 border border-sky-100 rounded-lg px-2.5 py-1.5">
            Dislivello stimato — verrà calcolato con precisione e il punteggio affinato quando scegli questo percorso.
          </p>
        )}

        {data.hasSteepSections && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">Presenta tratti ripidi</p>
        )}

        <div className="flex items-center justify-between gap-3 pt-1">
          {feedback ? <FeedbackButtons feedback={feedback} /> : <span />}
          {onChoose && (
            <button onClick={onChoose}
              className={feedback
                ? 'px-4 py-2 rounded-full bg-terra-500 hover:bg-terra-600 text-white text-xs font-semibold uppercase tracking-wide transition-colors'
                : 'w-full py-2.5 rounded-full bg-terra-500 hover:bg-terra-600 text-white text-xs font-semibold uppercase tracking-wide transition-colors'}>
              {feedback ? 'Apri' : 'Scegli questo percorso'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
