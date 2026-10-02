'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Archive, ArchiveRestore, ArrowRightLeft, Camera, ChevronDown, Clock,
  Layers, Loader2, Mountain, Plus, Route, Trash2, TrendingUp, X,
} from 'lucide-react'
import RouteThumb from '@/components/RouteThumb'
import { TrailScoreGaugeBadge } from '@/components/TrailScoreGaugeBadge'
import { ctsLabel } from '@/lib/trailScore'
import { formatDuration } from '@/lib/tcxParser'
import { metaHasHikingMetrics } from '@/lib/metaTypes'
import type { DiarioDetail, DiarioReportageRow } from '@/app/api/diaries/[id]/route'
import type { DiarySummary } from '@/app/api/diaries/route'
import type { CollectionSummary } from '@/app/api/collections/route'

interface Props {
  diaryId: string
  /** Chiamato dopo un'eliminazione riuscita — se assente, naviga a /diario (uso standalone).
   *  Il chiamante che ospita questo contenuto dentro RouteHub (app/diario/page.tsx) lo passa per
   *  chiudere Screen 2 e aggiornare la propria lista invece di una navigazione che non serve più
   *  (si è già su /diario). */
  onDeleted?: () => void
  /** Chiamato dopo qualunque cambiamento che possa rendere stantie le liste Diari/Raccolte del
   *  chiamante (spostamento di raccolta, archiviazione, un Resoconto spostato altrove) — un
   *  segnale grezzo "ricarica pure", non un diff puntuale: i refetch qui sono economici. */
  onChanged?: () => void
}

// Colore delle tracce nelle miniature — non più il verde forest delle card chiare di prima: su uno
// sfondo scuro (vedi sotto) un verde scuro sparirebbe, qui serve un tratto chiaro che si veda sulla
// stessa base #0b1a24 usata dall'elenco verticale di Guida/Resoconto/Diari.
const THUMB_TRACK_COLOR = '#7dd3fc'

/** Il contenuto del Sommario di un Diario — apribile anche vuoto (nessun Reportage). Stesso sfondo
 *  blu scuro ed elenco verticale a righe (non più card chiare) dell'elenco "Tutti i ___" di
 *  Guida/Resoconto/Diari (ExpandedGalleryList) e della copertina di /diario — un'unica identità
 *  visiva invece di una pagina chiara isolata in mezzo a pagine scure. Non disegna una propria
 *  copertina/testata: quella vive ora sulla copertina a schermo intero di /diario (RouteHub,
 *  Screen 1) o nell'intestazione minima della rotta standalone /diario/[id] — questo componente è
 *  il corpo condiviso da entrambe. Niente ricerca/ordinamento/Mete in programma: nessuna pagina in
 *  app crea o sceglie ancora una Meta non ancora camminata (l'upload attribuisce sempre al Diario
 *  di default, lib/activitySave.ts), quindi quella lista sarebbe quasi sempre vuota e non avrebbe
 *  dove atterrare un tap.
 */
export default function DiarioSommarioContent({ diaryId, onDeleted, onChanged }: Props) {
  const router = useRouter()

  const [detail, setDetail] = useState<DiarioDetail | null>(null)
  const [diaries, setDiaries] = useState<DiarySummary[]>([])
  const [collections, setCollections] = useState<CollectionSummary[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)

  // Nome del Diario (diaries.title) — modificabile solo qui: la copertina a schermo intero di
  // /diario non ha più l'icona a matita che apriva un popover di modifica (rimossa perché editava
  // in realtà il titolo della copertina del libro impaginato, DiaryConfig, non il nome vero e
  // proprio del Diario, che finora non era modificabile da nessuna parte).
  const [titleDraft, setTitleDraft] = useState('')
  const [titleError, setTitleError] = useState<string | null>(null)
  useEffect(() => { setTitleDraft(detail?.title ?? '') }, [detail?.title])

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

  const [addPickerOpen, setAddPickerOpen] = useState(false)
  const [addCandidates, setAddCandidates] = useState<DiarioReportageRow[] | null>(null)
  const [addLoading, setAddLoading] = useState(false)
  const [addBusy, setAddBusy] = useState<string | null>(null)
  const [addError, setAddError] = useState<string | null>(null)

  const onChangedRef = useRef(onChanged)
  onChangedRef.current = onChanged

  function load() {
    Promise.all([
      fetch(`/api/diaries/${encodeURIComponent(diaryId)}`).then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))),
      fetch('/api/diaries').then(r => r.ok ? r.json() : []),
      fetch('/api/collections').then(r => r.ok ? r.json() : []),
    ]).then(([d, ds, cs]) => {
      setDetail(d as DiarioDetail)
      setDiaries(ds as DiarySummary[])
      setCollections(cs as CollectionSummary[])
    }).catch(e => setLoadError(e instanceof Error ? e.message : String(e)))
  }

  useEffect(() => { load() }, [diaryId]) // eslint-disable-line react-hooks/exhaustive-deps

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
  // Il Diario di default è dove ogni upload atterra finché l'utente non lo sposta altrove
  // (lib/activitySave.ts, getDefaultDiaryId) — di fatto la "casella d'ingresso" dei Resoconti non
  // ancora organizzati in un Diario specifico, quindi è la fonte da cui pescare qui.
  const defaultDiary = useMemo(() => diaries.find(d => d.isDefault) ?? null, [diaries])

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
      onChangedRef.current?.()
    } catch (e) {
      setMoveError(e instanceof Error ? e.message : String(e))
    } finally {
      setMovingId(null)
    }
  }

  function openAddPicker() {
    if (!defaultDiary) return
    setAddPickerOpen(true)
    setAddError(null)
    setAddLoading(true)
    fetch(`/api/diaries/${encodeURIComponent(defaultDiary.id)}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((d: DiarioDetail) => setAddCandidates(d.reportage))
      .catch(e => setAddError(e instanceof Error ? e.message : String(e)))
      .finally(() => setAddLoading(false))
  }

  // Stesso meccanismo di moveReportage (sposta la Meta, non il Reportage) — qui la direzione è
  // "verso" invece che "da" questo Diario.
  async function addReportage(row: DiarioReportageRow) {
    if (!row.percorsoId) {
      setAddError('Questo Reportage è antecedente ai Diari e non ha una Meta da spostare.')
      return
    }
    setAddBusy(row.id); setAddError(null)
    try {
      const res = await fetch('/api/planned', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.percorsoId, diaryId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? data.message ?? `HTTP ${res.status}`)
      setDetail(d => d ? { ...d, reportage: [row, ...d.reportage] } : d)
      setAddCandidates(c => c ? c.filter(r => r.id !== row.id) : c)
      onChangedRef.current?.()
    } catch (e) {
      setAddError(e instanceof Error ? e.message : String(e))
    } finally {
      setAddBusy(null)
    }
  }

  async function saveTitle(value: string) {
    const trimmed = value.trim()
    if (!trimmed || trimmed === detail?.title) { setTitleDraft(detail?.title ?? ''); return }
    setTitleError(null)
    try {
      const res = await fetch(`/api/diaries/${encodeURIComponent(diaryId)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: trimmed }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      setDetail(d => d ? { ...d, title: trimmed } : d)
      onChangedRef.current?.()
    } catch (e) {
      setTitleError(e instanceof Error ? e.message : String(e))
      setTitleDraft(detail?.title ?? '')
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
      fetch('/api/collections').then(r => r.ok ? r.json() : []).then(setCollections)
      setShelfPickerOpen(false)
      onChangedRef.current?.()
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
      onChangedRef.current?.()
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
      if (onDeleted) onDeleted()
      else router.push('/diario')
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : String(e))
      setDeleteBusy(null)
    }
  }

  if (loadError) {
    return (
      <div className="min-h-full bg-[#0b1a24] flex items-center justify-center px-4 py-16">
        <p className="text-sm text-red-400 text-center">Impossibile caricare questo Diario: {loadError}</p>
      </div>
    )
  }

  if (!detail) {
    return (
      <div className="min-h-full bg-[#0b1a24] flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-white/40" />
      </div>
    )
  }

  return (
    <div className="min-h-full bg-[#0b1a24]">
      <div className="max-w-2xl mx-auto px-4 sm:px-8 py-5">
        <div className="mb-5">
          <input
            value={titleDraft}
            onChange={e => setTitleDraft(e.target.value)}
            onBlur={e => saveTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
            placeholder="Titolo del Diario"
            className="w-full bg-transparent outline-none border-b border-white/15 focus:border-white/40 font-display text-2xl font-bold text-white pb-1.5 transition-colors"
          />
          {titleError && <p className="text-xs text-red-400 mt-1">{titleError}</p>}
        </div>

        {stats.count > 0 && (
          <div className="grid grid-cols-4 gap-2 mb-6 py-4 rounded-2xl bg-white/5 border border-white/10">
            <StatCell value={String(stats.count)} label="reportage" />
            <StatCell value={stats.distanceKm.toFixed(1)} label="km" />
            <StatCell value={`+${Math.round(stats.elevationGain)}`} label="D+ m" />
            <StatCell value={formatDuration(stats.totalTimeSeconds)} label="tempo" />
          </div>
        )}

        {/* Raccolta — ogni Diario ne ha sempre una (è il suo scaffale), qui si cambia */}
        <div className="relative mb-8">
          <button
            onClick={() => setShelfPickerOpen(v => !v)}
            className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-white/5 border border-white/10 hover:border-white/25 transition-colors text-left"
          >
            <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
              <Layers className="w-4 h-4 text-white/70" />
            </div>
            <span className="flex-1 min-w-0 text-sm text-white/60 truncate">
              {currentCollection ? <>In <b className="text-white">{currentCollection.title}</b></> : 'Nessuna raccolta'}
            </span>
            {shelfBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin text-white/40" /> : <ChevronDown className="w-3.5 h-3.5 text-white/40" />}
          </button>
          {shelfError && <p className="text-xs text-red-400 mt-1">{shelfError}</p>}
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

        {/* Reportage */}
        <div className="flex items-center justify-between mb-1">
          <span className="font-barlow font-bold text-xs tracking-[2px] uppercase text-white/40">Reportage</span>
          <div className="flex items-center gap-3">
            {!detail.isDefault && defaultDiary && (
              <button
                onClick={openAddPicker}
                className="flex items-center gap-1 text-xs font-semibold text-sky-400 hover:text-sky-300 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Aggiungi
              </button>
            )}
            <span className="font-mono text-xs text-white/40">{detail.reportage.length}</span>
          </div>
        </div>
        {moveError && <p className="text-xs text-red-400 mb-2">{moveError}</p>}

        {detail.reportage.length === 0 ? (
          <div className="py-8 text-center">
            <p className="font-lora italic text-sm text-white/40">Nessun reportage ancora in questo Diario.</p>
            {!detail.isDefault && defaultDiary && (
              <button
                onClick={openAddPicker}
                className="inline-flex items-center gap-1.5 mt-3 px-3.5 py-1.5 rounded-full bg-white/10 text-sky-300 hover:bg-white/15 transition-colors text-xs font-semibold"
              >
                <Plus className="w-3.5 h-3.5" /> Aggiungi un resoconto
              </button>
            )}
          </div>
        ) : (
          <div className="mb-10">
            {detail.reportage.map(r => {
              const scoreLabel = r.trailScore != null ? ctsLabel(r.trailScore).label : null
              return (
                <div key={r.id} className="relative flex items-center gap-3.5 py-3 border-b border-white/10">
                  <Link href={r.href ?? `/resoconto/${encodeURIComponent(r.id)}`} className="flex items-center gap-3.5 flex-1 min-w-0">
                    <div className="w-14 h-14 rounded-xl shrink-0 overflow-hidden bg-white/5 flex items-center justify-center">
                      {r.routePolyline && r.routePolyline.length > 1
                        ? <RouteThumb polyline={r.routePolyline} color={THUMB_TRACK_COLOR} strokeWidth={2.5} />
                        : <Mountain className="w-5 h-5 text-white/25" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-display font-semibold text-[15px] text-white truncate">{r.title}</p>
                      <div className="flex items-center flex-wrap gap-x-2.5 gap-y-0.5 mt-1.5 text-[11px] text-white/50">
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
                      <span className="shrink-0 inline-flex items-center gap-1 text-[10px] text-white/35">
                        <Camera className="w-3 h-3" /> senza racconto
                      </span>
                    )}
                  </Link>
                  <button
                    onClick={() => setMoveOpenFor(v => v === r.id ? null : r.id)}
                    title="Sposta in un altro Diario"
                    className="shrink-0 p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
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
          <div className="pt-7 border-t border-white/10 space-y-5">
            <div>
              {detail.archivedAt ? (
                <button onClick={() => setArchived(null)} disabled={archiveBusy}
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-white/70 hover:bg-white/10 transition-colors text-sm font-medium disabled:opacity-60">
                  {archiveBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArchiveRestore className="w-4 h-4" />}
                  Riattiva questo Diario
                </button>
              ) : !archiveConfirming ? (
                <button onClick={() => setArchiveConfirming(true)}
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-white/70 hover:bg-white/10 transition-colors text-sm font-medium">
                  <Archive className="w-4 h-4" /> Archivia questo Diario
                </button>
              ) : (
                <div className="bg-white/5 border border-white/10 rounded-2xl p-4 max-w-lg space-y-3">
                  <p className="text-sm text-white/80">
                    Il Diario esce dall&apos;elenco principale di &ldquo;Diari&rdquo; — resta comunque
                    raggiungibile da qui e da qualunque raccolta lo contenga, e si può riattivare in
                    qualsiasi momento.
                  </p>
                  {archiveError && <p className="text-sm text-red-400">{archiveError}</p>}
                  <div className="flex items-center gap-2">
                    <button onClick={() => setArchived(new Date().toISOString())} disabled={archiveBusy}
                      className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-sm font-medium text-white transition-colors disabled:opacity-60">
                      {archiveBusy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Archivia
                    </button>
                    <button onClick={() => setArchiveConfirming(false)} disabled={archiveBusy} className="text-sm text-white/50 hover:text-white/80 transition-colors">
                      Annulla
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div>
              {!deleteOpen ? (
                <button onClick={() => setDeleteOpen(true)}
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-red-400 hover:bg-red-500/10 transition-colors text-sm font-medium">
                  <Trash2 className="w-4 h-4" /> Elimina questo Diario
                </button>
              ) : (
                <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 max-w-lg space-y-3">
                  <p className="text-sm text-red-300 font-medium">Cosa succede ai Reportage di questo Diario?</p>
                  {deleteError && <p className="text-sm text-red-400">{deleteError}</p>}
                  <div className="flex flex-col gap-2">
                    <button onClick={() => runDelete('migrate')} disabled={deleteBusy !== null}
                      className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white/5 border border-red-400/30 hover:border-red-400/60 rounded-xl text-sm font-medium text-white transition-colors disabled:opacity-60">
                      {deleteBusy === 'migrate' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      Sposta i Reportage nel Diario di default, poi elimina questo Diario
                    </button>
                    <button onClick={() => runDelete('deleteAll')} disabled={deleteBusy !== null}
                      className="flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 rounded-xl text-sm font-medium text-white transition-colors disabled:opacity-60">
                      {deleteBusy === 'deleteAll' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      Elimina tutto — Reportage inclusi (foto, video, racconti)
                    </button>
                    <button onClick={() => setDeleteOpen(false)} disabled={deleteBusy !== null} className="text-sm text-white/50 hover:text-white/80 transition-colors">
                      Annulla
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {addPickerOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 flex items-end sm:items-center justify-center"
          onClick={() => setAddPickerOpen(false)}
        >
          <div
            className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md max-h-[80vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100 shrink-0">
              <span className="font-display font-bold text-sm text-stone-800">
                Aggiungi da &ldquo;{defaultDiary?.title}&rdquo;
              </span>
              <button onClick={() => setAddPickerOpen(false)} className="text-stone-400 hover:text-stone-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            {addError && <p className="text-xs text-red-600 px-5 pt-3">{addError}</p>}
            <div className="flex-1 overflow-y-auto px-5 py-3">
              {addLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-stone-400" /></div>
              ) : !addCandidates || addCandidates.length === 0 ? (
                <p className="font-lora italic text-sm text-stone-400 py-8 text-center">
                  Nessun resoconto ancora disponibile nel Diario di default.
                </p>
              ) : (
                <div className="flex flex-col gap-2 pb-4">
                  {addCandidates.map(r => (
                    <button
                      key={r.id}
                      onClick={() => addReportage(r)}
                      disabled={addBusy === r.id}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-stone-200 hover:border-forest-300 hover:bg-forest-50/40 transition-colors text-left disabled:opacity-60"
                    >
                      <div className="w-10 h-10 rounded-lg shrink-0 overflow-hidden bg-stone-50 flex items-center justify-center">
                        {r.routePolyline && r.routePolyline.length > 1
                          ? <RouteThumb polyline={r.routePolyline} color="#2d7a3d" strokeWidth={2} />
                          : <Mountain className="w-4 h-4 text-stone-300" />}
                      </div>
                      <span className="flex-1 min-w-0 text-sm text-stone-700 truncate">{r.title}</span>
                      {addBusy === r.id ? <Loader2 className="w-4 h-4 animate-spin text-forest-600" /> : <Plus className="w-4 h-4 text-forest-600" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function StatCell({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <p className="font-mono text-lg font-bold text-white leading-none">{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-white/40 mt-1.5">{label}</p>
    </div>
  )
}
