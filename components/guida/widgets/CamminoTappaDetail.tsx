'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { Loader2, Sparkles, Check, Navigation, Upload, BookOpen } from 'lucide-react'
import type { PoiItem } from '@/lib/overpass'
import { fetchWikiForNamedPois, type WikiPage } from '@/lib/wikipedia'
import PoiListWidget from './PoiListWidget'
import { TrailScoreGaugeBadge } from '@/components/TrailScoreGaugeBadge'
import RouteMapSection from '@/components/RouteMapSection'
import CamminoOfflineButton from './CamminoOfflineButton'
import { useTappaData } from '@/lib/cammini/useTappaData'
import { poisAlongTappa } from '@/lib/cammini/tappaPois'
import { chapterFor } from '@/lib/cammini/report'
import type { CamminoPlan, CamminoPlanTappa } from '@/lib/cammini/plan'
import type { TrackPoint } from '@/lib/tcxParser'
import ElevationProfileChart from '@/components/ElevationProfileChart'

const RouteMap3D = dynamic(() => import('@/components/RouteMap3D'), { ssr: false })

// Dettaglio di una tappa (docs/piano-cammini.md, Fase 5): lo stesso per una tappa già percorsa e per una
// ancora da fare, così chi cammina vede cosa lo aspetta. Il CTS è in evidenza; i luoghi sono in ordine di
// cammino con i km progressivi; natura, sapori e racconto di Giulia si scrivono su richiesta.

const WALK_KMH = 4
type Kind = 'racconto' | 'natura' | 'sapori'

const fmtKm = (m: number) => `${(m / 1000).toFixed(1)} km`
function fmtHours(m: number): string {
  const min = Math.round((m / 1000 / WALK_KMH) * 60 / 5) * 5
  const h = Math.floor(min / 60), r = min % 60
  return h === 0 ? `${r} min` : r === 0 ? `${h} h` : `${h} h ${r}`
}
export function fmtDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
}

export interface TappaDone { activityId: string; distanceMeters: number; totalTimeSeconds: number; elevationGain: number; startTime: string }

interface Props {
  plan: CamminoPlan
  hikeId: string
  tappa: CamminoPlanTappa
  /** Numero progressivo nel verso di marcia (1…N) e giornata a cui appartiene. */
  seq: number
  dayIdx: number
  done?: TappaDone
  onPlanChange: (plan: CamminoPlan) => void
  onNaviga: () => void
  onImporta: () => void
  onOpenReportage: () => void
}

export default function CamminoTappaDetail({ plan, hikeId, tappa: t, seq, dayIdx, done, onPlanChange, onNaviga, onImporta, onOpenReportage }: Props) {
  const state = useTappaData(plan, hikeId, t.ordinal, (ordinal, cts) => {
    onPlanChange({ ...planRef.current, tappe: planRef.current.tappe.map(x => (x.ordinal === ordinal ? { ...x, cts: { ts: cts.ts, label: cts.label, color: cts.color, computedAt: new Date().toISOString() } } : x)) })
  })
  const planRef = useRef(plan)
  planRef.current = plan
  const [show3D, setShow3D] = useState(false)
  const [open, setOpen] = useState<'natura' | 'sapori' | null>(null)
  const [writing, setWriting] = useState<Kind | null>(null)
  const [error, setError] = useState<string | null>(null)

  const day = plan.days[dayIdx]
  const reverse = plan.direction === 'reverse'
  const ready = state.status === 'ready' ? state : null
  const ctsV = ready?.cts
  const cts = ctsV && ctsV !== 'loading' && ctsV !== 'na' ? ctsV : null
  const ctsStored = t.cts && !cts ? t.cts : null
  const shownCts = cts ?? (ctsStored ? { ts: ctsStored.ts, label: ctsStored.label, color: ctsStored.color, safety: ctsStored.safety, total: ctsStored.total } : null)
  const shownSafety = shownCts?.safety ?? null
  const shownTotal = shownCts?.total ?? shownCts?.ts ?? null

  const trackPoints: TrackPoint[] | null = ready?.data.points ? ready.data.points.map(([lat, lon, alt]) => ({ time: '', lat, lon, altitudeMeters: alt })) : null
  const along = useMemo(
    () => (ready?.data.points && ready.data.profile ? poisAlongTappa(ready.data.pois ?? [], ready.data.points, ready.data.profile, reverse) : []),
    [ready, reverse],
  )
  const alongPois = useMemo(() => along.map(a => a.poi), [along])
  const centerPt = trackPoints ? trackPoints[Math.floor(trackPoints.length / 2)] : null
  const [wikiEntries, setWikiEntries] = useState<{ poi: PoiItem; wiki: WikiPage }[]>([])
  useEffect(() => {
    if (alongPois.length === 0) { setWikiEntries([]); return }
    let cancelled = false
    fetchWikiForNamedPois(alongPois).then(e => { if (!cancelled) setWikiEntries(e) }).catch(() => {})
    return () => { cancelled = true }
  }, [alongPois])
  const chapter = chapterFor(plan, t.ordinal)

  const km = done ? done.distanceMeters : t.lengthM
  const timeLabel = done ? `${Math.floor(done.totalTimeSeconds / 3600)} h ${String(Math.round((done.totalTimeSeconds % 3600) / 60)).padStart(2, '0')}` : fmtHours(t.lengthM)
  const up = done ? done.elevationGain : (ready?.data.gainM ?? t.elevationGainM)

  async function write(kind: Kind) {
    setWriting(kind); setError(null)
    try {
      const res = await fetch('/api/cammini/tappa-text', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hikeId, ordinal: t.ordinal, kind }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || typeof data.text !== 'string') throw new Error(data.message ?? data.error ?? 'Non sono riuscita a scrivere la tappa, riprova.')
      const field = kind === 'racconto' ? 'text' : kind
      onPlanChange({ ...planRef.current, tappe: planRef.current.tappe.map(x => (x.ordinal === t.ordinal ? { ...x, [field]: data.text } : x)) })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Non sono riuscita a scrivere la tappa, riprova.')
    } finally { setWriting(null) }
  }

  const textBlock = (kind: Kind, label: string) => {
    const text = kind === 'racconto' ? t.text : kind === 'natura' ? t.natura : t.sapori
    if (text) {
      return (
        <div>
          <p className="whitespace-pre-line text-[14px] leading-relaxed text-stone-700">{text}</p>
          <button type="button" disabled={writing != null} onClick={() => write(kind)} className="mt-2 text-[11.5px] font-semibold text-stone-400 hover:text-stone-600 disabled:opacity-60">{writing === kind ? 'Riscrivo…' : 'Riscrivi'}</button>
        </div>
      )
    }
    return (
      <button type="button" disabled={writing != null} onClick={() => write(kind)}
        className="flex w-full items-center justify-center gap-2 rounded-full border border-terra-200 bg-terra-50 py-2.5 text-[13px] font-semibold text-terra-700 transition-colors hover:bg-terra-100 disabled:opacity-60">
        {writing === kind ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
        {writing === kind ? 'Giulia sta scrivendo…' : label}
      </button>
    )
  }

  return (
    <div className="pb-28">
      {/* titolo, dati e CTS */}
      <div className="border-b border-stone-200 bg-white px-4 pb-3 pt-3.5">
        <div className="flex items-center gap-2">
          <p className="font-barlow text-[10px] font-bold uppercase tracking-[0.12em] text-stone-500">Giorno {dayIdx + 1}{day?.date ? ` · ${fmtDay(day.date)}` : ''}</p>
          {done
            ? <span className="flex items-center gap-1 rounded-full bg-forest-100 px-2 py-0.5 text-[10px] font-bold uppercase text-forest-800"><Check className="w-2.5 h-2.5" /> Percorsa</span>
            : <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-bold uppercase text-stone-500">Da percorrere</span>}
        </div>
        <h2 className="mt-1.5 font-display text-[23px] font-bold leading-tight text-stone-800">{t.fromName ?? 'Partenza'} → {t.toName ?? 'Arrivo'}</h2>
        {t.endsAtAnchor === false && <p className="mt-1 text-[12px] text-amber-600">Si chiude in aperta campagna: verifica dove dormire.</p>}
        <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
          <div className="rounded-xl bg-stone-100 py-2"><p className="text-[15px] font-bold tabular-nums">{(km / 1000).toFixed(1).replace('.', ',')}</p><p className="text-[10px] uppercase tracking-wider text-stone-500">km</p></div>
          <div className="rounded-xl bg-stone-100 py-2"><p className="text-[15px] font-bold tabular-nums">{timeLabel}</p><p className="text-[10px] uppercase tracking-wider text-stone-500">{done ? 'tempo' : 'stima'}</p></div>
          <div className="rounded-xl bg-stone-100 py-2"><p className="text-[15px] font-bold tabular-nums">{up != null ? `+${Math.round(up)}` : '–'}</p><p className="text-[10px] uppercase tracking-wider text-stone-500">salita m</p></div>
        </div>
        {/* CTS: pannello scuro come in "Dati e sicurezza" — anello interno Trail Score, esterno Sicurezza */}
        <div className="mt-2.5 flex items-center gap-4 rounded-2xl bg-gradient-to-br from-stone-800 to-stone-900 px-4 py-3.5">
          <TrailScoreGaugeBadge total={shownTotal} safety={shownSafety} size={92} showLabel={false} loading={shownTotal == null && ctsV !== 'na'} />
          <div className="min-w-0 flex-1 text-white">
            <p className="font-barlow text-[10px] font-bold uppercase tracking-[0.14em] text-white/60">CTS · Sicurezza</p>
            {shownCts ? (
              <>
                <p className="mt-1 text-[13.5px] font-semibold leading-snug">Trail Score <b className="text-[17px]">{shownTotal}</b> <span className="text-white/70">· {shownCts.label.toLowerCase()}</span></p>
                {shownSafety && <p className="text-[13.5px] font-semibold leading-snug">Sicurezza <b className="text-[17px]">{shownSafety.overall}</b> <span className="text-white/70">· {shownSafety.label.toLowerCase()}</span></p>}
                <p className="mt-1.5 text-[11px] leading-snug text-white/55">Profilo, terreno, luoghi, fauna e quota della tappa, con le tue preferenze e il tuo storico.</p>
              </>
            ) : (
              <p className="mt-1 text-[12.5px] text-white/70">{ctsV === 'na' ? 'Il CTS di questa tappa non è disponibile.' : 'Calcolo CTS e Sicurezza della tappa…'}</p>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-3 px-3.5 pt-3">
        {/* capitolo del reportage */}
        {chapter && (
          <button type="button" onClick={onOpenReportage} className="block w-full rounded-2xl border border-[#e7dfc9] bg-[#fbf8f0] px-3.5 py-3 text-left">
            <p className="font-barlow text-[10px] font-bold uppercase tracking-[0.12em] text-[#7a5f28]">Dal reportage del cammino</p>
            <p className="mt-1.5 line-clamp-3 font-display text-[14.5px] leading-relaxed text-stone-700">{chapter.body}</p>
            <p className="mt-2 text-[13px] font-bold text-forest-700">Leggi il capitolo ›</p>
          </button>
        )}

        {/* mappa e profilo: la mappa del percorso dell'app (schermo intero, 3D, lucchetto, luoghi con le loro icone) */}
        {trackPoints && trackPoints.length > 1 ? (
          <RouteMapSection trackPoints={trackPoints} showPois={false} planned={!done} onOpenMap3D={() => setShow3D(true)} />
        ) : <div className="flex h-[260px] items-center justify-center rounded-2xl border border-stone-200 bg-stone-100 text-[12px] text-stone-400"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {state.status === 'na' ? 'Mappa non disponibile.' : 'Carico la mappa…'}</div>}
        {/* luoghi della tappa: stessa Galleria dei POI dei sentieri (mappa dei luoghi, icone, card) */}
        <div className="px-0.5 pt-1">
          <p className="font-barlow text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500">I luoghi da non perdere</p>
        </div>
        {state.status === 'loading' ? <p className="py-3 text-[12px] text-stone-400">Cerco i luoghi…</p>
          : along.length === 0 ? <p className="py-3 text-[12px] text-stone-400">Nessun luogo segnalato lungo questa tappa nei dati disponibili.</p>
          : (
            <PoiListWidget
              hikeId={`${hikeId}-t${t.ordinal}`}
              pois={alongPois}
              poiWikiEntries={wikiEntries}
              hasGps
              centerLat={centerPt?.lat}
              centerLon={centerPt?.lon}
              onWikiLoaded={() => {}}
              trackPoints={trackPoints ?? undefined}
              onOpenMap3D={() => setShow3D(true)}
            />
          )}

        {/* racconto, natura e sapori su richiesta */}
        <div className="rounded-2xl border border-stone-200 bg-white px-3.5 py-3">{textBlock('racconto', 'Racconta questa tappa con Giulia')}</div>
        <div className="grid grid-cols-2 gap-2">
          {(['natura', 'sapori'] as const).map(k => (
            <button key={k} type="button" onClick={() => setOpen(open === k ? null : k)} aria-expanded={open === k}
              className={`rounded-2xl border px-3.5 py-2.5 text-left ${open === k ? 'border-forest-300 bg-forest-50' : 'border-stone-200 bg-white'}`}>
              <p className="text-[13px] font-bold capitalize text-stone-800">{k}</p>
              <p className="mt-0.5 text-[12px] font-semibold text-forest-700">{(k === 'natura' ? t.natura : t.sapori) ? 'Leggi' : 'Scopri'} ›</p>
            </button>
          ))}
        </div>
        {open && <div className="rounded-2xl border border-stone-200 bg-white px-3.5 py-3">{textBlock(open, open === 'natura' ? 'Scopri la natura di questa tappa' : 'Scopri i sapori di questa tappa')}</div>}
        {error && <p className="text-[12px] text-red-600">{error}</p>}
      </div>

      {show3D && trackPoints && (
        <RouteMap3D trackPoints={trackPoints} title={`${t.fromName ?? 'Partenza'} → ${t.toName ?? 'Arrivo'}`} onClose={() => setShow3D(false)} distanceMeters={t.lengthM} elevationGain={ready?.data.gainM} pois={along.slice(0, 40).map(a => a.poi)} />
      )}

      {/* azioni: sempre in vista */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-stone-200 bg-white/95 px-3.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2.5 backdrop-blur">
        {done ? (
          <button type="button" onClick={onOpenReportage} className="flex w-full items-center justify-center gap-2 rounded-full bg-forest-600 py-3 text-[14px] font-bold text-white">
            <BookOpen className="w-4 h-4" /> {chapter ? 'Leggi il capitolo nel reportage' : 'Scrivi il capitolo nel reportage'}
          </button>
        ) : (
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <div className="col-span-2 flex justify-center"><CamminoOfflineButton plan={plan} hikeId={hikeId} ordinal={t.ordinal} /></div>
            <button type="button" onClick={onNaviga} className="flex items-center justify-center gap-2 rounded-full bg-forest-600 py-3 text-[14px] font-bold text-white"><Navigation className="w-4 h-4" /> Naviga</button>
            <button type="button" onClick={onImporta} className="flex items-center gap-1.5 rounded-full border border-stone-300 bg-white px-5 text-[13px] font-bold text-stone-700"><Upload className="w-4 h-4" /> Importa</button>
          </div>
        )}
      </div>
    </div>
  )
}
