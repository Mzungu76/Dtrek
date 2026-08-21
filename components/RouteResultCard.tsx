'use client'
// Card di un percorso risultato — "trovato" (già documentato altrove) o "costruito" (generato
// dall'algoritmo) — estratte da components/upload/RouteBuilder.tsx (erano renderFoundCard/
// renderBuiltCard, chiusure locali) perché anche app/percorsi-per-te/page.tsx le riusa per le
// proprie 5 schede consigliate. `onChoose` assente ⇒ nessun bottone footer di scelta (usato da
// Percorsi per te, che ha "Apri" al posto di "Scegli questo percorso" — passato comunque come
// `onChoose`, l'etichetta resta la stessa: la differenza reale è title/date, non l'azione in sé);
// `feedback` presente ⇒ mostra i bottoni ♥/✕ (solo in Percorsi per te, mai nel wizard).
import { useState } from 'react'
import { Sparkles, TrendingUp, Route, ExternalLink, AlertTriangle, Check, X, Heart, Clock, Box, Repeat } from 'lucide-react'
import TrailPreviewMap from '@/components/TrailPreviewMap'
import { NamedPoiIcon, GroupPoiBadge } from '@/components/PoiIconChip'
import { isSpecificName } from '@/lib/wikipedia'
import { classifyTrackShape } from '@/lib/geoUtils'
import { routeTypeLabel } from '@/lib/routeBuilder/loopBuilder'
import type { ScoredCandidate as BuiltCandidate } from '@/lib/routeBuilder/scoreCandidates'
import type { FoundRouteItem } from '@/lib/routeBuilder/foundRoute'
import type { ProvisionalScore } from '@/lib/routeBuilder/provisionalScore'
import type { PoiItem, PoiType } from '@/lib/overpass'
import { TrailScoreGaugeBadge } from '@/components/TrailScoreGaugeBadge'

export interface FeedbackControls {
  value: 'like' | 'dislike' | null
  onLike: () => void
  onDislike: () => void
}

// Selezione multipla dei risultati (import in blocco) — presente ⇒ il footer mostra un pulsante di
// selezione al posto di "Scegli questo percorso"/onChoose (i due usi si escludono: o si sceglie
// subito un percorso da personalizzare/confermare, o lo si spunta per un import in blocco con i
// valori di default), e il bordo della card si evidenzia quando selezionata.
export interface SelectableControls {
  selected: boolean
  onToggle: () => void
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

// Usata solo dai risultati "trovati" (Esistenti) senza ancora un punteggio provvisorio calcolato —
// per i candidati "costruiti" ("Su misura") vedi ProvisionalScoreBadge sotto, che mostra una stima
// vera invece di un semplice "in attesa".
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

// Stima leggera (lib/routeBuilder/provisionalScore.ts) mostrata su ogni card dei risultati di
// ricerca — MAI il punteggio definitivo (quello arriva solo dopo l'importazione, calcolato con dati
// reali): l'etichetta "Provvisorio" resta sempre visibile per non farla scambiare per quello finale.
// Stesso badge a doppio anello (Sicurezza fuori, TS dentro, numero intero al centro) della copertina
// di un percorso in Guide — vedi components/TrailScoreGaugeBadge.tsx — non più il vecchio anello
// singolo: qui la Sicurezza provvisoria è già disponibile (computeProvisionalScore la calcola
// sempre insieme al TS), quindi non c'è motivo di mostrarne una versione più povera.
export function ProvisionalScoreBadge({ score, size = 52 }: { score: ProvisionalScore; size?: number }) {
  return (
    <div className="shrink-0 flex flex-col items-center gap-1">
      <div className="rounded-2xl bg-stone-900 p-1.5">
        <TrailScoreGaugeBadge total={score.ts} safety={score.safety} size={size} showLabel={false} />
      </div>
      <span className="text-[8px] font-semibold leading-none text-center" style={{ color: score.safety.color }}>{score.safety.label}</span>
      <span className="text-stone-400 text-[7px] leading-none font-medium uppercase tracking-wide">Provvisorio</span>
    </div>
  )
}

// Chip "Vista 3D" in overlay sull'anteprima — stesso stile/icona del chip equivalente in
// RouteMapSection.tsx (mappa di un percorso già salvato), qui su TrailPreviewMap (anteprima 2D di
// un risultato di ricerca, non ancora salvato). `onOpen3D` assente ⇒ nessun chip (uso invariato per
// chi non lo passa, es. app/percorsi-per-te/page.tsx che non ha ancora integrato la vista 3D).
// Esportata: riusata anche dallo step "Conferma" di RouteBuilder.tsx, che mostra la stessa
// TrailPreviewMap del percorso scelto fuori da queste card (una singola anteprima grande, non una
// card intera) ma vuole lo stesso chip.
export function Map3DChip({ onOpen3D }: { onOpen3D: () => void }) {
  return (
    <button onClick={onOpen3D} title="Vista 3D"
      className="absolute top-3 right-3 z-10 flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-semibold bg-black/50 backdrop-blur-md border border-white/15 text-white/90 hover:bg-black/65 transition-colors">
      <Box className="w-3.5 h-3.5" /> 3D
    </button>
  )
}

// Stat "Tipo" delle card risultato — un percorso lineare/solo andata (mai un anello o un
// andata-ritorno già costruito come tale, la cui distanza è già quella completa) può essere
// guardato "come se" fosse andata e ritorno: raddoppia SOLO la cifra mostrata qui sulla card (mai
// il percorso salvato — è un modo di guardare il risultato prima di scegliere, non un dato nuovo),
// per chi ha intenzione di tornare sui propri passi. `onToggle` assente ⇒ etichetta statica, come
// prima (anello, andata-ritorno già completo).
function TipoStat({ label, active, onToggle }: { label: string; active?: boolean; onToggle?: () => void }) {
  if (!onToggle) {
    return (
      <div>
        <span className="font-semibold text-stone-800">{label}</span>
        <p className="text-[10px] uppercase tracking-wide text-stone-400">Tipo</p>
      </div>
    )
  }
  return (
    <button
      onClick={onToggle}
      title="Vedi come andata e ritorno (raddoppia solo la cifra qui sopra, non modifica il percorso)"
      className="text-left"
    >
      <span className={`font-semibold flex items-center gap-1 ${active ? 'text-forest-600' : 'text-stone-800'}`}>
        <Repeat className="w-3 h-3" />{label}
      </span>
      <p className="text-[10px] uppercase tracking-wide text-stone-400">Tipo</p>
    </button>
  )
}

function SelectButton({ selectable }: { selectable: SelectableControls }) {
  return (
    <button onClick={selectable.onToggle}
      className={`shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold uppercase tracking-wide transition-colors border ${
        selectable.selected ? 'bg-forest-500 border-forest-500 text-white' : 'bg-white border-stone-300 text-stone-600'
      }`}>
      {selectable.selected && <Check className="w-3.5 h-3.5" />}
      {selectable.selected ? 'Selezionato' : 'Seleziona'}
    </button>
  )
}

export function FoundRouteCard({ data, onChoose, feedback, selectable, onOpen3D }: {
  data: FoundRouteItem
  onChoose?: () => void
  feedback?: FeedbackControls
  selectable?: SelectableControls
  onOpen3D?: () => void
}) {
  const [roundTrip, setRoundTrip] = useState(false)
  const vs = data.comfortVerdict ? verdictStyle(data.comfortVerdict) : null
  const track = data.track
  // 'linear' (geometria a tratta unica, vedi lib/geoUtils.ts) è l'unico caso ambiguo: un anello o
  // un "andata e ritorno" già rilevato come tale dalla geometria ha senso solo con la propria
  // etichetta, mai un raddoppio (la distanza percorsa è già quella reale).
  const shape = classifyTrackShape(track.routePolyline)
  const isLinear = shape === 'linear'
  const showAsRoundTrip = isLinear && roundTrip
  const displayKm = (track.distanceMeters / 1000) * (showAsRoundTrip ? 2 : 1)
  const tipoLabel = showAsRoundTrip
    ? 'Andata e ritorno'
    : { loop: 'Anello', out_and_back: 'Andata e ritorno', linear: 'Lineare' }[shape]
  return (
    <div className={`bg-white rounded-2xl border overflow-hidden transition-colors ${selectable?.selected ? 'border-forest-500 ring-2 ring-forest-100' : 'border-stone-200'}`}>
      <div className="relative isolate">
        <TrailPreviewMap polyline={track.routePolyline} height="180px" expandable />
        {onOpen3D && <Map3DChip onOpen3D={onOpen3D} />}
      </div>
      <div className="p-4 space-y-2.5">
        {data.isRevisit ? (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-forest-50 text-forest-700">
            <Heart className="w-3 h-3" fill="currentColor" /> Uno dei tuoi preferiti
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-terra-50 text-terra-700">
            <Sparkles className="w-3 h-3" /> Percorso trovato
          </span>
        )}

        <div>
          <h4 className="font-display text-base font-semibold text-stone-800">{data.name}</h4>
          {data.zone && <p className="text-xs text-stone-400 mt-0.5">{data.zone}</p>}
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="flex gap-4 text-sm">
            <div>
              <span className="font-semibold text-stone-800">{displayKm.toFixed(1)} km</span>
              <p className="text-[10px] uppercase tracking-wide text-stone-400">Distanza</p>
            </div>
            {/* Niente Dislivello qui: a differenza della distanza (dalla sola geometria OSM, immediata),
                il dislivello richiede un profilo altimetrico reale (DTM) che a questo stadio della
                ricerca non c'è quasi mai (vedi trackPointsWithFallback in
                lib/routeBuilder/importResultItem.ts) — mostrarlo come stima/dash generava solo
                confusione. Il valore reale arriva dopo l'importazione, quando si arricchisce con
                enrichFoundCandidateForImport. */}
            <TipoStat label={tipoLabel} active={showAsRoundTrip} onToggle={isLinear ? () => setRoundTrip(v => !v) : undefined} />
            {data.difficulty && (
              <div>
                <span className="font-semibold text-stone-800 capitalize">{data.difficulty}</span>
                <p className="text-[10px] uppercase tracking-wide text-stone-400">Difficoltà</p>
              </div>
            )}
          </div>
          {data.provisionalScore ? <ProvisionalScoreBadge score={data.provisionalScore} /> : <ScorePendingBadge />}
        </div>

        {data.pois && data.pois.length > 0 && <PoiPreviewRow pois={data.pois} />}

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
          {selectable ? <SelectButton selectable={selectable} /> : onChoose && (
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

export function BuiltRouteCard({ data, onChoose, feedback, selectable, onOpen3D }: {
  data: BuiltCandidate
  onChoose?: () => void
  feedback?: FeedbackControls
  selectable?: SelectableControls
  onOpen3D?: () => void
}) {
  const [roundTrip, setRoundTrip] = useState(false)
  // Solo 'solo_andata' ha senso da raddoppiare: 'andata_ritorno' è già costruito percorrendo andata
  // e ritorno (distanceM = oneWayM*2, vedi lib/routeBuilder/loopBuilder.ts), 'anello' non torna mai
  // sui propri passi — in entrambi i casi la distanza mostrata è già quella reale.
  const isOneWay = data.type === 'solo_andata'
  const showAsRoundTrip = isOneWay && roundTrip
  const displayKm = (data.distanceMeters / 1000) * (showAsRoundTrip ? 2 : 1)
  // Raddoppio semplice, non salita+discesa: elevationLoss è più esposto al rumore GPS/DTM (piccoli
  // saliscendi che si accumulano) della cifra "Dislivello" già mostrata da sempre — usarla da sola,
  // raddoppiata, resta prevedibile e coerente con la distanza qui sopra.
  const displayElevGain = data.elevationGain * (showAsRoundTrip ? 2 : 1)
  return (
    <div className={`bg-white rounded-2xl border overflow-hidden transition-colors ${selectable?.selected ? 'border-forest-500 ring-2 ring-forest-100' : 'border-stone-200'}`}>
      <div className="relative isolate">
        <TrailPreviewMap polyline={data.routePolyline} height="180px" expandable />
        {onOpen3D && <Map3DChip onOpen3D={onOpen3D} />}
      </div>
      <div className="p-4 space-y-2.5">
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-forest-50 text-forest-700">
          <Route className="w-3 h-3" /> Su misura per te
        </span>

        <div className="flex items-center justify-between gap-3">
          <div className="flex gap-4 text-sm">
            <div>
              <span className="font-semibold text-stone-800">{displayKm.toFixed(1)} km</span>
              <p className="text-[10px] uppercase tracking-wide text-stone-400">Distanza</p>
            </div>
            <div>
              <span className="font-semibold text-stone-800 flex items-center gap-0.5">
                <TrendingUp className="w-3 h-3" />{data.hasElevation ? '' : '~'}{Math.round(displayElevGain)} m
              </span>
              <p className="text-[10px] uppercase tracking-wide text-stone-400">Dislivello{data.hasElevation ? '' : ' (stima)'}</p>
            </div>
            <TipoStat
              label={showAsRoundTrip ? 'Andata e ritorno' : routeTypeLabel(data.type)}
              active={showAsRoundTrip}
              onToggle={isOneWay ? () => setRoundTrip(v => !v) : undefined}
            />
          </div>
          {data.provisionalScore ? <ProvisionalScoreBadge score={data.provisionalScore} /> : <ScorePendingBadge />}
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
          {selectable ? <SelectButton selectable={selectable} /> : onChoose && (
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
