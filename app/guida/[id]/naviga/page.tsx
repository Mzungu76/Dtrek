'use client'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { getPlannedById, type PlannedHike } from '@/lib/plannedStore'
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
  const [notFound, setNotFound] = useState(false)

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
    getPlannedById(id).then((h) => {
      if (cancelled) return
      if (!h || !h.routePolyline?.length) { setNotFound(true); return }
      setHike(h)
    })
    return () => { cancelled = true }
  }, [id])

  if (notFound) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-3 bg-slate-900 text-white p-6 text-center">
        <p>Impossibile avviare la navigazione: percorso non disponibile offline.</p>
        <button onClick={() => router.push(`/guida/${id}`)} className="px-4 py-2 rounded-lg bg-sky-600">Torna al percorso</button>
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
