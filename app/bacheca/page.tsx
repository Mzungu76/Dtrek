'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { Navigation, Sparkles, MapPin, ArrowRight, TrendingUp, Flame, BarChart3, Loader2, Heart, Maximize2 } from 'lucide-react'
import HubNavBar from '@/components/routehub/HubNavBar'
import RouteThumb from '@/components/RouteThumb'
import CuriosityModal from '@/components/bacheca/CuriosityModal'
import TerritoryMap from '@/components/bacheca/TerritoryMap'
import Sheet from '@/components/ui/Sheet'
import { getAllActivities, getActivityById, computeGlobalStats, type ActivityMeta } from '@/lib/blobStore'
import { getAllPlanned, type PlannedHikeMeta } from '@/lib/plannedStore'
import { fetchActivityPhotos, pickBestCoverPhoto } from '@/lib/activityPhotos'
import { useCtsUpdated } from '@/lib/sync/useCtsUpdated'
import { computeStreaks } from '@/lib/stats'
import { computeTrainingLoad, activityStress, currentForm } from '@/lib/trainingLoad'
import { ctsLabel } from '@/lib/trailScore'
import { formatDuration } from '@/lib/tcxParser'
import { openRecommendationCard } from '@/lib/routeBuilder/openRecommendationCard'
import { routeTypeLabel } from '@/lib/routeBuilder/loopBuilder'
import { tryOpenNavigatorApp } from '@/lib/navigatorHandoff'
import { GalleryMapThumb } from '@/components/routehub/BottomGallery'
import type { RecommendationCard } from '@/lib/routeBuilder/generateRecommendations'
import type { ScoredCandidate } from '@/lib/routeBuilder/scoreCandidates'
import type { FoundRouteItem } from '@/lib/routeBuilder/foundRoute'
import type { WikiPage } from '@/lib/wikipedia'
import type { PoiItem } from '@/lib/overpass'

// Riassunto minimo per la card compatta della riga "Percorsi per te" in Home — a differenza di
// app/percorsi-per-te/page.tsx (che mostra FoundRouteCard/BuiltRouteCard per intero, con mappa
// interattiva e badge punteggio) qui serve solo titolo/distanza/dislivello/tracciato per una card
// piccola in riga scorrevole, coerente con lo stile della riga "Curiosità" sopra.
function recoCardSummary(card: RecommendationCard): {
  title: string; polyline: [number, number][]; distanceMeters: number; elevationGain: number; hasElevation: boolean; isRevisit: boolean
  // Perché DTrek propone proprio questo percorso (lib/routeBuilder/generateRecommendations.ts) —
  // assente per una card 'built' (mai prodotta da generateRecommendationsForUser, solo righe
  // storiche precedenti alla rimozione di "Su misura" da questa pipeline, vedi il commento in cima
  // a quel file), ricade sull'etichetta generica nella UI.
  reasonTag?: string
} {
  if (card.kind === 'found') {
    const d = card.data as FoundRouteItem
    return {
      title: d.name, polyline: d.track.routePolyline, distanceMeters: d.track.distanceMeters,
      elevationGain: d.track.elevationGain, hasElevation: d.track.hasElevation, isRevisit: !!d.isRevisit,
      reasonTag: d.reasonTag,
    }
  }
  const d = card.data as ScoredCandidate
  return { title: `${routeTypeLabel(d.type)} per te`, polyline: d.routePolyline, distanceMeters: d.distanceMeters, elevationGain: d.elevationGain, hasElevation: d.hasElevation, isRevisit: false }
}

// Foto del primo POI Wikipedia arricchito di un percorso pianificato — stessa fonte/priorità di
// heroPhotoUrl sotto, riusata qui per le card compatte di "Altre uscite in programma" (sfondo
// invece del solo tracciato, quando disponibile).
function plannedHikePhotoUrl(hike: PlannedHikeMeta): string | null {
  const wiki = hike.cachedPoiWiki as { poi: PoiItem; wiki: WikiPage }[] | undefined
  return wiki?.[0]?.wiki.thumbnail ?? null
}

// Tempo di lettura stimato per una card "Da sapere sui tuoi percorsi" — solo il testo già in cache
// (nessuna nuova chiamata), velocità di lettura media ~200 parole/minuto, sempre almeno 1 minuto.
function estimateReadingMinutes(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.round(words / 200))
}

const FALLBACK_HERO = '/stato-hero-fallback.jpg'
// Stessi valori usati da RouteHub.tsx per le foto di copertina — coerenza visiva quando l'hero
// della Home mostra una foto reale (propria o da un POI Wikipedia) invece del solo tracciato.
const HERO_IMAGE_FILTER = 'saturate(1.25) contrast(1.08) brightness(0.85)'

// Bacheca — Home reale dell'app (redirect di "/", vedi app/page.tsx). Ridisegnata secondo la
// direzione "Opzione D" decisa nell'audit UX (UX-AUDIT.md, P-O5): risponde prima di tutto a "cosa
// faccio oggi" — prossima uscita pianificata in evidenza, non un cruscotto statistico. Le
// statistiche complete restano un tap di distanza (/statistiche, che ha già Panoramica/Andamento/
// Traguardi/Confronto) invece di essere duplicate qui per intero.
//
// "Percorsi per te" — Fase 3 di P-O5: ora una riga di card vere (non più solo un teaser), possibile
// da quando app/api/percorsi-per-te/route.ts si auto-risana da solo su una riga dirty/stale invece
// di dipendere solo dal cron (vedi UX-AUDIT.md §23) — la pipeline dati è affidabile end-to-end.
export default function BachecaPage() {
  const router = useRouter()
  const [activities, setActivities] = useState<ActivityMeta[]>([])
  const [planned, setPlanned] = useState<PlannedHikeMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [recoStatus, setRecoStatus] = useState<'loading' | 'ok' | 'empty_no_location' | 'error' | 'pending'>('loading')
  const [recoCards, setRecoCards] = useState<RecommendationCard[]>([])
  const [openingRecoId, setOpeningRecoId] = useState<string | null>(null)
  const [recoErrorMsg, setRecoErrorMsg] = useState('')
  const [openCuriosity, setOpenCuriosity] = useState<{ routeTitle: string; wiki: WikiPage } | null>(null)

  useEffect(() => {
    // ?peek=1: non innesca mai una generazione — vedi app/api/percorsi-per-te/route.ts. Restituisce
    // comunque le card già pronte (se una riga esiste), solo senza rigenerarle al volo qui: la Home
    // non deve mai aspettare una ricerca Overpass per aprirsi.
    fetch('/api/percorsi-per-te?peek=1')
      .then(res => (res.ok ? res.json() : Promise.reject()))
      .then(data => { setRecoStatus(data.status); setRecoCards(data.cards ?? []) })
      .catch(() => setRecoStatus('error'))
  }, [])

  async function handleOpenReco(card: RecommendationCard) {
    if (openingRecoId) return
    setOpeningRecoId(card.id)
    setRecoErrorMsg('')
    try {
      const hikeId = await openRecommendationCard(card)
      router.push(`/guida/${encodeURIComponent(hikeId)}`)
    } catch (e) {
      setRecoErrorMsg(`Errore nel salvataggio: ${e instanceof Error ? e.message : String(e)}`)
      setOpeningRecoId(null)
    }
  }

  // getAllActivities/getAllPlanned sono cache-first (IndexedDB) e, quando la cache locale ha un
  // buco noto (es. routePolyline mancante su un'entry vecchia — vedi i commenti "self-heal" dentro
  // lib/blobStore.ts e lib/plannedStore.ts), rilanciano in background un refetch dal server e lo
  // scrivono in cache SUBITO ma lo consegnano al chiamante solo tramite onRefresh — altrimenti resta
  // invisibile finché la pagina non viene riaperta da zero. Senza onRefresh qui, la prima apertura di
  // Bacheca su una cache così poteva mostrare l'hero senza mappa/foto finché non si tornava indietro
  // e si rientrava: il fix è semplicemente ascoltare quel callback.
  const loadAll = () => Promise.all([
    getAllActivities(acts => setActivities(acts)),
    getAllPlanned(plans => setPlanned(plans)),
  ]).then(([acts, plans]) => {
    setActivities(acts)
    setPlanned(plans)
  })

  useEffect(() => { loadAll().finally(() => setLoading(false)) }, [])
  useCtsUpdated(() => { loadAll() })

  const streaks = useMemo(() => computeStreaks(activities), [activities])
  const globalStats = useMemo(() => computeGlobalStats(activities), [activities])

  const trainingLoadData = useMemo(() => {
    const events = activities.map(a => ({
      date:   format(new Date(a.startTime), 'yyyy-MM-dd'),
      stress: activityStress(a.distanceMeters, a.elevationGain, a.totalTimeSeconds),
    }))
    return computeTrainingLoad(events, 90)
  }, [activities])
  const latestLoad = trainingLoadData.length > 0 ? trainingLoadData[trainingLoadData.length - 1] : null
  const forma = useMemo(() => currentForm(latestLoad?.tsb ?? 0), [latestLoad])

  const weeklyKm = useMemo(() => {
    const end = new Date()
    const start = new Date(end)
    start.setDate(start.getDate() - 6)
    const wActs = activities.filter(a => { const d = new Date(a.startTime); return d >= start && d <= end })
    return Math.round(wActs.reduce((s, a) => s + a.distanceMeters / 1000, 0) * 10) / 10
  }, [activities])

  // Micro-personalizzazione concreta (non un saluto da chatbot): quante uscite pianificate cadono
  // nei prossimi 14 giorni, su TUTTI i percorsi attivi (non solo i 6 di featuredList) — è un fatto,
  // deve restare vero anche se il conteggio visibile in "Altre uscite in programma" è più corto.
  const UPCOMING_WINDOW_DAYS = 14
  const upcomingCount = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const limit = new Date(today); limit.setDate(limit.getDate() + UPCOMING_WINDOW_DAYS)
    return planned.filter(h => !h.archivedAt && h.plannedDate && new Date(h.plannedDate) >= today && new Date(h.plannedDate) <= limit).length
  }, [planned])

  // Riepilogo ultimi 30 giorni per anticipare un dato reale accanto al link "Statistiche", invece
  // di lasciarlo un link muto — riusa computeGlobalStats già importato, solo su una finestra più
  // corta di `activities` (già in memoria, nessuna nuova chiamata).
  const recentStats = useMemo(() => {
    const limit = new Date(); limit.setDate(limit.getDate() - 30)
    return computeGlobalStats(activities.filter(a => new Date(a.startTime) >= limit))
  }, [activities])

  // "Percorsi in evidenza": l'hero (il primo della lista) più fino a 5 "altre uscite in programma"
  // — un solo percorso "vinceva" per sempre finché non arrivava un'uscita con data ancora più
  // vicina, restando "in evidenza" sempre lo stesso anche quando l'utente aveva più uscite
  // pianificate valide da vedere (richiesta esplicita dell'autore del prodotto). Ordine di
  // priorità, senza mai duplicare lo stesso percorso: (1) uscite con data, dalla più vicina; (2)
  // preferiti (favorite:true) non già inclusi, dal più recente creato; (3) più recenti creati non
  // già inclusi.
  const MAX_FEATURED = 6 // 1 hero + 5 nella riga "Altre uscite in programma"
  const featuredList = useMemo(() => {
    const active = planned.filter(h => !h.archivedAt)
    if (active.length === 0) return []
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const seen = new Set<string>()
    const result: { hike: PlannedHikeMeta; hasDate: boolean }[] = []

    const withDate = active
      .filter(h => h.plannedDate && new Date(h.plannedDate) >= today)
      .sort((a, b) => new Date(a.plannedDate!).getTime() - new Date(b.plannedDate!).getTime())
    for (const h of withDate) {
      if (result.length >= MAX_FEATURED) break
      seen.add(h.id); result.push({ hike: h, hasDate: true })
    }

    const favorites = active
      .filter(h => h.favorite && !seen.has(h.id))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    for (const h of favorites) {
      if (result.length >= MAX_FEATURED) break
      seen.add(h.id); result.push({ hike: h, hasDate: false })
    }

    const recent = active
      .filter(h => !seen.has(h.id))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    for (const h of recent) {
      if (result.length >= MAX_FEATURED) break
      seen.add(h.id); result.push({ hike: h, hasDate: false })
    }

    return result
  }, [planned])
  const featured = featuredList[0] ?? null

  // Fallback quando non c'è (ancora) un percorso pianificato in evidenza: l'ultima escursione già
  // fatta. Serve sia per le curiosità (il suo poiWiki) sia per la foto dell'hero (la sua copertina
  // reale) — catena di fallback descritta in UX-AUDIT.md P-O5. ActivityMeta (già caricata sopra)
  // non porta poiWiki/foto: vanno recuperati a parte.
  const recentActivitiesSorted = useMemo(
    () => activities.slice().sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()),
    [activities],
  )
  const latestActivity = recentActivitiesSorted[0] ?? null
  // Quante uscite già fatte scansionare per estrarre curiosità POI+Wikipedia (oltre al percorso in
  // evidenza e agli altri percorsi pianificati attivi) — vedi curiosityEntries sotto. Non tutte le
  // attività dell'utente: getActivityById è cache-first quindi economico, ma non ha senso scansionare
  // uscite di anni fa per popolare una riga della Home.
  const RECENT_ACTIVITIES_FOR_CURIOSITY = 8
  const recentActivitiesForCuriosity = useMemo(
    () => recentActivitiesSorted.slice(0, RECENT_ACTIVITIES_FOR_CURIOSITY),
    [recentActivitiesSorted],
  )
  const recentActivityIdsKey = recentActivitiesForCuriosity.map(a => a.id).join(',')

  const [latestActivityCover, setLatestActivityCover] = useState<string | null>(null)
  const [activityPoiWikiById, setActivityPoiWikiById] = useState<Record<string, { poi: PoiItem; wiki: WikiPage }[]>>({})

  useEffect(() => {
    if (!latestActivity) { setLatestActivityCover(null); return }
    let cancelled = false
    fetchActivityPhotos(latestActivity.id)
      .then(photos => { if (!cancelled) setLatestActivityCover(pickBestCoverPhoto(photos)?.url ?? null) })
      .catch(() => {})
    return () => { cancelled = true }
    // Volutamente solo l'id: latestActivity è un nuovo oggetto a ogni ricalcolo di activities
    // (lo useMemo sopra), il fetch non deve ripartire finché l'attività più recente resta la stessa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestActivity?.id])

  useEffect(() => {
    if (recentActivitiesForCuriosity.length === 0) { setActivityPoiWikiById({}); return }
    let cancelled = false
    Promise.all(
      recentActivitiesForCuriosity.map(a =>
        getActivityById(a.id)
          .then(full => [a.id, full?.poiWiki ?? []] as const)
          .catch(() => [a.id, []] as const),
      ),
    ).then(pairs => { if (!cancelled) setActivityPoiWikiById(Object.fromEntries(pairs)) })
    return () => { cancelled = true }
    // Volutamente la chiave di soli id, non l'array di attività: recentActivitiesForCuriosity è un
    // nuovo array a ogni ricalcolo di activities, il fetch non deve ripartire finché il set di
    // uscite recenti resta lo stesso.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recentActivityIdsKey])

  // Curiosità storico-culturali dai POI già arricchiti gratis (Overpass + Wikipedia, nessuna
  // chiamata AI — vedi GpxUploader/UrlImportUploader/buildHikeFromCandidate) raccolte SOLO dai
  // percorsi che l'utente vede già in questa stessa Home: il percorso in evidenza e la riga "Altre
  // uscite in programma" (featuredList, fino a MAX_FEATURED) — non più da qualunque percorso
  // pianificato esistesse (anche invisibile qui) né dalle ultime 8 uscite già fatte, per non
  // mostrare informazioni su percorsi con cui l'utente non ha alcun aggancio visivo sulla Home
  // (richiesta esplicita dell'autore del prodotto). Le uscite già fatte restano un ripiego, non una
  // fonte regolare: scattano SOLO quando non c'è alcun percorso pianificato attivo (featuredList
  // vuota), stesso caso limite già gestito per l'hero/la foto (P-O5). Un percorso con più POI
  // arricchiti contribuisce con più di una curiosità (fino a MAX_POI_PER_ROUTE), non solo la prima:
  // fetchWikiForNamedPois (lib/wikipedia.ts) può restituirne fino a 10 per percorso. Deduplicate per
  // pagina Wikipedia (lo stesso POI raggiunto da percorsi diversi non compare due volte).
  // MAX_CURIOSITY_CARDS limita solo la lunghezza della riga scorrevole, non le fonti scansionate.
  const MAX_POI_PER_ROUTE = 4
  const MAX_CURIOSITY_CARDS = 20
  const curiosityEntries = useMemo(() => {
    const entries: { key: string; routeTitle: string; wiki: WikiPage; poi: PoiItem; polyline?: [number, number][] }[] = []
    const seenWiki = new Set<string>()
    const addRoute = (
      title: string | undefined,
      wikiList: { poi: PoiItem; wiki: WikiPage }[] | undefined,
      polyline?: [number, number][],
    ) => {
      if (!title || !wikiList?.length) return
      let addedForThisRoute = 0
      for (const { poi, wiki } of wikiList) {
        if (entries.length >= MAX_CURIOSITY_CARDS || addedForThisRoute >= MAX_POI_PER_ROUTE) return
        if (seenWiki.has(wiki.url)) continue
        seenWiki.add(wiki.url)
        entries.push({ key: wiki.url, routeTitle: title, wiki, poi, polyline })
        addedForThisRoute++
      }
    }
    if (featuredList.length > 0) {
      for (const f of featuredList) {
        addRoute(f.hike.title, f.hike.cachedPoiWiki as { poi: PoiItem; wiki: WikiPage }[] | undefined, f.hike.routePolyline)
      }
    } else {
      for (const a of recentActivitiesForCuriosity) {
        addRoute(a.title, activityPoiWikiById[a.id], a.routePolyline)
      }
    }
    return entries
  }, [featuredList, recentActivitiesForCuriosity, activityPoiWikiById])

  // "Il tuo territorio" — stessi luoghi di "Da sapere sui tuoi percorsi" sopra, riproposti su una
  // mappa invece che in testo: nessun nuovo dato/chiamata, solo le coordinate (dell'articolo
  // Wikipedia quando disponibili, altrimenti del POI OSM sottostante) già presenti in ogni entry.
  const territoryPois = useMemo(
    () => curiosityEntries.map(entry => ({
      key: entry.key,
      lat: entry.wiki.lat ?? entry.poi.lat,
      lon: entry.wiki.lon ?? entry.poi.lon,
      name: entry.wiki.title,
      type: entry.poi.type,
    })),
    [curiosityEntries],
  )
  const [territoryMapOpen, setTerritoryMapOpen] = useState(false)

  // Foto dell'hero: catena di fallback (P-O5) — foto propria (solo per un'escursione già fatta,
  // non ha senso per un percorso ancora da percorrere) → foto del POI Wikipedia → tracciato su
  // sfondo topografico (gestito nel JSX) → immagine generica di fallback.
  // Quarto stato dell'hero, oltre a "prossima uscita pianificata"/"ultima uscita"/"CTA iniziale":
  // quando non c'è nulla di pianificato e l'ultima uscita risale a parecchio, l'hero lo dice
  // esplicitamente invece di mostrare in silenzio la stessa "ultima uscita" di settimane fa come se
  // fosse ancora un contenuto fresco — e capovolge la priorità dei due pulsanti sotto, verso
  // pianificare qualcosa di nuovo piuttosto che rivedere quanto già fatto.
  const DAYS_STALE_THRESHOLD = 14
  const daysSinceLastActivity = latestActivity
    ? Math.floor((Date.now() - new Date(latestActivity.startTime).getTime()) / 86400000)
    : null
  const isStale = !featured && daysSinceLastActivity !== null && daysSinceLastActivity >= DAYS_STALE_THRESHOLD

  const heroPhotoUrl = useMemo(() => {
    if (featured) {
      const wiki = featured.hike.cachedPoiWiki as { poi: PoiItem; wiki: WikiPage }[] | undefined
      return wiki?.[0]?.wiki.thumbnail ?? null
    }
    if (latestActivity) {
      return latestActivityCover ?? activityPoiWikiById[latestActivity.id]?.[0]?.wiki.thumbnail ?? null
    }
    return null
  }, [featured, latestActivity, latestActivityCover, activityPoiWikiById])

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-100">
        <div className="sticky top-0 z-40"><HubNavBar /></div>
        <div className="flex items-center justify-center py-32 text-stone-400 gap-3">
          <Loader2 className="w-6 h-6 animate-spin" /><span>Caricamento…</span>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-stone-100">
      <div className="sticky top-0 z-40"><HubNavBar /></div>

      {/* Hero compatta: prossima uscita pianificata, poi l'ultima uscita fatta, poi il CTA a
          pianificare la prima — mai un solo stato "vuoto" quando esiste comunque qualcosa da
          mostrare. Foto: prima quella vera (propria o da un POI Wikipedia, vedi heroPhotoUrl sopra),
          poi il tracciato su sfondo topografico, poi l'immagine generica di fallback. Quando una
          foto vera è disponibile, il tracciato ci fosse comunque perso (la foto lo sostituisce
          interamente) — una piccola mappa in un angolo lo riporta visibile, sempre, senza
          rinunciare alla foto. */}
      <div className="relative h-[340px] overflow-hidden">
        {heroPhotoUrl ? (
          <img src={heroPhotoUrl} alt="" className="absolute inset-0 w-full h-full object-cover" style={{ filter: HERO_IMAGE_FILTER }} />
        ) : (featured?.hike.routePolyline?.length || latestActivity?.routePolyline?.length) ? (
          <div className="absolute inset-0 bg-gradient-to-b from-forest-50 to-stone-50 bg-topography">
            <div className="absolute inset-6">
              <RouteThumb polyline={(featured?.hike.routePolyline ?? latestActivity?.routePolyline)!} color="#2d7a3d" strokeWidth={3} />
            </div>
          </div>
        ) : (
          <img src={FALLBACK_HERO} alt="" className="absolute inset-0 w-full h-full object-cover" />
        )}
        {heroPhotoUrl && (featured?.hike.routePolyline ?? latestActivity?.routePolyline)?.length ? (
          <div className="absolute top-4 right-4 w-16 h-16 rounded-xl bg-black/45 backdrop-blur-sm border border-white/20 p-2 shadow-lg">
            <RouteThumb polyline={(featured?.hike.routePolyline ?? latestActivity?.routePolyline)!} color="#ffffff" strokeWidth={2} />
          </div>
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-black/40" />

        <div className="absolute left-5 right-5 bottom-5">
          {featured ? (
            <>
              <p className="font-barlow font-extrabold text-[11px] tracking-[2px] uppercase text-terra-300 mb-1">
                {featured.hasDate
                  ? `Prossima uscita · ${format(new Date(featured.hike.plannedDate!), 'EEEE d MMMM', { locale: it })}`
                  : 'Pianificato, senza data ancora'}
              </p>
              <h1 className="font-display font-black text-[28px] text-white leading-tight" style={{ textShadow: '0 2px 10px rgba(0,0,0,0.5)' }}>
                {featured.hike.title}
              </h1>
              <p className="text-[12px] text-white/85 mt-1" style={{ textShadow: '0 1px 6px rgba(0,0,0,0.55)' }}>
                {(featured.hike.distanceMeters / 1000).toFixed(1)} km · +{Math.round(featured.hike.elevationGain)} m
                {featured.hike.estimatedTimeSeconds ? ` · ${formatDuration(featured.hike.estimatedTimeSeconds)}` : ''}
              </p>
              {featured.hike.cachedTrailScore != null && (
                <span
                  className="inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold text-white"
                  style={{ backgroundColor: `${ctsLabel(featured.hike.cachedTrailScore).color}b3` }}
                >
                  TS {Math.round(featured.hike.cachedTrailScore)} · {ctsLabel(featured.hike.cachedTrailScore).label}
                </span>
              )}
              <div className="mt-3 flex items-center gap-2">
                {featured.hasDate ? (
                  // "Naviga" prova prima l'app nativa Navigator, altrimenti ricade sul navigatore
                  // via web — stessa identica azione del bottone "Naviga" dentro la guida di questo
                  // stesso percorso (app/guida/GuidaHub.tsx's primaryAction), non solo un link alla
                  // pagina della guida.
                  <button
                    onClick={() => tryOpenNavigatorApp(router, `/guida/${encodeURIComponent(featured.hike.id)}/naviga`)}
                    className="inline-flex items-center gap-2 bg-terra-500 hover:bg-terra-600 text-white text-[13px] font-semibold px-5 py-2.5 rounded-full shadow-lg transition-colors"
                  >
                    <Navigation className="w-4 h-4" /> Naviga
                  </button>
                ) : (
                  <Link
                    href={`/guida/${encodeURIComponent(featured.hike.id)}`}
                    className="inline-flex items-center gap-2 bg-terra-500 hover:bg-terra-600 text-white text-[13px] font-semibold px-5 py-2.5 rounded-full shadow-lg transition-colors"
                  >
                    <Navigation className="w-4 h-4" /> Vai al percorso
                  </Link>
                )}
                {/* Apre la copertina del percorso (mappa, statistiche, POI) invece di saltare
                    direttamente alla guida narrata — ?scheda=1 disattiva l'auto-apertura di
                    default per un link diretto (vedi app/guida/[id]/page.tsx). */}
                <Link
                  href={`/guida/${encodeURIComponent(featured.hike.id)}?scheda=1`}
                  className="inline-flex items-center gap-2 bg-white/15 hover:bg-white/25 text-white text-[13px] font-semibold px-4 py-2.5 rounded-full border border-white/30 backdrop-blur-sm transition-colors"
                >
                  Apri scheda
                </Link>
              </div>
            </>
          ) : latestActivity ? (
            <>
              <p className="font-barlow font-extrabold text-[11px] tracking-[2px] uppercase text-terra-300 mb-1">
                {isStale ? `Sei fermo da ${daysSinceLastActivity} giorni` : `La tua ultima uscita · ${format(new Date(latestActivity.startTime), 'd MMMM', { locale: it })}`}
              </p>
              <h1 className="font-display font-black text-[28px] text-white leading-tight" style={{ textShadow: '0 2px 10px rgba(0,0,0,0.5)' }}>
                {latestActivity.title}
              </h1>
              <p className="text-[12px] text-white/85 mt-1" style={{ textShadow: '0 1px 6px rgba(0,0,0,0.55)' }}>
                {(latestActivity.distanceMeters / 1000).toFixed(1)} km · +{Math.round(latestActivity.elevationGain)} m
                {latestActivity.totalTimeSeconds ? ` · ${formatDuration(latestActivity.totalTimeSeconds)}` : ''}
              </p>
              {latestActivity.trailScore != null && (
                <span
                  className="inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold text-white"
                  style={{ backgroundColor: `${ctsLabel(latestActivity.trailScore).color}b3` }}
                >
                  TS {Math.round(latestActivity.trailScore)} · {ctsLabel(latestActivity.trailScore).label}
                </span>
              )}
              <div className="mt-3 flex items-center gap-3">
                {isStale ? (
                  <>
                    <Link
                      href="/upload?tab=gpx"
                      className="inline-flex items-center gap-2 bg-terra-500 hover:bg-terra-600 text-white text-[13px] font-semibold px-5 py-2.5 rounded-full shadow-lg transition-colors"
                    >
                      <Navigation className="w-4 h-4" /> Pianifica una nuova uscita
                    </Link>
                    <Link href={`/resoconto/${encodeURIComponent(latestActivity.id)}`} className="text-[12px] font-semibold text-white/90" style={{ textShadow: '0 1px 6px rgba(0,0,0,0.55)' }}>
                      Rivedi l&apos;ultima uscita
                    </Link>
                  </>
                ) : (
                  <>
                    <Link
                      href={`/resoconto/${encodeURIComponent(latestActivity.id)}`}
                      className="inline-flex items-center gap-2 bg-terra-500 hover:bg-terra-600 text-white text-[13px] font-semibold px-5 py-2.5 rounded-full shadow-lg transition-colors"
                    >
                      <Navigation className="w-4 h-4" /> Rivedi
                    </Link>
                    <Link href="/upload?tab=gpx" className="text-[12px] font-semibold text-white/90" style={{ textShadow: '0 1px 6px rgba(0,0,0,0.55)' }}>
                      Pianifica la prossima uscita →
                    </Link>
                  </>
                )}
              </div>
            </>
          ) : (
            <>
              <p className="font-barlow font-extrabold text-[11px] tracking-[2px] uppercase text-terra-300 mb-1">Inizia da qui</p>
              <h1 className="font-display font-black text-[26px] text-white leading-tight" style={{ textShadow: '0 2px 10px rgba(0,0,0,0.5)' }}>
                Pianifica il tuo primo percorso
              </h1>
              <Link
                href="/upload?tab=gpx"
                className="mt-3 inline-flex items-center gap-2 bg-terra-500 hover:bg-terra-600 text-white text-[13px] font-semibold px-5 py-2.5 rounded-full shadow-lg transition-colors"
              >
                <Navigation className="w-4 h-4" /> Pianifica un percorso
              </Link>
            </>
          )}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pb-10">

        {featuredList.length > 1 && (
          <div className="mt-4">
            {/* Gerarchia temporale esplicita — "adesso" è già l'hero sopra, senza bisogno di
                un'etichetta: qui iniziano le fasi successive del ciclo utente (a breve → da
                scoprire → nel tempo), per rendere leggibile a colpo d'occhio in che momento si
                trova ciascun gruppo di contenuti. */}
            <p className="font-barlow font-extrabold text-[10px] tracking-[2.5px] uppercase text-terra-600/80 mb-1">A breve</p>
            {upcomingCount > 0 && (
              <p className="text-[12px] text-stone-500 mb-1.5">
                Hai {upcomingCount} percors{upcomingCount === 1 ? 'o' : 'i'} programmat{upcomingCount === 1 ? 'o' : 'i'} nei prossimi {UPCOMING_WINDOW_DAYS} giorni.
              </p>
            )}
            <p className="font-barlow font-extrabold text-[11px] tracking-[1.5px] uppercase text-stone-400 mb-2">
              Altre uscite in programma
            </p>
            <div className="flex gap-2.5 overflow-x-auto pb-1 -mx-4 px-4" style={{ scrollbarWidth: 'none' }}>
              {featuredList.slice(1).map(f => {
                const photoUrl = plannedHikePhotoUrl(f.hike)
                return (
                <Link
                  key={f.hike.id}
                  href={`/guida/${encodeURIComponent(f.hike.id)}`}
                  className="shrink-0 w-[170px] bg-white border border-stone-200 rounded-2xl overflow-hidden shadow-sm"
                >
                  <div className="relative h-[90px] bg-gradient-to-b from-forest-50 to-stone-50 bg-topography overflow-hidden">
                    {photoUrl ? (
                      <>
                        <img src={photoUrl} alt="" className="absolute inset-0 w-full h-full object-cover" style={{ filter: HERO_IMAGE_FILTER }} />
                        {/* Stesso trattamento dell'hero: la foto non deve far sparire il tracciato,
                            solo un riquadro piccolo invece della mappa piena — qui non c'è spazio
                            per altro. */}
                        {f.hike.routePolyline?.length ? (
                          <div className="absolute top-1.5 right-1.5 w-7 h-7 rounded-md bg-black/45 backdrop-blur-sm border border-white/20 p-1">
                            <RouteThumb polyline={f.hike.routePolyline} color="#ffffff" strokeWidth={2} />
                          </div>
                        ) : null}
                      </>
                    ) : f.hike.routePolyline?.length ? (
                      // Nessuna foto POI per questo percorso — mappa Leaflet/OSM reale (non solo il
                      // tracciato SVG) come già altrove nell'app (es. la copertina di un percorso
                      // senza foto in Guide/Resoconti, stesso componente): non interattiva (tutti i
                      // gesti disattivati), sicura dentro una card che è già essa stessa un link.
                      <GalleryMapThumb polyline={f.hike.routePolyline} />
                    ) : null}
                  </div>
                  <div className="p-2.5">
                    <p className="text-[12.5px] font-semibold text-stone-800 leading-snug line-clamp-2">{f.hike.title}</p>
                    <p className="text-[11px] text-stone-400 mt-1">
                      {f.hasDate && f.hike.plannedDate
                        ? `${format(new Date(f.hike.plannedDate), 'd MMM', { locale: it })} · ${(f.hike.distanceMeters / 1000).toFixed(1)} km`
                        : `${(f.hike.distanceMeters / 1000).toFixed(1)} km`}
                    </p>
                  </div>
                </Link>
                )
              })}
            </div>
          </div>
        )}

        {(curiosityEntries.length > 0 || recoStatus === 'ok' || recoStatus === 'pending') && (
          <p className="font-barlow font-extrabold text-[10px] tracking-[2.5px] uppercase text-terra-600/80 mt-6 mb-1">Da scoprire</p>
        )}

        {curiosityEntries.length > 0 && (
          <div className="mt-4">
            {/* UX-AUDIT.md/report AI 2026-08-22 — "Info dai tuoi percorsi" non comunicava perché
                DTrek mostra proprio quel contenuto: rinominata e affiancata da un tempo di lettura
                stimato (nessun nuovo dato, solo lunghezza del testo già in cache) — un passo verso
                "ogni elemento risponde a: perché me lo sta mostrando?", senza ancora la
                categorizzazione (Natura/Storia/Cultura) che richiederebbe classificare il testo. */}
            <p className="font-barlow font-extrabold text-[11px] tracking-[1.5px] uppercase text-stone-400 mb-2">
              Da sapere sui tuoi percorsi
            </p>
            <div className="flex gap-2.5 overflow-x-auto pb-1 -mx-4 px-4" style={{ scrollbarWidth: 'none' }}>
              {curiosityEntries.map(entry => (
                <div key={entry.key} className="shrink-0 w-[230px] bg-white border border-stone-200 rounded-2xl p-3.5 shadow-sm">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    {/* Traccia del percorso invece della sola icona MapPin, cosi l'utente associa
                        anche visivamente l'informazione al percorso a cui appartiene — ripiego su
                        MapPin per un percorso senza tracciato (es. inserito a mano). Nota:
                        RouteThumb disegna con vectorEffect="non-scaling-stroke", quindi
                        strokeWidth è in pixel schermo costanti (non scala con il contenitore) —
                        un valore pensato per l'anteprima da 90px di "Percorsi suggeriti" (2.5)
                        diventava una macchiolina qui dentro un contenitore da 16px: qui serve un
                        contenitore leggermente più grande e un tratto più sottile. */}
                    {entry.polyline && entry.polyline.length >= 2 ? (
                      <div className="w-6 h-6 rounded-md bg-terra-50 shrink-0 p-1">
                        <RouteThumb polyline={entry.polyline} color="#d97220" strokeWidth={1.5} />
                      </div>
                    ) : (
                      <MapPin className="w-3 h-3 text-terra-500 shrink-0" />
                    )}
                    <span className="text-[9.5px] font-bold uppercase tracking-wide text-stone-400 truncate flex-1 min-w-0">{entry.routeTitle}</span>
                    <span className="text-[9px] text-stone-300 shrink-0">{estimateReadingMinutes(entry.wiki.extract)} min</span>
                  </div>
                  <p className="text-[12px] text-stone-700 leading-snug line-clamp-4">{entry.wiki.extract}</p>
                  <button
                    type="button"
                    onClick={() => setOpenCuriosity({ routeTitle: entry.routeTitle, wiki: entry.wiki })}
                    className="inline-block text-[11px] font-semibold text-forest-600 mt-1.5"
                  >
                    Leggi tutto →
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {territoryPois.length > 0 && (
          // Stessi luoghi della riga "Da sapere sui tuoi percorsi" sopra, qui in forma di mappa
          // invece che di testo — un blocco a piena larghezza apposta, non un'altra riga
          // scorrevole di card: rompe il ritmo delle righe orizzontali senza però diventare un
          // elemento dominante (altezza compatta, sotto le altre righe di Bacheca). Il tocco per
          // ingrandire apre la stessa mappa, più grande e interattiva, in un foglio a comparsa.
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <p className="font-barlow font-extrabold text-[11px] tracking-[1.5px] uppercase text-stone-400">Il tuo territorio</p>
              <button
                type="button"
                onClick={() => setTerritoryMapOpen(true)}
                className="text-[11px] font-semibold text-forest-600 flex items-center gap-1 shrink-0"
              >
                Espandi <Maximize2 className="w-3 h-3" />
              </button>
            </div>
            <button type="button" onClick={() => setTerritoryMapOpen(true)} className="block w-full">
              <TerritoryMap pois={territoryPois} height="160px" interactive={false} />
            </button>
          </div>
        )}

        <Sheet open={territoryMapOpen} onClose={() => setTerritoryMapOpen(false)} title="Il tuo territorio">
          {territoryMapOpen && <TerritoryMap pois={territoryPois} height="70vh" interactive />}
        </Sheet>

        {recoStatus === 'ok' && recoCards.length > 0 && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <p className="font-barlow font-extrabold text-[11px] tracking-[1.5px] uppercase text-stone-400">Percorsi suggeriti</p>
              <Link href="/percorsi-per-te" className="text-[11px] font-semibold text-forest-600 flex items-center gap-1 shrink-0">
                Vedi tutti <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            {recoErrorMsg && <p className="text-[11px] text-red-600 mb-1.5">{recoErrorMsg}</p>}
            <div className="flex gap-2.5 overflow-x-auto pb-1 -mx-4 px-4" style={{ scrollbarWidth: 'none' }}>
              {recoCards.map(card => {
                const s = recoCardSummary(card)
                const isOpening = openingRecoId === card.id
                return (
                  <button
                    key={card.id}
                    onClick={() => handleOpenReco(card)}
                    disabled={openingRecoId !== null}
                    className="shrink-0 w-[170px] flex flex-col bg-white border border-stone-200 rounded-2xl overflow-hidden shadow-sm text-left disabled:opacity-60 transition-opacity"
                  >
                    {/* shrink-0 esplicito: senza, la riga (flex + overflow-x-auto, align-items:
                        stretch di default) allunga ogni card all'altezza della più alta — con un
                        titolo che va a capo su 2 righe invece di 1 in una card vicina, l'altezza
                        extra finiva scaricata qui invece che restare confinata al blocco di testo
                        sotto, spostando badge/mappa in verticale da una card all'altra. */}
                    <div className="relative h-[90px] shrink-0 bg-gradient-to-b from-forest-50 to-stone-50 bg-topography">
                      <div className="absolute inset-3">
                        <RouteThumb polyline={s.polyline} color="#2d7a3d" strokeWidth={2.5} />
                      </div>
                      {/* Report AI sulla Bacheca, 2026-08-22 — "CONSIGLIATO" da solo, identico su
                          ogni card, non spiegava perché DTrek l'avesse scelta. reasonTag
                          (lib/routeBuilder/generateRecommendations.ts) ricade su "Consigliato" solo
                          per righe storiche precedenti a questo campo. */}
                      <div className={`absolute top-2 left-2 max-w-[calc(100%-16px)] flex items-center gap-1 px-2 py-0.5 rounded-full text-white text-[9px] font-semibold uppercase tracking-wide ${s.isRevisit ? 'bg-forest-600/90' : 'bg-terra-600/90'}`}>
                        {s.isRevisit ? <Heart className="w-2.5 h-2.5 shrink-0" fill="currentColor" /> : <Sparkles className="w-2.5 h-2.5 shrink-0" />}
                        <span className="truncate">{s.isRevisit ? 'Preferito' : (s.reasonTag ?? 'Consigliato')}</span>
                      </div>
                      {isOpening && (
                        <div className="absolute inset-0 bg-white/75 flex items-center justify-center">
                          <Loader2 className="w-4 h-4 animate-spin text-forest-600" />
                        </div>
                      )}
                    </div>
                    <div className="p-2.5 min-w-0">
                      <p className="text-[12.5px] font-semibold text-stone-800 leading-snug line-clamp-2">{s.title}</p>
                      <p className="text-[11px] text-stone-400 mt-1">
                        {(s.distanceMeters / 1000).toFixed(1)} km · {s.hasElevation ? '' : '~'}+{Math.round(s.elevationGain)} m
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Punto d'accesso minimo, sempre presente, per quando la riga sopra non c'è ancora
            (nessuna card generata per questo account/zona, o riga mai generata) — senza questo la
            funzione era del tutto invisibile in Bacheca finché non aveva già dei risultati da
            mostrare, un vicolo cieco per chiunque non l'avesse mai aperta da /percorsi-per-te
            direttamente. Un solo link, non una riga di card: /percorsi-per-te fa lei stessa una
            generazione reale alla visita (vedi app/api/percorsi-per-te/route.ts) se la riga manca
            o è stantia, quindi questo link è anche il modo con cui la funzione si "accende" la
            prima volta. Non mostrato per 'empty_no_location'/'error' (nessun suggerimento
            possibile o pagina comunque da riprovare, non un invito a esplorare) né 'loading'
            (evita un flash prima che il primo ?peek=1 risponda). */}
        {!(recoStatus === 'ok' && recoCards.length > 0) && (recoStatus === 'ok' || recoStatus === 'pending') && (
          <Link
            href="/percorsi-per-te"
            className="mt-4 flex items-center justify-between bg-white border border-stone-200 rounded-2xl px-4 py-3 shadow-sm"
          >
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-terra-500 shrink-0" />
              <span className="text-[13px] font-semibold text-stone-700">Percorsi suggeriti</span>
            </div>
            <ArrowRight className="w-4 h-4 text-stone-400 shrink-0" />
          </Link>
        )}

        <p className="font-barlow font-extrabold text-[10px] tracking-[2.5px] uppercase text-terra-600/80 mt-6 mb-1">Nel tempo</p>
        <div className="border-t border-stone-200 pt-4">
          <div className="flex items-center justify-between mb-1">
            <span className="font-barlow font-extrabold text-[11px] tracking-[1.5px] uppercase text-stone-400">Il tuo andamento</span>
            <Link href="/statistiche" className="text-[11px] font-semibold text-forest-600 flex items-center gap-1">
              Vedi statistiche <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {/* UX-AUDIT.md P-M1 — Bacheca e Statistiche mostrano in parte gli stessi dati con
              presentazioni diverse, senza che "Bacheca" comunichi da sola la relazione: qui è la
              sintesi di oggi, in Statistiche l'archivio completo esplorabile. */}
          <p className="text-[11px] text-stone-400 mb-1">Solo una sintesi — l&apos;archivio completo è in Statistiche.</p>
          {/* Anticipa un dato reale invece di lasciare il link muto — riusa recentStats (ultimi 30
              giorni, già calcolato sulle activities in memoria). Nessun confronto "+18% sul mese
              scorso" per ora: richiederebbe la stessa finestra sul mese precedente, rimandato. */}
          {recentStats.totalActivities > 0 && (
            <p className="text-[12px] text-stone-600 mb-2.5">
              Ultimi 30 giorni: <strong className="font-semibold">{recentStats.totalActivities}</strong> percors{recentStats.totalActivities === 1 ? 'o' : 'i'} ·{' '}
              {recentStats.totalDistanceKm.toFixed(0)} km · {Math.round(recentStats.totalElevationGain).toLocaleString('it')} m D+
            </p>
          )}
          {globalStats.totalActivities === 0 ? (
            <p className="text-[12px] text-stone-400 text-center py-3">
              I tuoi numeri appariranno qui dopo la tua prima escursione registrata.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2">
                <StatCard icon={BarChart3} value={`${weeklyKm}`} unit="km/sett." />
                <StatCard icon={Flame} value={`${streaks.currentWeeks}`} unit="sett. streak" />
                <StatCard icon={TrendingUp} value={forma.label} unit="bilancio" />
              </div>
              {/* Da contatore a compagno che interpreta i dati — currentForm() (lib/trainingLoad.ts)
                  calcola già questa frase per ogni fascia di TSB, semplicemente non veniva mostrata
                  qui: nessun nuovo dato o calcolo. */}
              <p className="text-[11px] text-stone-400 mt-2 text-center">{forma.description}</p>
            </>
          )}
        </div>
      </div>

      {openCuriosity && (
        <CuriosityModal
          routeTitle={openCuriosity.routeTitle}
          wiki={openCuriosity.wiki}
          onClose={() => setOpenCuriosity(null)}
        />
      )}
    </div>
  )
}

function StatCard({ icon: Icon, value, unit }: { icon: typeof BarChart3; value: string; unit: string }) {
  return (
    <div className="bg-forest-50 rounded-xl py-2.5 text-center">
      <Icon className="w-3.5 h-3.5 text-forest-500 mx-auto mb-1" />
      <p className="font-display font-bold text-[16px] text-forest-700 truncate px-1">{value}</p>
      <p className="text-[9px] text-stone-500 mt-0.5">{unit}</p>
    </div>
  )
}
