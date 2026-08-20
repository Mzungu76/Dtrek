'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { Navigation, Sparkles, ArrowRight, TrendingUp, Flame, BarChart3, Loader2 } from 'lucide-react'
import HubNavBar from '@/components/routehub/HubNavBar'
import RouteThumb from '@/components/RouteThumb'
import { getAllActivities, computeGlobalStats, type ActivityMeta } from '@/lib/blobStore'
import { getAllPlanned, type PlannedHikeMeta } from '@/lib/plannedStore'
import { useCtsUpdated } from '@/lib/sync/useCtsUpdated'
import { computeStreaks } from '@/lib/stats'
import { computeTrainingLoad, activityStress, currentForm } from '@/lib/trainingLoad'
import { formatDuration } from '@/lib/tcxParser'
import type { WikiPage } from '@/lib/wikipedia'
import type { PoiItem } from '@/lib/overpass'

const FALLBACK_HERO = '/stato-hero-fallback.jpg'

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

  // Curiosità storico-culturale: il primo POI+estratto Wikipedia già arricchito gratuitamente
  // all'import del percorso in evidenza (GpxUploader.tsx) — nessuna chiamata AI. Assente su un
  // percorso senza GPS o non ancora arricchito: la card sparisce, non mostra un vuoto.
  const curiosity = useMemo(() => {
    const wiki = featured?.hike.cachedPoiWiki as { poi: PoiItem; wiki: WikiPage }[] | undefined
    return wiki && wiki.length > 0 ? wiki[0] : null
  }, [featured])

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

      {/* Hero compatta: prossima uscita, o CTA a pianificare la prima */}
      <div className="relative h-[340px] overflow-hidden">
        {featured?.hike.routePolyline?.length ? (
          <div className="absolute inset-0 bg-gradient-to-b from-forest-50 to-stone-50 bg-topography">
            <div className="absolute inset-6">
              <RouteThumb polyline={featured.hike.routePolyline} color="#2d7a3d" strokeWidth={3} />
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

        {curiosity && (
          <div className="mt-4 bg-white border border-stone-200 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1.5">
              <Sparkles className="w-3.5 h-3.5 text-terra-500" />
              <span className="text-[10px] font-bold uppercase tracking-wide text-stone-400">Lo sapevi che…</span>
            </div>
            <p className="text-[13px] text-stone-700 leading-snug">{curiosity.wiki.extract}</p>
            <a
              href={curiosity.wiki.url} target="_blank" rel="noopener noreferrer"
              className="inline-block text-[11.5px] font-semibold text-forest-600 mt-2"
            >
              Fonte: Wikipedia →
            </a>
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
