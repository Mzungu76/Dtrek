'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowDown, ArrowLeft, ArrowUp, Loader2, Plus, Trash2, X } from 'lucide-react'
import Navbar, { MOBILE_TOPBAR_SPACER } from '@/components/Navbar'
import type { CollectionDetail, CollectionDetailDiario } from '@/app/api/collections/[id]/route'
import type { DiarySummary } from '@/app/api/diaries/route'

// Composizione di una Raccolta — restyling nei token attuali di app/raccolte/[id]/page.tsx (la
// pagina "Taccuino Botanico" rimossa nel ripristino al layout PR #741), senza la sezione di
// pubblicazione (token/link pubblico): non richiesta in questa fase, resta un passo successivo —
// PATCH /api/collections/[id]/token esiste già quando servirà.
//
// Niente bottone "rimuovi" isolato: un Diario sta sempre su una Raccolta (UNIQUE(diary_id) su
// collection_diaries) — si sposta scegliendolo dal picker di un'altra raccolta, non si toglie e
// basta (il server rifiuterebbe comunque la richiesta, vedi PUT /api/collections/[id]/diari).
function EditableField({ label, value, onSave, placeholder, big }: {
  label: string; value: string; onSave: (v: string) => void; placeholder?: string; big?: boolean
}) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  return (
    <div className="mb-4">
      <p className="font-barlow font-bold uppercase tracking-widest text-[10px] text-stone-400 mb-1.5">{label}</p>
      <input
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => { if (draft !== value) onSave(draft) }}
        placeholder={placeholder}
        className={big
          ? 'w-full bg-transparent outline-none border-b border-stone-200 focus:border-forest-400 font-display text-2xl font-bold text-stone-800 pb-1.5 transition-colors'
          : 'w-full bg-transparent outline-none border-b border-stone-200 focus:border-forest-400 font-lora italic text-sm text-stone-600 pb-1.5 transition-colors'}
      />
    </div>
  )
}

const SPINE_COLORS = ['#377134', '#c05a17', '#20592b', '#9f4315']

function VolumeRow({ volume, index, total, onMoveUp, onMoveDown }: {
  volume: CollectionDetailDiario; index: number; total: number; onMoveUp: () => void; onMoveDown: () => void
}) {
  return (
    <div className="flex items-center gap-3.5 rounded-2xl pl-0 pr-3.5 py-3 bg-white border border-stone-200 shadow-sm overflow-hidden">
      <div className="w-2 self-stretch shrink-0" style={{ background: SPINE_COLORS[index % SPINE_COLORS.length] }} />
      <span className="font-mono font-bold text-xs text-stone-300 w-4 shrink-0">{index + 1}</span>
      <Link href={`/diario/${encodeURIComponent(volume.id)}`} className="min-w-0 flex-1">
        <p className="truncate font-display font-semibold text-[15px] text-stone-800">{volume.title}</p>
        <p className="text-xs text-stone-400 mt-0.5">{volume.reportageCount} reportage · {(volume.distanceMeters / 1000).toFixed(0)} km</p>
      </Link>
      <div className="flex items-center gap-0.5 shrink-0">
        <button type="button" onClick={onMoveUp} disabled={index === 0} className="p-1.5 rounded-lg disabled:opacity-25 text-stone-400 hover:text-stone-600 hover:bg-stone-50 transition-colors" aria-label="Sposta su">
          <ArrowUp className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={onMoveDown} disabled={index === total - 1} className="p-1.5 rounded-lg disabled:opacity-25 text-stone-400 hover:text-stone-600 hover:bg-stone-50 transition-colors" aria-label="Sposta giù">
          <ArrowDown className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

export default function RaccoltaComposerPage() {
  const params = useParams<{ id: string }>()
  const collectionId = params.id
  const router = useRouter()

  const [collection, setCollection] = useState<CollectionDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reordering, setReordering] = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  const [allDiari, setAllDiari] = useState<DiarySummary[] | null>(null)
  const [deleteConfirming, setDeleteConfirming] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  function loadCollection() {
    return fetch(`/api/collections/${encodeURIComponent(collectionId)}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(setCollection)
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
  }

  useEffect(() => { loadCollection() }, [collectionId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function patchField(field: 'title' | 'subtitle', value: string) {
    setCollection(c => c ? { ...c, [field]: value } : c)
    try {
      const res = await fetch(`/api/collections/${encodeURIComponent(collectionId)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [field]: value }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    } catch {
      loadCollection()
    }
  }

  async function saveOrder(diaryIds: string[]) {
    setReordering(true)
    try {
      const res = await fetch(`/api/collections/${encodeURIComponent(collectionId)}/diari`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ diaryIds }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      await loadCollection()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setReordering(false)
    }
  }

  function moveVolume(index: number, direction: -1 | 1) {
    if (!collection) return
    const ids = collection.diari.map(d => d.id)
    const target = index + direction
    if (target < 0 || target >= ids.length) return
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    saveOrder(ids)
  }

  function addVolume(diaryId: string) {
    if (!collection) return
    setShowPicker(false)
    saveOrder([...collection.diari.map(d => d.id), diaryId])
  }

  function openPicker() {
    setShowPicker(true)
    if (allDiari === null) {
      fetch('/api/diaries')
        .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
        .then(setAllDiari)
        .catch(() => setAllDiari([]))
    }
  }

  const pickerOptions = useMemo(() => {
    if (!collection || !allDiari) return []
    const already = new Set(collection.diari.map(d => d.id))
    return allDiari.filter(d => !already.has(d.id) && !d.archivedAt)
  }, [collection, allDiari])

  async function deleteCollection() {
    setDeleting(true); setDeleteError(null)
    try {
      const res = await fetch(`/api/collections/${encodeURIComponent(collectionId)}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setDeleteError(data.error ?? `HTTP ${res.status}`); setDeleting(false); return }
      router.push('/raccolte')
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : String(e))
      setDeleting(false)
    }
  }

  if (error && !collection) {
    return (
      <div className={`min-h-screen bg-stone-50 flex items-center justify-center px-6 text-center ${MOBILE_TOPBAR_SPACER}`}>
        <Navbar />
        <p className="text-sm text-red-600">Impossibile caricare questa raccolta: {error}</p>
      </div>
    )
  }

  return (
    <div className={`min-h-screen bg-stone-50 ${MOBILE_TOPBAR_SPACER}`}>
      <Navbar />
      <div className="max-w-2xl mx-auto px-4 sm:px-8 pb-16">
        <Link href="/raccolte" className="inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-700 mt-3 mb-5 transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> Raccolte
        </Link>

        {!collection ? (
          <div className="flex items-center justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-stone-400" /></div>
        ) : (
          <>
            <div className="flex items-start gap-4 mb-7">
              <div className="flex shrink-0 w-14 justify-center pt-1">
                {Array.from({ length: Math.min(3, Math.max(1, collection.diari.length)) }).map((_, i) => (
                  <div key={i} className="w-9 h-12 rounded-[6px] -mr-4 first:ml-0 shadow-sm ring-1 ring-black/5"
                    style={{
                      background: i % 2 === 0 ? 'linear-gradient(160deg,#8cc894,#277134)' : 'linear-gradient(160deg,#e9ab64,#9f4315)',
                      transform: `rotate(${i % 2 === 0 ? -7 : 5}deg)`,
                    }} />
                ))}
              </div>
              <div className="flex-1 min-w-0">
                <EditableField label="Titolo" value={collection.title} onSave={v => patchField('title', v)} big />
                <EditableField label="Sottotitolo" value={collection.subtitle} onSave={v => patchField('subtitle', v)} placeholder="es. Tre stagioni sullo stesso crinale" />
              </div>
            </div>

            <div className="flex items-center justify-between mb-3.5">
              <span className="font-barlow font-bold text-xs tracking-[2px] uppercase text-stone-400">Diari ({collection.diari.length})</span>
              {reordering && <Loader2 className="w-3.5 h-3.5 animate-spin text-forest-600" />}
            </div>

            <div className="flex flex-col gap-2.5 mb-4">
              {collection.diari.map((d, i) => (
                <VolumeRow key={d.id} volume={d} index={i} total={collection.diari.length}
                  onMoveUp={() => moveVolume(i, -1)} onMoveDown={() => moveVolume(i, 1)} />
              ))}
              {collection.diari.length === 0 && (
                <p className="font-lora italic text-sm text-stone-400 py-4">Ancora nessun Diario — aggiungine uno qui sotto.</p>
              )}
            </div>

            {showPicker ? (
              <div className="rounded-2xl mb-8 bg-white border border-stone-200 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-stone-100">
                  <p className="text-[11px] font-barlow font-bold uppercase tracking-wide text-stone-400">Aggiungi un Diario</p>
                  <button type="button" onClick={() => setShowPicker(false)} className="text-stone-400 hover:text-stone-600"><X className="w-4 h-4" /></button>
                </div>
                {allDiari === null ? (
                  <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-stone-400" /></div>
                ) : pickerOptions.length === 0 ? (
                  <p className="px-4 py-4 text-center text-xs text-stone-400">Nessun altro Diario disponibile — o sono già tutti in questa raccolta.</p>
                ) : (
                  pickerOptions.map(d => (
                    <button key={d.id} type="button" onClick={() => addVolume(d.id)}
                      className="w-full flex items-center justify-between px-4 py-3 text-left border-b border-stone-50 last:border-b-0 hover:bg-stone-50 transition-colors">
                      <span className="font-display font-semibold text-sm text-stone-700">{d.title}</span>
                      <span className="text-xs text-stone-400 text-right">
                        {d.reportageCount} reportage
                        {d.shelfId && d.shelfId !== collectionId && <><br />sposta qui dalla sua raccolta</>}
                      </span>
                    </button>
                  ))
                )}
              </div>
            ) : (
              <button type="button" onClick={openPicker}
                className="flex items-center justify-center gap-2 h-12 rounded-2xl w-full mb-8 border-[1.5px] border-dashed border-stone-300 text-stone-500 hover:border-stone-400 hover:text-stone-600 hover:bg-white transition-colors font-barlow font-bold uppercase tracking-wide text-xs">
                <Plus className="w-4 h-4" /> Aggiungi un Diario
              </button>
            )}

            <div className="pt-6 border-t border-stone-200">
              {!deleteConfirming ? (
                <button onClick={() => setDeleteConfirming(true)} className="inline-flex items-center gap-2 text-sm text-red-600 hover:text-red-700 transition-colors">
                  <Trash2 className="w-4 h-4" /> Elimina questa raccolta
                </button>
              ) : (
                <div className="rounded-xl px-4 py-3 space-y-2 bg-red-50 border border-red-200">
                  <p className="text-xs text-red-800">
                    Una raccolta si elimina solo se è vuota — sposta prima i Diari contenuti in un&apos;altra raccolta.
                  </p>
                  {deleteError && <p className="text-xs font-bold text-red-800">{deleteError}</p>}
                  <div className="flex items-center gap-3">
                    <button onClick={deleteCollection} disabled={deleting || collection.diari.length > 0}
                      className="px-3.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 transition-colors">
                      {deleting ? 'Elimino…' : 'Elimina'}
                    </button>
                    <button onClick={() => { setDeleteConfirming(false); setDeleteError(null) }} disabled={deleting} className="text-xs text-stone-500 hover:text-stone-700 transition-colors">
                      Annulla
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
