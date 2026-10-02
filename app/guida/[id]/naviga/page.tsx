'use client'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { getPlannedById, refetchPlannedById, type PlannedHike } from '@/lib/plannedStore'
import { effectiveNavPolyline, groupWalkStopsByTappa, splitPolylineByTappaEnds } from '@/lib/borgoWalkPolyline'
import ActiveNavigationView from '@/components/navigation/ActiveNavigationView'
import NavigatorAppPromo from '@/components/navigation/NavigatorAppPromo'
import TappaPicker from '@/components/navigation/TappaPicker'
import type { LocationProviderFactory } from '@/lib/native/locationSource'
import { SimulationLocationProvider } from '@/lib/navigation/simulation/simulationLocationProvider'
import { loadOfflineTappa, saveOfflineTappa, orientedTappa } from '@/lib/cammini/offlineTappa'
import type { PoiItem } from '@/lib/overpass'
import type { CamminoDetail } from '@/app/api/cammini/[id]/route'
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
  // Cammino: la tappa da registrare (?tappa=<ordinale>) con il suo tracciato di catalogo, già nel verso
  // scelto nel piano. Ogni tappa è una sessione a sé e porta il proprio ordinale nell'attività salvata.
  const [camminoTappa, setCamminoTappa] = useState<{ ordinal: number; polyline: [number, number][]; lengthM: number; name: string; pois: PoiItem[] } | null>(null)

  // Dev/testing only (docs/navigation-engine-roadmap.md — Simulation layer): open
  // /guida/<id>/naviga?simulate=off_route (or any name in SCENARIO_NAMES) to drive the whole
  // navigation screen from a scripted GPS scenario instead of the real device. Absent in normal
  // use, so this is entirely inert unless someone deliberately adds the query param.
  const simulateParam = searchParams.get('simulate')
  const scenarioName = isScenarioName(simulateParam) ? simulateParam : null

  // Un Borgo/Città su più giornate — verifica utente ("I borghi contengono varie tappe con
  // percorsi indipendenti... implementare questo sistema in Navigator"): prima d'ora l'unica
  // opzione era ripartire sempre dalla tappa 1, senza poter scegliere direttamente una tappa
  // successiva. groupWalkStopsByTappa/splitPolylineByTappaEnds (lib/borgoWalkPolyline.ts) tornano
  // sempre un solo gruppo/segmento quando non c'è nulla da spezzare (itinerario a tappa unica, o
  // un Sentiero/Sito senza borgoWalkTappaEnds) — safe da chiamare incondizionatamente.
  const tappaGroups = useMemo(
    () => hike ? groupWalkStopsByTappa(hike.borgoWalkStops ?? [], hike.borgoWalkTappaEnds) : [],
    [hike],
  )
  const polylineSegments = useMemo(
    () => hike ? splitPolylineByTappaEnds(hike.routePolyline ?? [], hike.borgoWalkTappaEnds) : [],
    [hike],
  )
  const hasMultipleTappe = tappaGroups.length > 1 && tappaGroups.length === polylineSegments.length
  const tappaParam = searchParams.get('tappa')
  const chosenTappaIndex = tappaParam != null ? Number(tappaParam) - 1 : null
  const needsTappaChoice = hasMultipleTappe
    && (chosenTappaIndex == null || Number.isNaN(chosenTappaIndex) || chosenTappaIndex < 0 || chosenTappaIndex >= tappaGroups.length)

  // La Meta effettivamente passata al motore di navigazione — tagliata alla sola tappa scelta
  // quando ce n'è più di una, così ogni tappa resta un percorso indipendente (route+stop propri,
  // rinumerati da 1 — vedi ActiveNavigationView.tsx's pois), non un'unica sessione continua.
  // borgoWalkTappaEnds azzerato sulla copia tagliata: nessun confine di tappa RESIDUO dentro una
  // sola tappa già isolata (buildTappaEndMoments non troverebbe comunque un match nella polyline
  // più corta, ma è più chiaro renderlo esplicito qui).
  const navigableHike = useMemo(() => {
    if (!hike) return null
    if (hike.metaType === 'cammino' && camminoTappa) {
      return {
        ...hike,
        title: `${hike.title} · ${camminoTappa.name}`,
        routePolyline: camminoTappa.polyline,
        distanceMeters: camminoTappa.lengthM,
        cachedPois: camminoTappa.pois,
      }
    }
    if (!hasMultipleTappe || chosenTappaIndex == null || needsTappaChoice) return hike
    return {
      ...hike,
      routePolyline: polylineSegments[chosenTappaIndex],
      borgoWalkStops: tappaGroups[chosenTappaIndex],
      borgoWalkTappaEnds: undefined,
    }
  }, [hike, hasMultipleTappe, chosenTappaIndex, needsTappaChoice, polylineSegments, tappaGroups, camminoTappa])

  const locationProviderFactory = useMemo<LocationProviderFactory | undefined>(() => {
    if (!scenarioName || !navigableHike?.routePolyline?.length) return undefined
    const fixes = buildScenario(scenarioName, navigableHike.routePolyline)
    return (onFix, onError) => new SimulationLocationProvider({ fixes, speed: 8 }, onFix, onError)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenarioName, navigableHike?.id])

  useEffect(() => {
    let cancelled = false
    setFailure(null)
    getPlannedById(id).then(async (h) => {
      if (cancelled) return
      if (!h) { setFailure('not-found'); return }
      let walkPolyline = effectiveNavPolyline(h)
      if (!walkPolyline?.length) {
        // La copia in cache può essere quella di un attimo prima che l'itinerario a piedi di un
        // Borgo/Città venisse calcolato per la prima volta (GuideReader.tsx aggiorna il proprio
        // stato React — e quindi rende cliccabile "Naviga" — PRIMA di finire di persistere su
        // IndexedDB): un secondo tentativo che salta la cache e va dritto in rete distingue "non
        // ancora calcolato per davvero" da "calcolato un istante fa, la cache non lo sa ancora".
        const fresh = await refetchPlannedById(id)
        if (cancelled) return
        walkPolyline = fresh ? effectiveNavPolyline(fresh) : undefined
        if (fresh && walkPolyline?.length) { h = fresh } else { setFailure('no-route'); return }
      }
      if (h.metaType === 'cammino' && h.camminoPlan) {
        const plan = h.camminoPlan
        const wanted = Number(searchParams.get('tappa'))
        const ordinal = plan.tappe.some(t => t.ordinal === wanted) ? wanted : (plan.tappe[0]?.ordinal ?? 1)
        // Prima la copia locale (salvata con "Scarica per l'offline" o da un'apertura precedente): la tappa
        // parte anche senza rete.
        let local = await loadOfflineTappa(plan.camminoId, ordinal, plan.direction)
        if (!local) {
          try {
            const res = await fetch(`/api/cammini/${encodeURIComponent(plan.camminoId)}`)
            if (!res.ok) throw new Error(String(res.status))
            const detail = (await res.json()) as CamminoDetail
            local = orientedTappa(detail, ordinal, plan.direction)
            if (local) saveOfflineTappa(local)
          } catch { local = null }
        }
        if (!local) { if (!cancelled) setFailure('no-route'); return }
        if (cancelled) return
        setCamminoTappa({ ordinal, polyline: local.polyline, lengthM: local.lengthM, name: local.name, pois: local.pois })
      }
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

  if (!hike || !navigableHike) {
    return <div className="fixed inset-0 flex items-center justify-center bg-slate-900 text-white">Caricamento…</div>
  }

  if (needsTappaChoice) {
    return (
      <TappaPicker
        title={hike.title}
        tappaGroups={tappaGroups}
        onPick={(i) => router.replace(`/guida/${encodeURIComponent(id)}/naviga?tappa=${i + 1}`)}
        onCancel={() => router.push(`/guida/${encodeURIComponent(id)}`)}
      />
    )
  }

  return (
    <ActiveNavigationView
      hike={navigableHike}
      tappaOrdinal={hike.metaType === 'cammino' ? camminoTappa?.ordinal : undefined}
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
