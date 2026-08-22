'use client'
// Feed personalizzato di 5 percorsi consigliati — batch generato da
// lib/routeBuilder/generateRecommendations.ts (cadenza ibrida: cron settimanale +
// rigenerazione dopo un'escursione completata), letto qui in sola lettura tranne il segnale
// esplicito ♥/✕ per card. Nessuna azione di ricerca propria: per cercare/costruire un percorso su
// misura si passa dal wizard esistente (components/upload/RouteBuilder.tsx).
import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2, MapPin } from 'lucide-react'
import Navbar, { MOBILE_TOPBAR_SPACER } from '@/components/Navbar'
import BackLink from '@/app/components/BackLink'
import { FoundRouteCard, BuiltRouteCard, type FeedbackControls } from '@/components/RouteResultCard'
import { openRecommendationCard } from '@/lib/routeBuilder/openRecommendationCard'
import type { RecommendationCard } from '@/lib/routeBuilder/generateRecommendations'
import type { ScoredCandidate } from '@/lib/routeBuilder/scoreCandidates'
import type { FoundRouteItem } from '@/lib/routeBuilder/foundRoute'

type PageStatus = 'loading' | 'ok' | 'empty_no_location' | 'error' | 'pending'
type FeedbackValue = 'like' | 'dislike' | null

export default function PercorsiPerTePage() {
  return (
    <Suspense fallback={null}>
      <PercorsiPerTePageInner />
    </Suspense>
  )
}

// useSearchParams (per ?focus=, arrivo da una card di Bacheca) richiede un confine Suspense
// intorno al componente che la chiama — stesso pattern di app/upload/page.tsx.
function PercorsiPerTePageInner() {
  const router = useRouter()
  // ?focus=<id> — arrivo da una card di "Percorsi suggeriti" in Bacheca (app/bacheca/page.tsx):
  // porta dritti su QUESTA card specifica invece di lasciare l'utente a cercarla di nuovo in cima
  // a una lista di 5.
  const focusCardId = useSearchParams().get('focus')
  const [status, setStatus] = useState<PageStatus>('loading')
  const [cards, setCards] = useState<RecommendationCard[]>([])
  const [feedback, setFeedback] = useState<Record<string, FeedbackValue>>({})
  const [errorMsg, setErrorMsg] = useState('')
  const [openingId, setOpeningId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    // 'pending' (tetto morbido della rigenerazione in-request scaduto senza una riga precedente da
    // mostrare, vedi app/api/percorsi-per-te/route.ts) si ritenta UNA sola volta dopo una pausa breve
    // — il calcolo abbandonato prosegue comunque lato server e scrive la riga a breve, non serve
    // fare aspettare l'utente su un loader indefinito né mostrargli un falso "nessun percorso".
    let retried = false

    function load() {
      fetch('/api/percorsi-per-te')
        .then(res => (res.ok ? res.json() : Promise.reject(new Error(`Errore ${res.status}`))))
        .then(data => {
          if (cancelled) return
          if (data.status === 'empty_no_location') { setStatus('empty_no_location'); return }
          if (data.status === 'pending') {
            if (!retried) {
              retried = true
              setTimeout(() => { if (!cancelled) load() }, 5000)
              return
            }
            setStatus('pending')
            return
          }
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
    }

    load()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!focusCardId || status !== 'ok') return
    document.getElementById(`reco-card-${focusCardId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [focusCardId, status])

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
      const hikeId = await openRecommendationCard(card)
      router.push(`/guida/${encodeURIComponent(hikeId)}`)
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

        {status === 'pending' && (
          <div className="bg-white rounded-2xl border border-stone-200 p-5 text-center space-y-2">
            <Loader2 className="w-5 h-5 mx-auto text-stone-300 animate-spin" />
            <p className="text-sm text-stone-600">
              Stiamo ancora preparando i tuoi consigli — torna tra poco, non serve fare nulla.
            </p>
          </div>
        )}

        {status === 'ok' && cards.length === 0 && (
          <div className="bg-white rounded-2xl border border-stone-200 p-5 text-sm text-stone-600">
            Nessun percorso disponibile per ora nella tua zona — riprova dopo la prossima escursione.
          </div>
        )}

        {status === 'ok' && cards.length > 0 && (
          <div className="space-y-3">
            {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}
            {cards.map((card) => {
              const controls: FeedbackControls = {
                value: feedback[card.id] ?? null,
                onLike: () => setCardFeedback(card.id, 'like'),
                onDislike: () => setCardFeedback(card.id, 'dislike'),
              }
              const isFocused = focusCardId === card.id
              return (
                <div
                  key={card.id}
                  id={`reco-card-${card.id}`}
                  className={isFocused ? 'rounded-2xl ring-2 ring-terra-400 ring-offset-2 ring-offset-stone-50' : undefined}
                >
                  {card.kind === 'found' ? (
                    <FoundRouteCard data={card.data as FoundRouteItem} onChoose={() => handleOpen(card)} feedback={controls} />
                  ) : (
                    <BuiltRouteCard data={card.data as ScoredCandidate} onChoose={() => handleOpen(card)} feedback={controls} />
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
