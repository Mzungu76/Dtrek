'use client'
// Feed personalizzato di 5 percorsi consigliati — batch generato da
// lib/routeBuilder/generateRecommendations.ts (cadenza ibrida: cron settimanale +
// rigenerazione dopo un'escursione completata), letto qui in sola lettura tranne il segnale
// esplicito ♥/✕ per card. Nessuna azione di ricerca propria: per cercare/costruire un percorso su
// misura si passa dal wizard esistente (components/upload/RouteBuilder.tsx).
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, MapPin } from 'lucide-react'
import Navbar, { MOBILE_TOPBAR_SPACER } from '@/components/Navbar'
import BackLink from '@/app/components/BackLink'
import { FoundRouteCard, BuiltRouteCard, type FeedbackControls } from '@/components/RouteResultCard'
import { useCandidateScores } from '@/lib/routeBuilder/useCandidateScores'
import { buildHikeFromBuilt, buildHikeFromFound, enrichWithPois } from '@/lib/routeBuilder/buildHikeFromCandidate'
import { savePlanned } from '@/lib/plannedStore'
import { computeCtsForHike } from '@/lib/computeCtsForHike'
import { computeSafetyForHike } from '@/lib/computeSafetyForHike'
import { defaultPendingExpiresAt } from '@/components/upload/sharedHelpers'
import { routeTypeLabel } from '@/lib/routeBuilder/loopBuilder'
import type { RecommendationCard } from '@/lib/routeBuilder/generateRecommendations'
import type { ScoredCandidate } from '@/lib/routeBuilder/scoreCandidates'
import type { FoundRouteItem } from '@/lib/routeBuilder/foundRoute'

type PageStatus = 'loading' | 'ok' | 'empty_no_location' | 'error'
type FeedbackValue = 'like' | 'dislike' | null

export default function PercorsiPerTePage() {
  const router = useRouter()
  const [status, setStatus] = useState<PageStatus>('loading')
  const [cards, setCards] = useState<RecommendationCard[]>([])
  const [feedback, setFeedback] = useState<Record<string, FeedbackValue>>({})
  const [errorMsg, setErrorMsg] = useState('')
  const [openingId, setOpeningId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/percorsi-per-te')
      .then(res => (res.ok ? res.json() : Promise.reject(new Error(`Errore ${res.status}`))))
      .then(data => {
        if (cancelled) return
        if (data.status === 'empty_no_location') { setStatus('empty_no_location'); return }
        setCards(data.cards ?? [])
        const fb: Record<string, FeedbackValue> = {}
        for (const [id, v] of Object.entries((data.feedback ?? {}) as Record<string, { value?: FeedbackValue }>)) {
          fb[id] = v?.value ?? null
        }
        setFeedback(fb)
        setStatus('ok')
      })
      .catch(() => {
        if (cancelled) return
        setStatus('error')
        setErrorMsg('Non è stato possibile caricare i percorsi consigliati, riprova.')
      })
    return () => { cancelled = true }
  }, [])

  // Memoizzato sull'identità di `cards` (vedi il contratto di useCandidateScores) — un .map()
  // inline non memoizzato rifarebbe ripartire il calcolo dei punteggi ad ogni render.
  const hikesForScore = useMemo(
    () => cards.map(c => (c.kind === 'built' ? (c.data as ScoredCandidate) : (c.data as FoundRouteItem).track)),
    [cards],
  )
  const scores = useCandidateScores(hikesForScore)

  async function setCardFeedback(cardId: string, value: 'like' | 'dislike') {
    // Ri-toccare lo stesso valore lo azzera (mi piace → mi piace = "annulla"), invece di un
    // interruttore che resta sempre acceso una volta scelto.
    const next: FeedbackValue = feedback[cardId] === value ? null : value
    setFeedback(prev => ({ ...prev, [cardId]: next }))
    try {
      await fetch('/api/percorsi-per-te/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardId, value: next }),
      })
    } catch {
      // Segnale non critico — se la scrittura fallisce lo stato locale resta comunque coerente con
      // l'ultimo tocco dell'utente, si perde solo la persistenza per questa sessione.
    }
  }

  async function handleOpen(card: RecommendationCard) {
    if (openingId) return
    setOpeningId(card.id)
    setErrorMsg('')
    try {
      const pendingExpiresAt = await defaultPendingExpiresAt()
      const hike = card.kind === 'built'
        ? buildHikeFromBuilt(card.data as ScoredCandidate, `${routeTypeLabel((card.data as ScoredCandidate).type)} per te`, '', pendingExpiresAt)
        : buildHikeFromFound(card.data as FoundRouteItem, (card.data as FoundRouteItem).name, '', pendingExpiresAt)
      await enrichWithPois(hike)
      await savePlanned(hike)
      computeCtsForHike(hike).catch(() => {})
      computeSafetyForHike(hike).catch(() => {})
      router.push(`/guida/${encodeURIComponent(hike.id)}`)
    } catch (e) {
      setErrorMsg(`Errore nel salvataggio: ${e instanceof Error ? e.message : String(e)}`)
      setOpeningId(null)
    }
  }

  return (
    <div className={`min-h-screen bg-stone-50 md:pb-8 ${MOBILE_TOPBAR_SPACER}`}>
      <Navbar />
      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        <BackLink className="inline-flex items-center gap-1 text-sm text-stone-400 hover:text-stone-600 transition mb-1" />
        <div className="mb-2">
          <h1 className="font-display text-2xl font-bold text-forest-900 mb-1">Percorsi per te</h1>
          <p className="text-stone-400 text-sm">
            Scelti in base a dove cammini di solito e a cosa preferisci — si aggiornano ogni settimana o dopo una nuova escursione.
          </p>
        </div>

        {status === 'loading' && (
          <div className="flex items-center justify-center py-16 text-stone-400">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        )}

        {status === 'empty_no_location' && (
          <div className="bg-white rounded-2xl border border-stone-200 p-5 text-center space-y-2">
            <MapPin className="w-6 h-6 mx-auto text-stone-300" />
            <p className="text-sm text-stone-600">
              Completa la tua prima escursione, o imposta un indirizzo di partenza nel profilo, per ricevere consigli personalizzati.
            </p>
          </div>
        )}

        {status === 'error' && (
          <div className="bg-white rounded-2xl border border-stone-200 p-5 text-sm text-red-600">{errorMsg}</div>
        )}

        {status === 'ok' && cards.length === 0 && (
          <div className="bg-white rounded-2xl border border-stone-200 p-5 text-sm text-stone-600">
            Nessun percorso disponibile per ora nella tua zona — riprova dopo la prossima escursione.
          </div>
        )}

        {status === 'ok' && cards.length > 0 && (
          <div className="space-y-3">
            {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}
            {cards.map((card, i) => {
              const controls: FeedbackControls = {
                value: feedback[card.id] ?? null,
                onLike: () => setCardFeedback(card.id, 'like'),
                onDislike: () => setCardFeedback(card.id, 'dislike'),
              }
              return card.kind === 'found'
                ? (
                  <FoundRouteCard
                    key={card.id} data={card.data as FoundRouteItem} scorePreview={scores[i]}
                    onChoose={() => handleOpen(card)} feedback={controls}
                  />
                ) : (
                  <BuiltRouteCard
                    key={card.id} data={card.data as ScoredCandidate} scorePreview={scores[i]}
                    onChoose={() => handleOpen(card)} feedback={controls}
                  />
                )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
