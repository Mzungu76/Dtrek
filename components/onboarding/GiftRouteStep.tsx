'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Gift, MapPin, Loader2, ChevronRight, Compass } from 'lucide-react'
import { updateUserSettings } from '@/lib/sync/userSettingsStore'
import { ITALIAN_REGIONS } from '@/lib/italianRegions'
import type { ClaimGiftRouteResult } from '@/lib/giftRoute'

interface Props {
  onDone: () => void
}

type Phase = 'locating' | 'manual' | 'claiming' | 'done'

/**
 * Ultimo passo dopo OnboardingWizard (docs/navigator-dtrek-boundary.md) — prova a geolocalizzare
 * l'utente per regalargli il percorso pianificato della sua regione (solo dati calcolati, niente
 * testo AI, vedi lib/giftRoute.ts) e, contestualmente, a raccogliere la sua regione di casa
 * (home_region su user_settings, P-O5 in UX-AUDIT.md) — il primo segnale geografico usato per
 * mostrare percorsi e POI pertinenti fin dal primo giorno, prima che ci sia uno storico personale.
 * Se il permesso di geolocalizzazione viene negato o il browser non risponde entro pochi secondi,
 * il picker manuale delle regioni diventa la sola via avanti — niente più "Salta" in quella fase,
 * per non perdere il segnale quando è più prezioso — ma resta sempre presente un'opzione neutra
 * ("Preferisco non specificare ora") che non blocca comunque l'utente. Segna gift_route_offered_at
 * indipendentemente dall'esito, così non si ripropone ad ogni accesso.
 */
export default function GiftRouteStep({ onDone }: Props) {
  const [phase, setPhase] = useState<Phase>('locating')
  const [result, setResult] = useState<ClaimGiftRouteResult | null>(null)

  useEffect(() => {
    if (!('geolocation' in navigator)) { setPhase('manual'); return }
    let settled = false
    // Non restare bloccati se il browser non risponde mai al prompt di permesso (alcuni browser
    // desktop non hanno un timeout proprio in quel caso) — passa al picker manuale da solo.
    const fallback = setTimeout(() => { if (!settled) { settled = true; setPhase('manual') } }, 10000)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (settled) return
        settled = true; clearTimeout(fallback)
        void claim({ lat: pos.coords.latitude, lon: pos.coords.longitude })
      },
      () => {
        if (settled) return
        settled = true; clearTimeout(fallback)
        setPhase('manual')
      },
      { timeout: 8000 },
    )
    return () => { settled = true; clearTimeout(fallback) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function claim(body: { region: string } | { lat: number; lon: number }) {
    setPhase('claiming')
    let data: ClaimGiftRouteResult
    try {
      const res = await fetch('/api/gift-route/claim', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      data = res.ok ? await res.json() : { claimed: false, region: 'region' in body ? body.region : '' }
    } catch {
      data = { claimed: false, region: 'region' in body ? body.region : '' }
    }
    setResult(data)
    setPhase('done')
    // homeRegion persiste anche quando non c'è (ancora) un percorso omaggio da regalare per quella
    // regione (data.region è comunque la regione risolta, geo o manuale — vedi claimGiftRoute in
    // lib/giftRoute.ts) — è un dato utile di per sé, non solo un mezzo per il regalo.
    void updateUserSettings({
      giftRouteOfferedAt: new Date().toISOString(),
      ...(data.region ? { homeRegion: data.region } : {}),
    })
  }

  // Unica via per proseguire senza scegliere una regione, quando la geolocalizzazione non l'ha
  // già risolta — una scelta esplicita ("preferisco non specificare"), non un "Salta" a costo
  // zero: il picker manuale (sotto) non ha più un bottone Salta a parte, così il segnale geografico
  // non si perde per semplice disattenzione proprio quando è più prezioso (P-O5 in UX-AUDIT.md).
  function declineRegion() {
    void updateUserSettings({ giftRouteOfferedAt: new Date().toISOString() })
    onDone()
  }

  // "Salta" in alto (visibile solo in 'locating'/'done', mai in 'manual' — vedi sopra) chiamava
  // onDone() direttamente, SENZA mai marcare gift_route_offered_at: se l'utente lo toccava mentre
  // il passo era ancora 'locating' (prima che claim() lo facesse da solo), il flag non veniva mai
  // scritto — OnboardingGate.tsx lo rilegge da user_settings a ogni accesso, quindi il passo si
  // ripresentava a ogni apertura dell'app invece che una sola volta, contraddicendo il commento
  // sopra ("Segna gift_route_offered_at indipendentemente dall'esito"). Nessun effetto quando
  // toccato in fase 'done' (claim() l'ha già scritto lì), solo idempotente.
  function skip() {
    void updateUserSettings({ giftRouteOfferedAt: new Date().toISOString() })
    onDone()
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" />
      <div className="relative w-full sm:max-w-md bg-white rounded-3xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center gap-3 px-6 pt-6 pb-2">
          <div className="w-9 h-9 rounded-full bg-forest-50 border border-forest-200 flex items-center justify-center shrink-0">
            <Gift className="w-4.5 h-4.5 text-forest-600" />
          </div>
          <div className="flex-1" />
          {phase !== 'claiming' && phase !== 'manual' && (
            <button onClick={skip} className="text-xs font-medium text-stone-400 hover:text-stone-600 transition-colors uppercase tracking-wide">
              Salta
            </button>
          )}
        </div>

        <div className="px-6 py-5 overflow-y-auto space-y-4">
          {(phase === 'locating' || phase === 'claiming') && (
            <div className="flex flex-col items-center text-center gap-3 py-8">
              <Loader2 className="w-8 h-8 text-forest-500 animate-spin" />
              <p className="text-sm text-stone-500">
                {phase === 'locating' ? 'Cerchiamo il percorso più vicino a te…' : 'Prepariamo il tuo percorso…'}
              </p>
            </div>
          )}

          {phase === 'manual' && (
            <>
              <div>
                <h2 className="font-display text-lg font-semibold text-stone-800 mb-1">Da dove parti?</h2>
                <p className="text-sm text-stone-500">
                  Ci serve per mostrarti fin da subito percorsi e punti d&apos;interesse della tua zona — e,
                  se disponibile, per regalarti un percorso già pronto della tua regione.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 max-h-[45vh] overflow-y-auto pr-1">
                {ITALIAN_REGIONS.map(r => (
                  <button
                    key={r.slug}
                    onClick={() => claim({ region: r.slug })}
                    className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-stone-200 bg-white hover:border-forest-400 hover:bg-forest-50 text-left transition-colors"
                  >
                    <MapPin className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                    <span className="text-sm text-stone-700">{r.name}</span>
                  </button>
                ))}
              </div>
              <button
                onClick={declineRegion}
                className="w-full text-center text-xs font-medium text-stone-400 hover:text-stone-600 transition-colors py-1"
              >
                Preferisco non specificare ora
              </button>
            </>
          )}

          {phase === 'done' && (
            <div className="flex flex-col items-center text-center gap-3 py-4">
              {result?.claimed ? (
                <>
                  <div className="w-14 h-14 rounded-full bg-forest-50 border border-forest-200 flex items-center justify-center">
                    <Compass className="w-6 h-6 text-forest-600" />
                  </div>
                  <h2 className="font-display text-lg font-semibold text-stone-800">Il tuo primo percorso è pronto!</h2>
                  <p className="text-sm text-stone-500">
                    Un&apos;escursione in {ITALIAN_REGIONS.find(r => r.slug === result.region)?.name ?? 'Italia'}, già pianificata e pronta da esplorare.
                  </p>
                </>
              ) : (
                <>
                  <div className="w-14 h-14 rounded-full bg-stone-50 border border-stone-200 flex items-center justify-center">
                    <Compass className="w-6 h-6 text-stone-400" />
                  </div>
                  <h2 className="font-display text-lg font-semibold text-stone-800">Presto anche nella tua zona</h2>
                  <p className="text-sm text-stone-500">Non abbiamo ancora un percorso pronto per la tua regione — arriverà presto.</p>
                </>
              )}
            </div>
          )}
        </div>

        {phase === 'done' && (
          <div className="px-6 pb-6 pt-2">
            {result?.claimed && result.hikeId ? (
              <Link
                href={`/guida/${encodeURIComponent(result.hikeId)}`}
                onClick={onDone}
                className="w-full flex items-center justify-center gap-2 py-3 bg-forest-600 hover:bg-forest-700 text-white rounded-xl font-semibold transition-colors"
              >
                Vai al percorso <ChevronRight className="w-4 h-4" />
              </Link>
            ) : (
              <button
                onClick={onDone}
                className="w-full flex items-center justify-center gap-2 py-3 bg-forest-600 hover:bg-forest-700 text-white rounded-xl font-semibold transition-colors"
              >
                Inizia a esplorare <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
