'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Archive, ArchiveRestore, ArrowLeft, ArrowRightLeft, BookMarked, Camera, ChevronDown, Clock,
  Layers, Loader2, Mountain, Route, Trash2, TrendingUp, X,
} from 'lucide-react'
import Navbar, { MOBILE_TOPBAR_SPACER } from '@/components/Navbar'
import RouteThumb from '@/components/RouteThumb'
import { TrailScoreGaugeBadge } from '@/components/TrailScoreGaugeBadge'
import { ctsLabel } from '@/lib/trailScore'
import { formatDuration } from '@/lib/tcxParser'
import { metaHasHikingMetrics } from '@/lib/metaTypes'
import { normalizeDiaryConfig, type DiaryConfig } from '@/lib/diaryConfig'
import type { DiarioDetail, DiarioReportageRow } from '@/app/api/diaries/[id]/route'
import type { DiarySummary } from '@/app/api/diaries/route'
import type { CollectionSummary } from '@/app/api/collections/route'

// Sommario di un Diario — apribile anche vuoto (nessun Reportage): l'unica pagina che sa mostrare
// il CONTENUTO di un Diario diverso da quello di default (il "libro" impaginato di /diario/libro
// resta legato a tutte le attività dell'utente, non a un Diario preciso). Restyling nei token
// attuali (forest/terra/stone) di app/diari/[id]/page.tsx, la pagina "Taccuino Botanico" rimossa
// nel ripristino al layout PR #741 — qui senza ricerca/ordinamento/Mete in programma: nessuna
// pagina in app crea o sceglie ancora una Meta non ancora camminata (l'upload attribuisce sempre
// al Diario di default, lib/activitySave.ts), quindi quella lista sarebbe quasi sempre vuota e non
// avrebbe dove atterrare un tap.
export default function DiarioSommarioPage() {
  const params = useParams<{ id: string }>()
  const diaryId = params.id
  const router = useRouter()

  const [detail, setDetail] = useState<DiarioDetail | null>(null)
  const [config, setConfig] = useState<DiaryConfig | null>(null)
  const [diaries, setDiaries] = useState<DiarySummary[]>([])
  const [collections, setCollections] = useState<CollectionSummary[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [configLoaded, setConfigLoaded] = useState(false)
  const configSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [moveOpenFor, setMoveOpenFor] = useState<string | null>(null)
  const [moveError, setMoveError] = useState<string | null>(null)
  const [movingId, setMovingId] = useState<string | null>(null)

  const [shelfPickerOpen, setShelfPickerOpen] = useState(false)
  const [shelfError, setShelfError] = useState<string | null>(null)
  const [shelfBusy, setShelfBusy] = useState(false)

  const [archiveConfirming, setArchiveConfirming] = useState(false)
  const [archiveBusy, setArchiveBusy] = useState(false)
  const [archiveError, setArchiveError] = useState<string | null>(null)

  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState<'migrate' | 'deleteAll' | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  function load() {
    Promise.all([
      fetch(`/api/diaries/${encodeURIComponent(diaryId)}`).then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))),
      fetch(`/api/diaries/${encodeURIComponent(diaryId)}/config`).then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))),
      fetch('/api/diaries').then(r => r.ok ? r.json() : []),
      fetch('/api/collections').then(r => r.ok ? r.json() : []),
    ]).then(([d, c, ds, cs]) => {
      setDetail(d as DiarioDetail)
      setConfig(normalizeDiaryConfig(c))
      setDiaries(ds as DiarySummary[])
      setCollections(cs as CollectionSummary[])
      setConfigLoaded(true)
    }).catch(e => setLoadError(e instanceof Error ? e.message : String(e)))
  }

  useEffect(() => { load() }, [diaryId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Titolo/sottotitolo vivono dentro un DiaryConfig completo (statsToggles, esclusioni…), non solo
  // due colonne: PATCH /api/diaries/[id]/config sostituisce l'intero oggetto, quindi va sempre
  // rimandato per intero — mai solo {title, subtitle} — o i campi non inviati tornerebbero ai
  // default (stessa regola di /api/diary-config, vedi app/diario/libro/page.tsx).
  useEffect(() => {
    if (!configLoaded || !config) return
    if (configSaveTimer.current) clearTimeout(configSaveTimer.current)
    configSaveTimer.current = setTimeout(() => {
      fetch(`/api/diaries/${encodeURIComponent(diaryId)}/config`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(config),
      }).catch(() => { /* riprovato al prossimo cambiamento */ })
    }, 800)
    return () => { if (configSaveTimer.current) clearTimeout(configSaveTimer.current) }
  }, [config, configLoaded, diaryId])

  const stats = useMemo(() => {
    const rows = (detail?.reportage ?? []).filter(r => metaHasHikingMetrics(r.metaType))
    return {
      count: rows.length,
      distanceKm: rows.reduce((s, r) => s + r.distanceMeters / 1000, 0),
      elevationGain: rows.reduce((s, r) => s + r.elevationGain, 0),
      totalTimeSeconds: rows.reduce((s, r) => s + r.totalTimeSeconds, 0),
    }
  }, [detail])

  const currentCollection = useMemo(
    () => collections.find(c => c.diaryIds.includes(diaryId)) ?? null,
    [collections, diaryId],
  )
  const otherCollections = useMemo(
    () => collections.filter(c => c.id !== currentCollection?.id),
    [collections, currentCollection],
  )
  const otherDiaries = useMemo(
    () => diaries.filter(d => d.id !== diaryId && !d.archivedAt),
    [diaries, diaryId],
  )

  // Sposta un Reportage in un altro Diario — l'appartenenza passa dal suo Percorso (Meta), non da
  // una colonna propria dell'attività (stessa indirezione di GET /api/diaries/[id]): si sposta la
  // Meta con PATCH /api/planned, la Meta sposta con sé l'unico Reportage che le appartiene.
  async function moveReportage(row: DiarioReportageRow, targetDiaryId: string) {
    if (!row.percorsoId) {
      setMoveError('Questo Reportage è antecedente ai Diari e non ha una Meta da spostare.')
      return
    }
    setMovingId(row.id); setMoveError(null)
    try {
      const res = await fetch('/api/planned', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.percorsoId, diaryId: targetDiaryId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? data.message ?? `HTTP ${res.status}`)
      setDetail(d => d ? { ...d, reportage: d.reportage.filter(r => r.id !== row.id) } : d)
      setMoveOpenFor(null)
    } catch (e) {
      setMoveError(e instanceof Error ? e.message : String(e))
    } finally {
      setMovingId(null)
    }
  }

  async function moveToCollection(targetCollectionId: string) {
    setShelfBusy(true); setShelfError(null)
    try {
      const res = await fetch(`/api/diaries/${encodeURIComponent(diaryId)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shelfId: targetCollectionId, shelfPosition: 0 }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      // Il server è l'unica fonte per "quale raccolta lo contiene ora" — un semplice ricalcolo
      // locale dovrebbe comunque rileggere `collections`, tanto vale ricaricarle per intero.
      fetch('/api/collections').then(r => r.ok ? r.json() : []).then(setCollections)
      setShelfPickerOpen(false)
    } catch (e) {
      setShelfError(e instanceof Error ? e.message : String(e))
    } finally {
      setShelfBusy(false)
    }
  }

  async function setArchived(archivedAt: string | null) {
    setArchiveBusy(true); setArchiveError(null)
    try {
      const res = await fetch(`/api/diaries/${encodeURIComponent(diaryId)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archivedAt }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      setDetail(d => d ? { ...d, archivedAt: data.archivedAt } : d)
      setArchiveConfirming(false)
    } catch (e) {
      setArchiveError(e instanceof Error ? e.message : String(e))
    } finally {
      setArchiveBusy(false)
    }
  }

  async function runDelete(action: 'migrate' | 'deleteAll') {
    setDeleteBusy(action); setDeleteError(null)
    try {
      const res = await fetch(`/api/diaries/${encodeURIComponent(diaryId)}?action=${action}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? `Eliminazione non riuscita (${res.status})`)
      }
      router.push('/diario')
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : String(e))
      setDeleteBusy(null)
    }
  }

  if (loadError) {
    return (
      <div className={`min-h-screen bg-stone-50 flex items-center justify-center px-6 text-center ${MOBILE_TOPBAR_SPACER}`}>
        <Navbar />
        <p className="text-sm text-red-600">Impossibile caricare questo Diario: {loadError}</p>
      </div>
    )
  }

  if (!detail || !config) {
    return (
      <div className={`min-h-screen bg-stone-50 flex items-center justify-center ${MOBILE_TOPBAR_SPACER}`}>
        <Navbar />
        <Loader2 className="w-6 h-6 animate-spin text-stone-400" />
      </div>
    )
  }

  return (
    <div className={`min-h-screen bg-stone-50 ${MOBILE_TOPBAR_SPACER}`}>
      <Navbar />
      <div className="max-w-2xl mx-auto px-4 sm:px-8 pb-16">
        <Link href="/diario" className="inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-700 mt-2 mb-4 transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> Diari
        </Link>

        {/* Copertina + titolo/sottotitolo, modificabili sul posto */}
        <div className="flex items-start gap-3.5 mb-5">
          <div className="relative w-14 h-[76px] rounded-xl overflow-hidden shrink-0"
            style={{ background: config.coverUrl ? undefined : 'linear-gradient(160deg,#378d44,#1c4724)' }}>
            {config.coverUrl
              ? <img src={config.coverUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
              : <div className="absolute inset-0 flex items-center justify-center"><BookMarked className="w-5 h-5 text-white/80" /></div>}
          </div>
          <div className="min-w-0 flex-1">
            {detail.isDefault && (
              <span className="inline-block mb-1 text-[10px] font-barlow font-bold uppercase tracking-wide text-forest-700 bg-forest-50 px-2 py-0.5 rounded-full">
                Diario di default
              </span>
            )}
            <input
              value={config.title}
              onChange={e => setConfig(c => c ? { ...c, title: e.target.value } : c)}
              placeholder="Titolo del Diario"
              className="block w-full font-display text-2xl font-bold text-stone-800 bg-transparent outline-none border-b border-transparent focus:border-stone-300 transition-colors"
            />
            <input
              value={config.subtitle}
              onChange={e => setConfig(c => c ? { ...c, subtitle: e.target.value } : c)}
              placeholder="Sottotitolo"
              className="block w-full font-lora italic text-sm text-stone-500 bg-transparent outline-none border-b border-transparent focus:border-stone-300 transition-colors mt-1"
            />
          </div>
        </div>

        {stats.count > 0 && (
          <div className="grid grid-cols-4 gap-2 mb-5 py-3 rounded-2xl bg-white border border-stone-200">
            <StatCell value={String(stats.count)} label="resoconti" />
            <StatCell value={stats.distanceKm.toFixed(1)} label="km" />
            <StatCell value={`+${Math.round(stats.elevationGain)}`} label="D+ m" />
            <StatCell value={formatDuration(stats.totalTimeSeconds)} label="tempo" />
          </div>
        )}

        {/* Raccolta — ogni Diario ne ha sempre una (è il suo scaffale), qui si cambia */}
        <div className="relative mb-6">
          <button
            onClick={() => setShelfPickerOpen(v => !v)}
            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-white border border-stone-200 hover:border-stone-300 transition-colors text-left"
          >
            <Layers className="w-4 h-4 text-stone-400 shrink-0" />
            <span className="flex-1 min-w-0 text-sm text-stone-600 truncate">
              {currentCollection ? <>In <b className="text-stone-800">{currentCollection.title}</b></> : 'Nessuna raccolta'}
            </span>
            {shelfBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin text-stone-400" /> : <ChevronDown className="w-3.5 h-3.5 text-stone-400" />}
          </button>
          {shelfError && <p className="text-xs text-red-600 mt-1">{shelfError}</p>}
          {shelfPickerOpen && (
            <div className="absolute z-10 top-full mt-1.5 left-0 right-0 bg-white rounded-xl border border-stone-200 shadow-lg overflow-hidden">
              {otherCollections.length === 0 ? (
                <p className="px-3.5 py-3 text-xs text-stone-400">Nessun&apos;altra raccolta — creane una da &ldquo;Diari&rdquo;.</p>
              ) : otherCollections.map(c => (
                <button key={c.id} onClick={() => moveToCollection(c.id)}
                  className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 text-sm text-stone-700 hover:bg-stone-50 transition-colors border-b border-stone-100 last:border-b-0">
                  {c.title}
                  <span className="text-xs text-stone-400">{c.volumeCount} diari</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Resoconti */}
        <div className="flex items-center justify-between mb-2.5">
          <span className="font-barlow font-bold text-[11px] tracking-[2px] uppercase text-stone-400">Resoconti</span>
          <span className="font-mono text-[11px] text-stone-400">{detail.reportage.length}</span>
        </div>
        {moveError && <p className="text-xs text-red-600 mb-2">{moveError}</p>}

        {detail.reportage.length === 0 ? (
          <p className="text-sm text-stone-400 italic py-6 text-center">Nessun resoconto ancora in questo Diario.</p>
        ) : (
          <div className="flex flex-col gap-2 mb-8">
            {detail.reportage.map(r => {
              const scoreLabel = r.trailScore != null ? ctsLabel(r.trailScore).label : null
              return (
                <div key={r.id} className="relative flex items-center gap-3 bg-white border border-stone-200 rounded-xl px-3 py-2.5">
                  <Link href={`/resoconto/${encodeURIComponent(r.id)}`} className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-11 h-11 rounded-lg shrink-0 overflow-hidden bg-stone-50 flex items-center justify-center">
                      {r.routePolyline && r.routePolyline.length > 1
                        ? <RouteThumb polyline={r.routePolyline} color="#2d7a3d" strokeWidth={2.5} />
                        : <Mountain className="w-4 h-4 text-stone-300" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm text-stone-800 truncate">{r.title}</p>
                      <div className="flex items-center flex-wrap gap-x-2.5 gap-y-0.5 mt-1 text-[11px] text-stone-400">
                        {metaHasHikingMetrics(r.metaType) && (
                          <>
                            <span className="inline-flex items-center gap-1"><Route className="w-3 h-3" /> {(r.distanceMeters / 1000).toFixed(1)} km</span>
                            <span className="inline-flex items-center gap-1"><TrendingUp className="w-3 h-3" /> +{Math.round(r.elevationGain)} m</span>
                            <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" /> {formatDuration(r.totalTimeSeconds)}</span>
                          </>
                        )}
                      </div>
                    </div>
                    {r.trailScore != null && (
                      <div className="shrink-0" title={scoreLabel ?? undefined}>
                        <TrailScoreGaugeBadge total={r.trailScore} safety={null} showLabel={false} size={38} />
                      </div>
                    )}
                    {!r.hasWrittenReport && (
                      <span className="shrink-0 inline-flex items-center gap-1 text-[10px] text-stone-400">
                        <Camera className="w-3 h-3" /> senza racconto
                      </span>
                    )}
                  </Link>
                  <button
                    onClick={() => setMoveOpenFor(v => v === r.id ? null : r.id)}
                    title="Sposta in un altro Diario"
                    className="shrink-0 p-1.5 rounded-lg text-stone-400 hover:text-forest-700 hover:bg-forest-50 transition-colors"
                  >
                    {movingId === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRightLeft className="w-4 h-4" />}
                  </button>
                  {moveOpenFor === r.id && (
                    <div className="absolute z-10 top-full right-0 mt-1.5 w-56 bg-white rounded-xl border border-stone-200 shadow-lg overflow-hidden">
                      <div className="flex items-center justify-between px-3 py-2 border-b border-stone-100">
                        <span className="text-[10px] font-barlow font-bold uppercase tracking-wide text-stone-400">Sposta in</span>
                        <button onClick={() => setMoveOpenFor(null)} className="text-stone-400 hover:text-stone-600"><X className="w-3.5 h-3.5" /></button>
                      </div>
                      {otherDiaries.length === 0 ? (
                        <p className="px-3 py-3 text-xs text-stone-400">Nessun altro Diario disponibile.</p>
                      ) : otherDiaries.map(d => (
                        <button key={d.id} onClick={() => moveReportage(r, d.id)}
                          className="w-full text-left px-3 py-2 text-sm text-stone-700 hover:bg-stone-50 transition-colors border-b border-stone-50 last:border-b-0">
                          {d.title}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Un Diario di default non si archivia né si elimina mai (stesso vincolo lato server) —
            deve sempre esistere come punto di atterraggio. */}
        {!detail.isDefault && (
          <div className="pt-5 border-t border-stone-200 space-y-5">
            <div>
              {detail.archivedAt ? (
                <button onClick={() => setArchived(null)} disabled={archiveBusy}
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-stone-600 hover:bg-stone-100 transition-colors text-sm font-medium disabled:opacity-60">
                  {archiveBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArchiveRestore className="w-4 h-4" />}
                  Riattiva questo Diario
                </button>
              ) : !archiveConfirming ? (
                <button onClick={() => setArchiveConfirming(true)}
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-stone-600 hover:bg-stone-100 transition-colors text-sm font-medium">
                  <Archive className="w-4 h-4" /> Archivia questo Diario
                </button>
              ) : (
                <div className="bg-stone-100 border border-stone-200 rounded-2xl p-4 max-w-lg space-y-3">
                  <p className="text-sm text-stone-700">
                    Il Diario esce dall&apos;elenco principale di &ldquo;Diari&rdquo; — resta comunque
                    raggiungibile da qui e da qualunque raccolta lo contenga, e si può riattivare in
                    qualsiasi momento.
                  </p>
                  {archiveError && <p className="text-sm text-red-600">{archiveError}</p>}
                  <div className="flex items-center gap-2">
                    <button onClick={() => setArchived(new Date().toISOString())} disabled={archiveBusy}
                      className="flex items-center gap-2 px-4 py-2 bg-stone-700 hover:bg-stone-800 rounded-xl text-sm font-medium text-white transition-colors disabled:opacity-60">
                      {archiveBusy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Archivia
                    </button>
                    <button onClick={() => setArchiveConfirming(false)} disabled={archiveBusy} className="text-sm text-stone-500 hover:text-stone-700 transition-colors">
                      Annulla
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div>
              {!deleteOpen ? (
                <button onClick={() => setDeleteOpen(true)}
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-red-600 hover:bg-red-50 transition-colors text-sm font-medium">
                  <Trash2 className="w-4 h-4" /> Elimina questo Diario
                </button>
              ) : (
                <div className="bg-red-50 border border-red-200 rounded-2xl p-4 max-w-lg space-y-3">
                  <p className="text-sm text-red-800 font-medium">Cosa succede ai Resoconti di questo Diario?</p>
                  {deleteError && <p className="text-sm text-red-600">{deleteError}</p>}
                  <div className="flex flex-col gap-2">
                    <button onClick={() => runDelete('migrate')} disabled={deleteBusy !== null}
                      className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-red-200 hover:border-red-300 rounded-xl text-sm font-medium text-stone-700 transition-colors disabled:opacity-60">
                      {deleteBusy === 'migrate' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      Sposta i Resoconti nel Diario di default, poi elimina questo Diario
                    </button>
                    <button onClick={() => runDelete('deleteAll')} disabled={deleteBusy !== null}
                      className="flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 rounded-xl text-sm font-medium text-white transition-colors disabled:opacity-60">
                      {deleteBusy === 'deleteAll' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      Elimina tutto — Resoconti inclusi (foto, video, racconti)
                    </button>
                    <button onClick={() => setDeleteOpen(false)} disabled={deleteBusy !== null} className="text-sm text-stone-500 hover:text-stone-700 transition-colors">
                      Annulla
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function StatCell({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <p className="font-mono text-base font-bold text-stone-800 leading-none">{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-stone-400 mt-1">{label}</p>
    </div>
  )
}
