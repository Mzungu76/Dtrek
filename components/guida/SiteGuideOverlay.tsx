'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import GuideReader from './GuideReader'
import SiteGuideSkeleton from './SiteGuideSkeleton'
import { getPlannedById, type PlannedHike } from '@/lib/plannedStore'
import { useHasAiAccess } from '@/app/guida/useHasAiAccess'

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
        />
      )}
    </div>
  )
}
