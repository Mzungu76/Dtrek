'use client'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { getPlannedById, type PlannedHike } from '@/lib/plannedStore'
import { effectiveNavPolyline } from '@/lib/borgoWalkPolyline'
import ActiveNavigationView from '@/components/navigation/ActiveNavigationView'
import NavigatorAppPromo from '@/components/navigation/NavigatorAppPromo'
import type { LocationProviderFactory } from '@/lib/native/locationSource'
import { SimulationLocationProvider } from '@/lib/navigation/simulation/simulationLocationProvider'
import { buildScenario, SCENARIO_NAMES, SCENARIO_LABELS, type ScenarioName } from '@/lib/navigation/simulation/presetScenarios'

function isScenarioName(v: string | null): v is ScenarioName {
  return v != null && (SCENARIO_NAMES as readonly string[]).includes(v)
}

function NavigaPageInner() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [hike, setHike] = useState<PlannedHike | null>(null)
  // Due esiti diversi dietro lo stesso vicolo cieco, prima indistinguibili: 'not-found' (nessuna
  // copia locale e la rete non ha risposto — capita quando questa pagina si apre in un contesto
  // che non ha mai visto questo percorso, es. l'app nativa Navigator con la sua cache separata da
  // quella del browser/PWA, vedi lib/navigatorHandoff.ts) vs 'no-route' (il percorso esiste mp non
  // ha ancora un itinerario a piedi calcolato — lo stesso caso già escluso dal bottone "Naviga" per
  // la guida davvero aperta in app/guida/GuidaHub.tsx, ma non rilevabile in anticipo per le altre
  // schede di una galleria). Messaggi e azioni diversi invece di un unico "non disponibile
  // offline" sempre uguale anche quando il device è online e la causa è un'altra.
  const [failure, setFailure] = useState<'not-found' | 'no-route' | null>(null)
  const [retryCount, setRetryCount] = useState(0)

  // Dev/testing only (docs/navigation-engine-roadmap.md — Simulation layer): open
  // /guida/<id>/naviga?simulate=off_route (or any name in SCENARIO_NAMES) to drive the whole
  // navigation screen from a scripted GPS scenario instead of the real device. Absent in normal
  // use, so this is entirely inert unless someone deliberately adds the query param.
  const simulateParam = searchParams.get('simulate')
  const scenarioName = isScenarioName(simulateParam) ? simulateParam : null

  const locationProviderFactory = useMemo<LocationProviderFactory | undefined>(() => {
    if (!scenarioName || !hike?.routePolyline?.length) return undefined
    const fixes = buildScenario(scenarioName, hike.routePolyline)
    return (onFix, onError) => new SimulationLocationProvider({ fixes, speed: 8 }, onFix, onError)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenarioName, hike?.id])

  useEffect(() => {
    let cancelled = false
    setFailure(null)
    getPlannedById(id).then((h) => {
      if (cancelled) return
      if (!h) { setFailure('not-found'); return }
      const walkPolyline = effectiveNavPolyline(h)
      if (!walkPolyline?.length) { setFailure('no-route'); return }
      setHike(h.routePolyline?.length ? h : { ...h, routePolyline: walkPolyline })
    })
    return () => { cancelled = true }
  }, [id, retryCount])

  if (failure) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-3 bg-slate-900 text-white p-6 text-center">
        <p>
          {failure === 'no-route'
            ? "L'itinerario a piedi di questo percorso non è ancora pronto — riprova tra qualche istante."
            : 'Impossibile avviare la navigazione: percorso non disponibile offline e nessuna connessione per scaricarlo ora.'}
        </p>
        <div className="flex gap-2">
          <button onClick={() => setRetryCount((n) => n + 1)} className="px-4 py-2 rounded-lg bg-sky-600">Riprova</button>
          <button onClick={() => router.push(`/guida/${id}`)} className="px-4 py-2 rounded-lg bg-slate-700">Torna al percorso</button>
        </div>
      </div>
    )
  }

  if (!hike) {
    return <div className="fixed inset-0 flex items-center justify-center bg-slate-900 text-white">Caricamento…</div>
  }

  return (
    <ActiveNavigationView
      hike={hike}
      locationProviderFactory={locationProviderFactory}
      simulationLabel={scenarioName ? SCENARIO_LABELS[scenarioName] : undefined}
    />
  )
}

export default function NavigaPage() {
  return (
    <Suspense fallback={<div className="fixed inset-0 flex items-center justify-center bg-slate-900 text-white">Caricamento…</div>}>
      <NavigaPageInner />
      <NavigatorAppPromo />
    </Suspense>
  )
}
