'use client'

import { useEffect, useState } from 'react'
import { X, ArrowLeft, ChevronRight, Loader2, Landmark } from 'lucide-react'
import GuideReader from './GuideReader'
import SitoInfoWidget from './widgets/SitoInfoWidget'
import PlaceDescriptionWidget from './widgets/PlaceDescriptionWidget'
import { getPlannedById, type PlannedHike } from '@/lib/plannedStore'
import { useHasAiAccess } from '@/app/guida/useHasAiAccess'
import { SITE_TYPE_CONFIG, inferSiteTypeFromName } from '@/lib/metaTypes'
import type { PlaceDetail } from '@/app/api/places/[id]/route'

interface Props {
  /** id della Guida di Sito da mostrare — nested o autonoma, indifferentemente. */
  siteId: string
  onClose: () => void
}

/**
 * Opzione B (docs/piano-mete-multitipologia.md §51.4, mockup 2026-09-27): la Guida di un Sito si
 * apre SOPRA quella del Borgo/Città, mai sostituendola — nessuna navigazione, nessun cambio di
 * route, la Guida del Borgo resta montata sotto per tutto il tempo. Due stadi:
 *
 * 1. Foglio compatto — anteprima con dati reali (foto, orari/biglietti via SitoInfoWidget,
 *    descrizione via PlaceDescriptionWidget) e un solo modo di uscirne: chiuderlo (si torna
 *    esattamente al Borgo) o "Apri come Guida completa".
 * 2. Guida completa — il VERO GuideReader (stesso componente usato da /guida/[id]), montato qui
 *    a schermo intero invece che su un'altra pagina: niente route separata, quindi nessuna
 *    dipendenza dall'array lista/dettaglio di GuidaHub/RouteHub che aveva causato il bug del
 *    2026-09-27 ("la guida non si apre, si va da un'altra parte").
 *
 * GuideReader non ha bisogno di nient'altro oltre a queste poche prop (hike/onHikeUpdate/
 * enrichmentReady/hasAiAccess/aiUnavailable/trialExpired sono le uniche obbligatorie — verificato
 * sulla sua stessa interface) — CTS/Safety/DTM/terreno/distanza in auto sono tutti opzionali e
 * comunque irrilevanti per un Sito (mai idoneo alle metriche escursionistiche, lib/
 * guideCardVariant.ts's metaEligibleForHikingScores). Nessun bisogno di replicare l'intera
 * orchestrazione di GuidaHub, che in più porta con sé l'intera lista sfogliabile — esattamente
 * ciò che qui va evitato.
 */
export default function SiteGuideOverlay({ siteId, onClose }: Props) {
  const [hike, setHike] = useState<PlannedHike | null>(null)
  const [placeDetail, setPlaceDetail] = useState<PlaceDetail | null>(null)
  const [full, setFull] = useState(false)
  const { hasAiAccess, aiUnavailable, trialExpired } = useHasAiAccess()

  useEffect(() => {
    let cancelled = false
    setHike(null)
    setFull(false)
    getPlannedById(siteId).then(h => { if (!cancelled) setHike(h) }).catch(() => {})
    return () => { cancelled = true }
  }, [siteId])

  useEffect(() => {
    if (!hike?.placeId) { setPlaceDetail(null); return }
    let cancelled = false
    fetch(`/api/places/${hike.placeId}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (!cancelled && data) setPlaceDetail(data as PlaceDetail) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [hike?.placeId])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // ── Guida completa — sostituisce il foglio, non la pagina ──────────────────────────────────
  if (full && hike) {
    return (
      <div className="fixed inset-0 z-[95] bg-[#fdfcfa] overflow-y-auto print:hidden">
        <button
          onClick={onClose}
          className="fixed top-4 left-4 z-[96] inline-flex items-center gap-1.5 bg-white/90 backdrop-blur-sm shadow-sm border border-stone-200 rounded-full pl-2.5 pr-3.5 py-1.5 text-[12.5px] font-semibold text-stone-700 hover:bg-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Torna al Borgo
        </button>
        <GuideReader
          hike={hike}
          onHikeUpdate={patch => setHike(prev => prev ? { ...prev, ...patch } : prev)}
          enrichmentReady={hike.metaType !== 'sentiero'}
          hasAiAccess={hasAiAccess}
          aiUnavailable={aiUnavailable}
          trialExpired={trialExpired}
        />
      </div>
    )
  }

  // ── Foglio compatto (anteprima) ──────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-[95] bg-black/50 flex items-end sm:items-center justify-center print:hidden" onClick={onClose}>
      <div
        className="w-full sm:max-w-lg sm:rounded-2xl bg-white max-h-[85vh] flex flex-col overflow-hidden rounded-t-2xl"
        onClick={e => e.stopPropagation()}
      >
        {!hike ? (
          <div className="flex items-center justify-center p-16">
            <Loader2 className="w-6 h-6 animate-spin text-terra-600" />
          </div>
        ) : (
          <SiteSheetContent hike={hike} placeDetail={placeDetail} onClose={onClose} onOpenFull={() => setFull(true)} />
        )}
      </div>
    </div>
  )
}

function SiteSheetContent({
  hike, placeDetail, onClose, onOpenFull,
}: {
  hike: PlannedHike
  placeDetail: PlaceDetail | null
  onClose: () => void
  onOpenFull: () => void
}) {
  const siteType = inferSiteTypeFromName(hike.title, hike.siteType)
  const categoryLabel = siteType ? SITE_TYPE_CONFIG[siteType]?.label : undefined
  const CategoryIcon = siteType ? SITE_TYPE_CONFIG[siteType]?.icon ?? Landmark : Landmark
  const description = placeDetail?.description ?? placeDetail?.wikipedia?.extract

  return (
    <>
      <div className="relative shrink-0">
        {placeDetail?.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- foto dell'archivio/Wikipedia, mai copiata sui nostri server
          <img src={placeDetail.imageUrl} alt="" className="w-full h-36 object-cover" />
        ) : (
          <div className="w-full h-36 flex items-center justify-center" style={{ background: 'linear-gradient(180deg,#f2cd9d,#e08d3c)' }}>
            <CategoryIcon className="w-9 h-9 text-terra-700 opacity-60" />
          </div>
        )}
        <button onClick={onClose} className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/90 flex items-center justify-center text-stone-500 hover:text-stone-700" aria-label="Chiudi">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="px-5 pt-4">
          <h3 className="font-display text-lg font-semibold text-stone-800 leading-tight">{hike.title}</h3>
          {categoryLabel && (
            <p className="font-barlow uppercase tracking-wide text-[10.5px] text-stone-400 mt-1">{categoryLabel}</p>
          )}
        </div>

        <SitoInfoWidget
          openingHours={typeof placeDetail?.openingHours === 'string' ? placeDetail.openingHours : null}
          officialLink={placeDetail?.officialUrl ?? placeDetail?.website ?? null}
          wikipediaUrl={placeDetail?.wikipedia?.url}
          address={placeDetail?.address}
          phone={placeDetail?.phone}
          email={placeDetail?.email}
        />

        {description && (
          <div className="px-5 py-4">
            <p className="font-barlow font-bold uppercase tracking-wide text-[10px] text-stone-400 mb-2">Il sito</p>
            <PlaceDescriptionWidget text={description} wikipediaUrl={!placeDetail?.description ? placeDetail?.wikipedia?.url : undefined} />
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-stone-200 px-5 py-3">
        <button
          onClick={onOpenFull}
          className="w-full flex items-center justify-center gap-1.5 text-[13px] font-bold text-terra-700 hover:text-terra-800 py-1.5"
        >
          Apri come Guida completa <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </>
  )
}
