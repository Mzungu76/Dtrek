'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
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
// hanno già API e tabelle (app/api/diaries, app/api/collections — costruite prima del ripristino
// al layout PR #741, vedi commit 73b2efa) ma nessun editor/viewer in app: quella UI è stata
// rimossa insieme al resto. Mostrarli con un link che porta a una pagina inesistente sarebbe
// peggio che non mostrarli — qui compaiono con i conteggi reali ma etichettati "In arrivo" finché
// quell'editor non esiste.
export default function DiarioHubPage() {
  const [activities, setActivities] = useState<ActivityMeta[]>([])
  const [config, setConfig] = useState<DiaryConfig>(DEFAULT_DIARY_CONFIG)
  const [diaries, setDiaries] = useState<DiarySummary[]>([])
  const [collections, setCollections] = useState<CollectionSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [newDiaryHint, setNewDiaryHint] = useState(false)

  useEffect(() => {
    Promise.all([
      getAllActivities(),
      fetch('/api/diary-config').then(r => r.ok ? r.json() : DEFAULT_DIARY_CONFIG),
      fetch('/api/diaries').then(r => r.ok ? r.json() : []),
      fetch('/api/collections').then(r => r.ok ? r.json() : []),
    ]).then(([acts, dc, ds, cs]) => {
      setActivities(acts as ActivityMeta[])
      setConfig(normalizeDiaryConfig(dc))
      setDiaries(ds as DiarySummary[])
      setCollections(cs as CollectionSummary[])
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
      <div className="relative h-[300px] sm:h-[380px] overflow-hidden">
        {config.coverUrl ? (
          <img src={config.coverUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0" style={{ background: 'linear-gradient(158deg,#193b20 0%,#1c4724 45%,#20592b 100%)' }} />
        )}
        <div className="absolute inset-0 bg-topography opacity-60" />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, transparent 32%, transparent 55%, rgba(11,26,20,0.92) 100%)' }} />

        <div className="absolute inset-x-0 top-0 z-20"><HubNavBar /></div>

        <div className="absolute inset-x-0 bottom-0 z-10 p-5 sm:px-10 sm:pb-8">
          <span className="font-barlow text-[11px] font-extrabold uppercase tracking-[3px] text-amber-300">Diario attivo</span>
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-white mt-1.5 leading-tight"
            style={{ textShadow: '0 2px 10px rgba(0,0,0,0.5)' }}>
            {config.title}
          </h1>
          <div className="flex flex-wrap gap-2 mt-3">
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
            className="inline-flex items-center gap-2 mt-4 bg-white text-forest-800 rounded-full px-5 py-2.5 font-barlow font-extrabold uppercase text-sm tracking-wide hover:bg-forest-50 transition-colors">
            Apri il diario <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {/* Foglio inferiore — Diari e Raccolte */}
      <div className="relative -mt-5 bg-stone-100 rounded-t-[22px] px-4 sm:px-10 pt-5 pb-12">
        <div className="w-9 h-1 rounded-full bg-stone-300 mx-auto mb-5" />

        {/* I tuoi Diari */}
        <section className="mb-7">
          <div className="flex items-center justify-between mb-2.5">
            <span className="font-barlow font-bold text-[11px] tracking-[2.5px] uppercase text-stone-400">I tuoi diari</span>
            <span className="font-mono text-[11px] text-stone-400">{visibleDiaries.length}</span>
          </div>
          <div className="flex gap-2.5 overflow-x-auto pb-1 -mx-4 px-4 sm:-mx-10 sm:px-10">
            {defaultDiary && <DiaryTile diary={defaultDiary} />}
            {otherDiaries.map(d => <DiaryTile key={d.id} diary={d} />)}
            <div className="relative shrink-0">
              <button
                onClick={() => setNewDiaryHint(v => !v)}
                className="w-20 h-32 rounded-2xl border-[1.5px] border-dashed border-stone-300 flex flex-col items-center justify-center gap-1.5 text-stone-400 hover:border-stone-400 hover:text-stone-500 transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span className="font-barlow text-[10px] font-bold">Nuovo</span>
              </button>
              {newDiaryHint && (
                <div className="absolute z-10 top-full mt-2 left-1/2 -translate-x-1/2 w-48 bg-stone-800 text-white text-[11px] leading-snug rounded-lg px-3 py-2 shadow-lg">
                  Più Diari, ciascuno con il suo libro, arrivano presto.
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Raccolte */}
        <section>
          <span className="font-barlow font-bold text-[11px] tracking-[2.5px] uppercase text-stone-400">Raccolte</span>

          {collections.length === 0 ? (
            <div className="mt-2.5 rounded-2xl border border-dashed border-stone-300 p-4 flex items-center gap-3">
              <Layers className="w-5 h-5 text-stone-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-stone-600">Nessuna raccolta ancora</p>
                <p className="text-xs text-stone-400 mt-0.5">Raggrupperanno più Diari, pubblicabili come un unico volume.</p>
              </div>
              <span className="shrink-0 text-[10px] font-barlow font-bold uppercase tracking-wide text-stone-500 bg-stone-200 px-2 py-1 rounded-full">In arrivo</span>
            </div>
          ) : (
            <div className="mt-2.5 flex flex-col gap-2.5">
              {collections.map(c => <CollectionRow key={c.id} collection={c} />)}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function DiaryTile({ diary }: { diary: DiarySummary }) {
  const cover = (
    <div className="relative w-20 h-32 rounded-2xl overflow-hidden shrink-0"
      style={{ background: diary.isDefault ? 'linear-gradient(160deg,#378d44,#1c4724)' : 'linear-gradient(160deg,#8cc894,#277134)' }}>
      <div className="absolute inset-0 bg-topography opacity-50" />
      <div className="absolute inset-0 flex items-center justify-center">
        <BookMarked className="w-6 h-6 text-white/80" />
      </div>
      <div className="absolute bottom-0 inset-x-0 px-2 pb-1.5 pt-5 bg-gradient-to-t from-black/75 to-transparent">
        <span className="block text-[10px] font-bold text-white truncate leading-tight">{diary.title}</span>
        <span className="block text-[9px] text-white/70 leading-tight mt-0.5">{diary.reportageCount} resoconti</span>
      </div>
      {!diary.isDefault && (
        <span className="absolute top-1.5 right-1.5 text-[8px] font-barlow font-bold uppercase tracking-wide bg-white/90 text-stone-600 px-1.5 py-0.5 rounded-full">
          In arrivo
        </span>
      )}
    </div>
  )

  return diary.isDefault
    ? <Link href="/diario/libro">{cover}</Link>
    : <div className="opacity-70 cursor-default">{cover}</div>
}

function CollectionRow({ collection }: { collection: CollectionSummary }) {
  return (
    <div className="flex items-center gap-3 bg-white border border-stone-200 rounded-2xl px-3.5 py-3 opacity-80">
      <div className="flex shrink-0">
        {Array.from({ length: Math.min(3, Math.max(1, collection.volumeCount)) }).map((_, i) => (
          <div key={i} className="w-6 h-8 rounded-[4px] -mr-2.5 first:ml-0"
            style={{
              background: i % 2 === 0 ? 'linear-gradient(160deg,#8cc894,#277134)' : 'linear-gradient(160deg,#e9ab64,#9f4315)',
              transform: `rotate(${i % 2 === 0 ? -6 : 4}deg)`,
            }} />
        ))}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-display font-semibold text-sm text-stone-700 truncate">{collection.title}</p>
        <p className="text-[11px] text-stone-400 mt-0.5 flex items-center gap-1">
          {collection.volumeCount} diari · {collection.isPublished
            ? <span className="inline-flex items-center gap-1"><Globe2 className="w-3 h-3" /> pubblicata</span>
            : <span className="inline-flex items-center gap-1"><Lock className="w-3 h-3" /> bozza</span>}
        </p>
      </div>
      <span className="shrink-0 text-[10px] font-barlow font-bold uppercase tracking-wide text-stone-500 bg-stone-100 px-2 py-1 rounded-full">In arrivo</span>
    </div>
  )
}
