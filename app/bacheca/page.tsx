'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { Navigation, Sparkles, ArrowRight, TrendingUp, Flame, BarChart3, Loader2 } from 'lucide-react'
import HubNavBar from '@/components/routehub/HubNavBar'
import RouteThumb from '@/components/RouteThumb'
import { getAllActivities, getActivityById, computeGlobalStats, type ActivityMeta, type StoredActivity } from '@/lib/blobStore'
import { getAllPlanned, type PlannedHikeMeta } from '@/lib/plannedStore'
import { fetchActivityPhotos, pickBestCoverPhoto } from '@/lib/activityPhotos'
import { useCtsUpdated } from '@/lib/sync/useCtsUpdated'
import { computeStreaks } from '@/lib/stats'
import { computeTrainingLoad, activityStress, currentForm } from '@/lib/trainingLoad'
import { formatDuration } from '@/lib/tcxParser'
import type { WikiPage } from '@/lib/wikipedia'
import type { PoiItem } from '@/lib/overpass'

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
// "Percorsi per te" resta per ora un singolo teaser (come nella versione precedente di questa
// pagina), non righe di card: la funzione non è ancora affidabile end-to-end (vedi P-O5/Fase 3),
// quindi non ha senso costruirci sopra una UI più ricca finché non lo è.
export default function BachecaPage() {
  const [activities, setActivities] = useState<ActivityMeta[]>([])
  const [planned, setPlanned] = useState<PlannedHikeMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [recoStatus, setRecoStatus] = useState<'loading' | 'ok' | 'empty_no_location' | 'error' | 'pending'>('loading')
  const [recoCount, setRecoCount] = useState(0)

  useEffect(() => {
    // ?peek=1: non innesca mai una generazione — vedi app/api/percorsi-per-te/route.ts. Solo per il
    // conteggio del teaser, non deve rallentare l'apertura della Home.
    fetch('/api/percorsi-per-te?peek=1')
      .then(res => (res.ok ? res.json() : Promise.reject()))
      .then(data => { setRecoStatus(data.status); setRecoCount((data.cards ?? []).length) })
      .catch(() => setRecoStatus('error'))
  }, [])

  const loadAll = () => Promise.all([getAllActivities(), getAllPlanned()]).then(([acts, plans]) => {
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

  // "Prossima uscita": percorso pianificato attivo con la data più vicina da oggi in poi. Se
  // nessuno ha una data, il più recente creato (comunque "quello che stavi già pianificando"). Se
  // non esiste nessun percorso pianificato, null — stato vuoto gestito a parte sotto.
  const featured = useMemo(() => {
    const active = planned.filter(h => !h.archivedAt)
    if (active.length === 0) return null
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const withDate = active
      .filter(h => h.plannedDate && new Date(h.plannedDate) >= today)
      .sort((a, b) => new Date(a.plannedDate!).getTime() - new Date(b.plannedDate!).getTime())
    if (withDate.length > 0) return { hike: withDate[0], hasDate: true }
    const sorted = active.slice().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    return { hike: sorted[0], hasDate: false }
  }, [planned])

  // Fallback quando non c'è (ancora) un percorso pianificato in evidenza: l'ultima escursione già
  // fatta. Serve sia per la curiosità (il suo poiWiki) sia per la foto dell'hero (la sua copertina
  // reale) — catena di fallback descritta in UX-AUDIT.md P-O5. ActivityMeta (già caricata sopra)
  // non porta poiWiki/foto: vanno recuperati a parte, solo per l'unica attività che serve qui.
  const recentActivitiesSorted = useMemo(
    () => activities.slice().sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()),
    [activities],
  )
  const latestActivity = recentActivitiesSorted[0] ?? null
  // Solo per arricchire la riga "Curiosità dai tuoi percorsi" con una seconda voce quando
  // disponibile (vedi curiosityEntries sotto) — non usata per la foto/CTA dell'hero, che restano
  // legate alla sola escursione più recente.
  const secondActivity = recentActivitiesSorted[1] ?? null

  const [latestActivityFull, setLatestActivityFull] = useState<StoredActivity | null>(null)
  const [latestActivityCover, setLatestActivityCover] = useState<string | null>(null)
  const [secondActivityFull, setSecondActivityFull] = useState<StoredActivity | null>(null)

  useEffect(() => {
    if (!latestActivity) { setLatestActivityFull(null); setLatestActivityCover(null); return }
    let cancelled = false
    getActivityById(latestActivity.id).then(full => { if (!cancelled) setLatestActivityFull(full) }).catch(() => {})
    fetchActivityPhotos(latestActivity.id)
      .then(photos => { if (!cancelled) setLatestActivityCover(pickBestCoverPhoto(photos)?.url ?? null) })
      .catch(() => {})
    return () => { cancelled = true }
    // Volutamente solo l'id: latestActivity è un nuovo oggetto a ogni ricalcolo di activities
    // (lo useMemo sopra), il fetch non deve ripartire finché l'attività più recente resta la stessa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestActivity?.id])

  useEffect(() => {
    if (!secondActivity) { setSecondActivityFull(null); return }
    let cancelled = false
    getActivityById(secondActivity.id).then(full => { if (!cancelled) setSecondActivityFull(full) }).catch(() => {})
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondActivity?.id])

  // Curiosità storico-culturale — una per percorso, non più voci dello stesso percorso: il
  // percorso in evidenza, poi le due escursioni più recenti, ciascuna col proprio primo
  // POI+estratto Wikipedia già arricchito gratis (nessuna chiamata AI). Un percorso senza POI
  // arricchiti viene saltato, non mostrato vuoto; al massimo tre voci, mostrate in una riga
  // scorrevole (coerente col mockup "DTrek Home Layouts", Opzione D).
  const curiosityEntries = useMemo(() => {
    const entries: { routeTitle: string; wiki: WikiPage }[] = []
    const seenTitles = new Set<string>()
    const addFrom = (title: string | undefined, wikiList: { poi: PoiItem; wiki: WikiPage }[] | undefined) => {
      if (entries.length >= 3 || !title || seenTitles.has(title) || !wikiList?.length) return
      seenTitles.add(title)
      entries.push({ routeTitle: title, wiki: wikiList[0].wiki })
    }
    addFrom(featured?.hike.title, featured?.hike.cachedPoiWiki as { poi: PoiItem; wiki: WikiPage }[] | undefined)
    addFrom(latestActivity?.title, latestActivityFull?.poiWiki)
    addFrom(secondActivity?.title, secondActivityFull?.poiWiki)
    return entries
  }, [featured, latestActivity, latestActivityFull, secondActivity, secondActivityFull])

  // Foto dell'hero: catena di fallback (P-O5) — foto propria (solo per un'escursione già fatta,
  // non ha senso per un percorso ancora da percorrere) → foto del POI Wikipedia → tracciato su
  // sfondo topografico (gestito nel JSX) → immagine generica di fallback.
  const heroPhotoUrl = useMemo(() => {
    if (featured) {
      const wiki = featured.hike.cachedPoiWiki as { poi: PoiItem; wiki: WikiPage }[] | undefined
      return wiki?.[0]?.wiki.thumbnail ?? null
    }
    if (latestActivity) {
      return latestActivityCover ?? latestActivityFull?.poiWiki?.[0]?.wiki.thumbnail ?? null
    }
    return null
  }, [featured, latestActivity, latestActivityCover, latestActivityFull])

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
          poi il tracciato su sfondo topografico, poi l'immagine generica di fallback. */}
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
              <Link
                href={`/guida/${encodeURIComponent(featured.hike.id)}`}
                className="mt-3 inline-flex items-center gap-2 bg-terra-500 hover:bg-terra-600 text-white text-[13px] font-semibold px-5 py-2.5 rounded-full shadow-lg transition-colors"
              >
                <Navigation className="w-4 h-4" /> {featured.hasDate ? 'Naviga' : 'Vai al percorso'}
              </Link>
            </>
          ) : latestActivity ? (
            <>
              <p className="font-barlow font-extrabold text-[11px] tracking-[2px] uppercase text-terra-300 mb-1">
                La tua ultima uscita · {format(new Date(latestActivity.startTime), 'd MMMM', { locale: it })}
              </p>
              <h1 className="font-display font-black text-[28px] text-white leading-tight" style={{ textShadow: '0 2px 10px rgba(0,0,0,0.5)' }}>
                {latestActivity.title}
              </h1>
              <p className="text-[12px] text-white/85 mt-1" style={{ textShadow: '0 1px 6px rgba(0,0,0,0.55)' }}>
                {(latestActivity.distanceMeters / 1000).toFixed(1)} km · +{Math.round(latestActivity.elevationGain)} m
                {latestActivity.totalTimeSeconds ? ` · ${formatDuration(latestActivity.totalTimeSeconds)}` : ''}
              </p>
              <div className="mt-3 flex items-center gap-3">
                <Link
                  href={`/resoconto/${encodeURIComponent(latestActivity.id)}`}
                  className="inline-flex items-center gap-2 bg-terra-500 hover:bg-terra-600 text-white text-[13px] font-semibold px-5 py-2.5 rounded-full shadow-lg transition-colors"
                >
                  <Navigation className="w-4 h-4" /> Rivedi
                </Link>
                <Link href="/upload?tab=gpx" className="text-[12px] font-semibold text-white/90" style={{ textShadow: '0 1px 6px rgba(0,0,0,0.55)' }}>
                  Pianifica la prossima uscita →
                </Link>
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

        {curiosityEntries.length > 0 && (
          <div className="mt-4">
            <p className="font-barlow font-extrabold text-[11px] tracking-[1.5px] uppercase text-stone-400 mb-2">
              Curiosità dai tuoi percorsi
            </p>
            <div className="flex gap-2.5 overflow-x-auto pb-1 -mx-4 px-4" style={{ scrollbarWidth: 'none' }}>
              {curiosityEntries.map(entry => (
                <div key={entry.routeTitle} className="shrink-0 w-[230px] bg-white border border-stone-200 rounded-2xl p-3.5 shadow-sm">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Sparkles className="w-3 h-3 text-terra-500 shrink-0" />
                    <span className="text-[9.5px] font-bold uppercase tracking-wide text-stone-400 truncate">{entry.routeTitle}</span>
                  </div>
                  <p className="text-[12px] text-stone-700 leading-snug line-clamp-4">{entry.wiki.extract}</p>
                  <a
                    href={entry.wiki.url} target="_blank" rel="noopener noreferrer"
                    className="inline-block text-[11px] font-semibold text-forest-600 mt-1.5"
                  >
                    Wikipedia →
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}

        {recoStatus === 'ok' && recoCount > 0 && (
          <Link
            href="/percorsi-per-te"
            className="mt-4 flex items-center gap-3 bg-gradient-to-br from-terra-500 to-terra-800 text-white rounded-2xl p-4 shadow-sm"
          >
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <Sparkles className="w-4.5 h-4.5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">Percorsi per te</p>
              <p className="text-[12px] text-white/80">{recoCount} scelti per te</p>
            </div>
            <ArrowRight className="w-4 h-4 shrink-0" />
          </Link>
        )}

        <div className="mt-5 border-t border-stone-200 pt-4">
          <div className="flex items-center justify-between mb-2.5">
            <span className="font-barlow font-extrabold text-[11px] tracking-[1.5px] uppercase text-stone-400">Il tuo andamento</span>
            <Link href="/statistiche" className="text-[11px] font-semibold text-forest-600 flex items-center gap-1">
              Statistiche <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {globalStats.totalActivities === 0 ? (
            <p className="text-[12px] text-stone-400 text-center py-3">
              I tuoi numeri appariranno qui dopo la tua prima escursione registrata.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              <StatCard icon={BarChart3} value={`${weeklyKm}`} unit="km/sett." />
              <StatCard icon={Flame} value={`${streaks.currentWeeks}`} unit="sett. streak" />
              <StatCard icon={TrendingUp} value={forma.label} unit="bilancio" />
            </div>
          )}
        </div>
      </div>
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
