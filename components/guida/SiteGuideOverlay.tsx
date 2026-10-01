'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft, Check, MapPin } from 'lucide-react'
import GuideReader from './GuideReader'
import SiteGuideSkeleton from './SiteGuideSkeleton'
import { getPlannedById, type PlannedHike } from '@/lib/plannedStore'
import { useHasAiAccess } from '@/app/guida/useHasAiAccess'
import { canCompleteWithoutTrack } from '@/lib/visitCompletion'
import { useSiteCheckIn } from '@/lib/useSiteCheckIn'
import SiteDiaryPicker from './SiteDiaryPicker'
import SiteUnverifiedPrompt from './SiteUnverifiedPrompt'

interface Props {
  /** id della Guida di Sito da mostrare — nested o autonoma, indifferentemente. */
  siteId: string
  onClose: () => void
}

/**
 * Guida di Sito completa in overlay (piano §51.4, opzione B): il VERO GuideReader (stesso
 * componente usato da /guida/[id]), montato qui sopra la Guida del Borgo/Città invece che su
 * un'altra pagina — nessuna dipendenza dall'array lista/dettaglio di GuidaHub/RouteHub che aveva
 * causato il bug del 2026-09-27 ("la guida non si apre, si va da un'altra parte").
 *
 * Prima aveva anche un proprio foglio di anteprima compatto (foto/orari/descrizione) — tolto
 * (verifica utente 2026-09-28, "le differenze sono talmente poche da non giustificare
 * l'esistenza di entrambe"): quell'anteprima è ora parte di StopSourceSheet.tsx, che già serviva
 * lo stesso scopo per ogni altra tappa. Questo componente fa solo la Guida completa.
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
  const { hasAiAccess, aiUnavailable, trialExpired } = useHasAiAccess()
  // Stesso check-in GPS di app/guida/GuidaHub.tsx (lib/useSiteCheckIn.ts) — qui l'unico Sito
  // possibile è sempre quello aperto, mai una scheda di galleria da risolvere al volo.
  const { busy: checkInBusy, toast: checkInToast, confirmVisit, diaryPrompt, chooseDiary, cancelDiaryPrompt, unverifiedPrompt, acceptUnverified, cancelUnverified } = useSiteCheckIn(
    (refreshed) => setHike(prev => prev && prev.id === refreshed.id ? { ...prev, ...refreshed } : prev),
  )

  useEffect(() => {
    let cancelled = false
    setHike(null)
    getPlannedById(siteId).then(h => { if (!cancelled) setHike(h) }).catch(() => {})
    return () => { cancelled = true }
  }, [siteId])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[95] bg-[#fdfcfa] overflow-y-auto print:hidden">
      <button
        onClick={onClose}
        className="fixed top-4 left-4 z-[96] inline-flex items-center gap-1.5 bg-white/90 backdrop-blur-sm shadow-sm border border-stone-200 rounded-full pl-2.5 pr-3.5 py-1.5 text-[12.5px] font-semibold text-stone-700 hover:bg-white transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Torna al Borgo
      </button>
      {!hike ? (
        <SiteGuideSkeleton />
      ) : (
        <GuideReader
          hike={hike}
          onHikeUpdate={patch => setHike(prev => prev ? { ...prev, ...patch } : prev)}
          enrichmentReady={hike.metaType !== 'sentiero'}
          hasAiAccess={hasAiAccess}
          aiUnavailable={aiUnavailable}
          trialExpired={trialExpired}
          // Mai una traccia GPS per un Sito: niente hasGps/centerPt qui come in GuidaHub.tsx,
          // solo le coordinate copiate in modo durevole da dtrek_places su hike.latitude/longitude.
          weather={
            hike.latitude != null && hike.longitude != null
              ? { lat: hike.latitude, lon: hike.longitude, mode: hike.plannedDate ? 'planned' as const : 'forecast' as const }
              : undefined
          }
        />
      )}
      {hike && canCompleteWithoutTrack(hike.metaType) && (
        <button
          onClick={() => confirmVisit(hike.id, { repeat: !!hike.firstCompletedAt })}
          disabled={checkInBusy}
          className={`fixed z-[96] bottom-[calc(env(safe-area-inset-bottom,0px)+16px)] right-4 flex items-center gap-2 pl-3.5 pr-4 py-2.5 rounded-full text-sm font-semibold shadow-lg transition-transform hover:scale-[1.03] disabled:opacity-70 ${hike.firstCompletedAt ? 'bg-white text-terra-600 border border-terra-300' : 'bg-terra-500 text-white'}`}
        >
          <MapPin className="w-4 h-4" /> {checkInBusy ? 'Verifica posizione…' : hike.firstCompletedAt ? 'Registra un\'altra visita' : 'Conferma la tua visita'}
        </button>
      )}
      <SiteDiaryPicker prompt={diaryPrompt} onChoose={chooseDiary} onCancel={cancelDiaryPrompt} />
      <SiteUnverifiedPrompt prompt={unverifiedPrompt} onAccept={acceptUnverified} onCancel={cancelUnverified} />
      {checkInToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[97] flex items-center gap-2 bg-stone-900 text-white text-[13px] font-semibold px-4 py-2.5 rounded-full shadow-lg animate-in fade-in slide-in-from-top-2 max-w-[calc(100%-2rem)] text-center">
          <Check className={`w-4 h-4 shrink-0 ${checkInToast.ok ? 'text-forest-400' : 'text-amber-400'}`} /> {checkInToast.message}
        </div>
      )}
    </div>
  )
}
