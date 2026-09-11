'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  BookMarked, Layers, Plus, Globe2, Lock, Loader2, ArrowRight, Camera, Upload,
} from 'lucide-react'
import HubNavBar from '@/components/routehub/HubNavBar'
import { getAllActivities, computeGlobalStats, type ActivityMeta } from '@/lib/blobStore'
import { normalizeDiaryConfig, DEFAULT_DIARY_CONFIG, type DiaryConfig } from '@/lib/diaryConfig'
import type { DiarySummary } from '@/app/api/diaries/route'
import type { CollectionSummary } from '@/app/api/collections/route'

// Hub "Diari" (Direzione B del mockup, docs/mockup-diari-raccolte) — sostituisce l'ex prima pagina
// di /diario, che ORA vive invariata su /diario/libro. Qui si arriva alla struttura
// Raccolte→Diari→Resoconti; il libro impaginato di un Diario resta quello di sempre.
//
// Diari aggiuntivi (oltre a quello di default, creato dal backfill per ogni utente) e Raccolte
// hanno API e tabelle costruite prima del ripristino al layout PR #741 (vedi commit 73b2efa) —
// l'editor/viewer che le apre (Sommario in /diario/[id], composizione in /raccolte/[id]) è stato
// ricostruito nei token attuali per poterle aprire, creare, spostare ed eliminare da qui.
export default function DiarioHubPage() {
  const router = useRouter()
  const [activities, setActivities] = useState<ActivityMeta[]>([])
  const [config, setConfig] = useState<DiaryConfig>(DEFAULT_DIARY_CONFIG)
  const [diaries, setDiaries] = useState<DiarySummary[]>([])
  const [collections, setCollections] = useState<CollectionSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [creatingDiary, setCreatingDiary] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      getAllActivities(),
      fetch('/api/diaries').then(r => r.ok ? r.json() : []),
      fetch('/api/collections').then(r => r.ok ? r.json() : []),
    ]).then(async ([acts, ds, cs]) => {
      setActivities(acts as ActivityMeta[])
      setDiaries(ds as DiarySummary[])
      setCollections(cs as CollectionSummary[])
      // Titolo/sottotitolo dell'hero vengono dal Diario di default vero e proprio (tabella
      // `diaries`, la stessa che alimenta il Sommario in /diario/[id]) — non più dal vecchio
      // `user_settings.diary_config` a sé stante: le due configurazioni non erano la stessa cosa,
      // e mostrare qui il valore sbagliato faceva sembrare persa una modifica fatta nel Sommario.
      const def = (ds as DiarySummary[]).find(d => d.isDefault)
      if (def) {
        const dc = await fetch(`/api/diaries/${encodeURIComponent(def.id)}/config`).then(r => r.ok ? r.json() : DEFAULT_DIARY_CONFIG)
        setConfig(normalizeDiaryConfig(dc))
      }
    }).finally(() => setLoading(false))
  }, [])

  const globalStats = useMemo(() => computeGlobalStats(activities), [activities])

  // Il Diario di default (garantito dal backfill, sempre primo nell'ordinamento di GET
  // /api/diaries) è lo stesso Diario che /diario/libro rende per intero — le sue statistiche qui
  // sono quelle di TUTTE le attività, non la somma dei soli Reportage collegati a una Meta
  // (aggregateDiaries conta solo quelli): i due numeri possono differire finché quel collegamento
  // non è la norma, ed è la vista del libro — non questa — a restare la fonte di verità.
  const visibleDiaries = useMemo(() => diaries.filter(d => !d.archivedAt), [diaries])
  const defaultDiary = visibleDiaries.find(d => d.isDefault)
  const otherDiaries = visibleDiaries.filter(d => !d.isDefault)

  async function createDiary() {
    setCreatingDiary(true); setCreateError(null)
    try {
      const res = await fetch('/api/diaries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message ?? data.error ?? `HTTP ${res.status}`)
      router.push(`/diario/${encodeURIComponent(data.id)}`)
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : String(e))
      setCreatingDiary(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-100">
        <div className="sticky top-0 z-40"><HubNavBar /></div>
        <div className="flex items-center justify-center py-32 text-stone-400 gap-3">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span className="font-lora italic">Caricamento diari…</span>
        </div>
      </div>
    )
  }

  if (activities.length === 0) {
    return (
      <div className="min-h-screen bg-stone-100">
        <div className="sticky top-0 z-40"><HubNavBar /></div>
        <div className="flex flex-col items-center justify-center text-center px-6 py-24">
          <div className="w-16 h-16 rounded-full bg-forest-50 flex items-center justify-center mb-5">
            <BookMarked className="w-7 h-7 text-forest-600" />
          </div>
          <h2 className="font-display text-xl font-semibold text-stone-700 mb-2">Il tuo Diario comincia qui</h2>
          <p className="text-stone-500 text-sm max-w-sm mb-6">
            Carica la tua prima escursione per iniziare a riempirlo.
          </p>
          <Link href="/upload?tab=activity"
            className="flex items-center gap-2 px-6 py-3 bg-forest-600 hover:bg-forest-700 text-white rounded-xl font-medium transition-colors">
            <Upload className="w-5 h-5" /> Carica un&apos;attività
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-stone-100">
      {/* Hero — copertina del Diario di default */}
      <div className="relative h-[340px] sm:h-[420px] overflow-hidden">
        {config.coverUrl ? (
          <img src={config.coverUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0" style={{ background: 'linear-gradient(158deg,#193b20 0%,#1c4724 45%,#20592b 100%)' }} />
        )}
        <div className="absolute inset-0 bg-topography opacity-60" />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, transparent 30%, transparent 55%, rgba(11,26,20,0.94) 100%)' }} />

        <div className="absolute inset-x-0 top-0 z-20"><HubNavBar /></div>

        <div className="absolute inset-x-0 bottom-0 z-10 p-6 sm:px-10 sm:pb-10">
          <span className="font-barlow text-[11px] font-extrabold uppercase tracking-[3px] text-amber-300">Diario attivo</span>
          <h1 className="font-display text-4xl sm:text-5xl font-bold text-white mt-2 leading-[1.05]"
            style={{ textShadow: '0 2px 14px rgba(0,0,0,0.55)' }}>
            {config.title}
          </h1>
          {config.subtitle && (
            <p className="font-lora italic text-base sm:text-lg text-white/80 mt-1.5"
              style={{ textShadow: '0 1px 8px rgba(0,0,0,0.5)' }}>
              {config.subtitle}
            </p>
          )}
          <div className="flex flex-wrap gap-2 mt-4">
            <span className="inline-flex items-center gap-1.5 bg-white/15 backdrop-blur-sm text-white text-[11px] font-semibold px-2.5 py-1.5 rounded-full">
              <Camera className="w-3 h-3" /> {globalStats.totalActivities} resoconti
            </span>
            <span className="bg-white/15 backdrop-blur-sm text-white text-[11px] font-semibold px-2.5 py-1.5 rounded-full">
              {globalStats.totalDistanceKm.toFixed(0)} km
            </span>
            <span className="bg-white/15 backdrop-blur-sm text-white text-[11px] font-semibold px-2.5 py-1.5 rounded-full">
              {Math.round(globalStats.totalElevationGain).toLocaleString('it')} m D+
            </span>
          </div>
          <Link href="/diario/libro"
            className="inline-flex items-center gap-2 mt-5 bg-white text-forest-800 rounded-full px-5 py-2.5 font-barlow font-extrabold uppercase text-sm tracking-wide hover:bg-forest-50 transition-colors shadow-lg shadow-black/20">
            Apri il diario <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {/* Foglio inferiore — Diari e Raccolte */}
      <div className="relative -mt-6 bg-stone-100 rounded-t-[26px] px-4 sm:px-10 pt-6 pb-14 shadow-[0_-8px_20px_rgba(0,0,0,0.06)]">
        <div className="w-10 h-1 rounded-full bg-stone-300 mx-auto mb-7" />

        {/* I tuoi Diari */}
        <section className="mb-10">
          <div className="flex items-center justify-between mb-3.5">
            <span className="font-barlow font-bold text-xs tracking-[2.5px] uppercase text-stone-400">I tuoi diari</span>
            <span className="font-mono text-xs text-stone-400">{visibleDiaries.length}</span>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 sm:-mx-10 sm:px-10">
            {defaultDiary && <DiaryTile diary={defaultDiary} />}
            {otherDiaries.map(d => <DiaryTile key={d.id} diary={d} />)}
            <button
              onClick={createDiary}
              disabled={creatingDiary}
              className="shrink-0 w-24 h-36 rounded-2xl border-[1.5px] border-dashed border-stone-300 flex flex-col items-center justify-center gap-2 text-stone-400 hover:border-stone-400 hover:text-stone-500 hover:bg-white/60 transition-colors disabled:opacity-60"
            >
              {creatingDiary ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
              <span className="font-barlow text-[11px] font-bold uppercase tracking-wide">Nuovo</span>
            </button>
          </div>
          {createError && <p className="text-xs text-red-600 mt-2">{createError}</p>}
        </section>

        {/* Raccolte */}
        <section>
          <div className="flex items-center justify-between mb-3.5">
            <span className="font-barlow font-bold text-xs tracking-[2.5px] uppercase text-stone-400">Raccolte</span>
            {collections.length > 0 && (
              <Link href="/raccolte" className="font-barlow font-bold text-xs tracking-wide uppercase text-forest-600 hover:text-forest-700 transition-colors">Vedi tutte</Link>
            )}
          </div>

          {collections.length === 0 ? (
            <Link href="/raccolte" className="rounded-2xl border border-dashed border-stone-300 bg-white/50 p-5 flex items-center gap-4 hover:border-stone-400 hover:bg-white transition-colors">
              <div className="w-11 h-11 rounded-xl bg-stone-100 flex items-center justify-center shrink-0">
                <Layers className="w-5 h-5 text-stone-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-display text-sm font-semibold text-stone-700">Nessuna raccolta ancora</p>
                <p className="text-xs text-stone-400 mt-0.5">Raggruppano più Diari, pubblicabili come un unico volume.</p>
              </div>
              <Plus className="w-4 h-4 text-stone-400 shrink-0" />
            </Link>
          ) : (
            <div className="flex flex-col gap-3">
              {collections.map(c => <CollectionRow key={c.id} collection={c} />)}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function DiaryTile({ diary }: { diary: DiarySummary }) {
  return (
    <Link href={`/diario/${encodeURIComponent(diary.id)}`}
      className="relative w-24 h-36 rounded-2xl overflow-hidden shrink-0 shadow-md shadow-black/10 transition-transform hover:-translate-y-0.5"
      style={{ background: diary.isDefault ? 'linear-gradient(160deg,#378d44,#1c4724)' : 'linear-gradient(160deg,#8cc894,#277134)' }}>
      <div className="absolute inset-0 bg-topography opacity-50" />
      <div className="absolute inset-0 flex items-center justify-center">
        <BookMarked className="w-7 h-7 text-white/70" />
      </div>
      <div className="absolute bottom-0 inset-x-0 px-2.5 pb-2 pt-7 bg-gradient-to-t from-black/80 to-transparent">
        <span className="block text-[11px] font-bold text-white truncate leading-tight">{diary.title}</span>
        <span className="block text-[9.5px] text-white/70 leading-tight mt-0.5">{diary.reportageCount} resoconti</span>
      </div>
      {diary.isDefault && (
        <span className="absolute top-2 right-2 text-[8px] font-barlow font-bold uppercase tracking-wide bg-white/90 text-forest-700 px-1.5 py-0.5 rounded-full">
          Default
        </span>
      )}
    </Link>
  )
}

function CollectionRow({ collection }: { collection: CollectionSummary }) {
  return (
    <Link href={`/raccolte/${encodeURIComponent(collection.id)}`}
      className="flex items-center gap-4 bg-white border border-stone-200 hover:border-stone-300 hover:shadow-md rounded-2xl px-4 py-4 shadow-sm transition-all">
      <div className="flex shrink-0 w-11 justify-center">
        {Array.from({ length: Math.min(3, Math.max(1, collection.volumeCount)) }).map((_, i) => (
          <div key={i} className="w-7 h-10 rounded-[5px] -mr-3 first:ml-0 shadow-sm ring-1 ring-black/5"
            style={{
              background: i % 2 === 0 ? 'linear-gradient(160deg,#8cc894,#277134)' : 'linear-gradient(160deg,#e9ab64,#9f4315)',
              transform: `rotate(${i % 2 === 0 ? -7 : 5}deg)`,
            }} />
        ))}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-display font-semibold text-base text-stone-800 truncate">{collection.title}</p>
        <p className="text-xs text-stone-400 mt-1 flex items-center gap-1.5">
          {collection.volumeCount} diari · {collection.reportageCount} resoconti ·{' '}
          {collection.isPublished
            ? <span className="inline-flex items-center gap-1 text-forest-600 font-medium"><Globe2 className="w-3 h-3" /> pubblicata</span>
            : <span className="inline-flex items-center gap-1"><Lock className="w-3 h-3" /> bozza</span>}
        </p>
      </div>
    </Link>
  )
}
