'use client'
// Composizione di una Raccolta — docs/raccolte-pubblicazione-piano.md, Fase 3d. Titolo/sottotitolo/
// prefazione, l'elenco ordinato dei volumi (aggiungi/rimuovi/riordina), pubblicazione.
//
// Riordino con frecce su/giù, non trascinamento: @dnd-kit non è tra le dipendenze del progetto e
// non vale introdurne una per riordinare tre o quattro elementi (decisione già presa nel piano).
//
// Nessun upload di copertina in questa fase: PATCH /api/collections/[id] accetta già `coverUrl`,
// ma la UI per caricarla non è ancora qui — una raccolta senza copertina mostra il gradiente di
// default sul sito pubblico, non uno stato rotto.
import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, ArrowUp, ArrowDown, Copy, ExternalLink, Link2Off, Loader2, Plus, Share2, Trash2, X,
} from 'lucide-react'
import Navbar, { MOBILE_BOTTOMBAR_SPACER } from '@/components/Navbar'
import { TaccuinoPaperTexture, TaccuinoRuledLines, TACCUINO_PAPER, TACCUINO_INK, TACCUINO_ACCENT, TACCUINO_ACCENT_TINT, FONT_HAND, INK_ABSORB_STYLE } from '@/lib/taccuinoTokens'
import { FONT } from '@/lib/designTokens'
import type { CollectionDetail, CollectionDetailDiario } from '@/app/api/collections/[id]/route'
import type { DiarySummary } from '@/lib/diari/aggregateDiaries'

function EditableField({ label, value, onSave, multiline, placeholder }: {
  label: string
  value: string
  onSave: (v: string) => void
  multiline?: boolean
  placeholder?: string
}) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])

  const commonProps = {
    value: draft,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(e.target.value),
    onBlur: () => { if (draft !== value) onSave(draft) },
    placeholder,
    className: 'w-full bg-transparent outline-none border-b',
    style: { borderColor: TACCUINO_PAPER.cardBorder, color: TACCUINO_INK.typed, fontFamily: FONT.body, fontSize: 14, paddingBottom: 4 },
  }

  return (
    <div className="mb-4">
      <p style={{ fontFamily: FONT.barlow, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: 10, color: TACCUINO_INK.handMuted }} className="mb-1.5">
        {label}
      </p>
      {multiline
        ? <textarea rows={4} {...commonProps} />
        : <input type="text" {...commonProps} />}
    </div>
  )
}

function VolumeRow({ volume, index, total, onMoveUp, onMoveDown, onRemove }: {
  volume: CollectionDetailDiario
  index: number
  total: number
  onMoveUp: () => void
  onMoveDown: () => void
  onRemove: () => void
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl px-3 py-2.5" style={{ background: TACCUINO_PAPER.card, border: `1px solid ${TACCUINO_PAPER.cardBorder}` }}>
      <span style={{ fontFamily: FONT.mono, fontWeight: 700, fontSize: 11, color: TACCUINO_INK.handMuted, width: 18 }}>{index + 1}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate" style={{ fontFamily: FONT.lora, fontWeight: 600, fontSize: 13.5, color: TACCUINO_INK.typed }}>{volume.title}</p>
        <p style={{ fontSize: 10, color: TACCUINO_INK.handMuted }}>
          {volume.reportageCount} reportage · {(volume.distanceMeters / 1000).toFixed(0)} km
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button type="button" onClick={onMoveUp} disabled={index === 0} className="p-1.5 rounded disabled:opacity-30" style={{ color: TACCUINO_INK.handMuted }} aria-label="Sposta su">
          <ArrowUp className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={onMoveDown} disabled={index === total - 1} className="p-1.5 rounded disabled:opacity-30" style={{ color: TACCUINO_INK.handMuted }} aria-label="Sposta giù">
          <ArrowDown className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={onRemove} className="p-1.5 rounded" style={{ color: TACCUINO_INK.handMuted }} aria-label="Rimuovi dalla raccolta">
          <X className="w-3.5 h-3.5" />
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
  const [shareToken, setShareToken] = useState<string | null>(null)
  const [publishing, setPublishing] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [copyOk, setCopyOk] = useState(false)
  const [reordering, setReordering] = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  const [allDiari, setAllDiari] = useState<DiarySummary[] | null>(null)
  const [deleteConfirming, setDeleteConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)

  function loadCollection() {
    return fetch(`/api/collections/${encodeURIComponent(collectionId)}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(setCollection)
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
  }

  useEffect(() => { loadCollection() }, [collectionId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetch(`/api/collections/${encodeURIComponent(collectionId)}/token`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(data => setShareToken(data.shareToken ?? null))
      .catch(() => { /* il token si vede solo dopo la pubblicazione — un fallimento qui non blocca la pagina */ })
  }, [collectionId])

  async function patchField(field: 'title' | 'subtitle' | 'preface', value: string) {
    setCollection(c => c ? { ...c, [field]: value } : c) // ottimistico
    try {
      const res = await fetch(`/api/collections/${encodeURIComponent(collectionId)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [field]: value }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    } catch {
      loadCollection() // il server non ha una verità diversa da mostrare, solo il rollback
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

  function removeVolume(diaryId: string) {
    if (!collection) return
    saveOrder(collection.diari.filter(d => d.id !== diaryId).map(d => d.id))
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

  async function publish() {
    setPublishing(true); setPublishError(null)
    try {
      const res = await fetch(`/api/collections/${encodeURIComponent(collectionId)}/token`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{}',
      })
      if (!res.ok) throw new Error(`Pubblicazione non riuscita (${res.status})`)
      const data = await res.json() as { shareToken?: string }
      if (data.shareToken) setShareToken(data.shareToken)
    } catch (e) {
      setPublishError(e instanceof Error ? e.message : String(e))
    } finally {
      setPublishing(false)
    }
  }

  async function revoke() {
    await fetch(`/api/collections/${encodeURIComponent(collectionId)}/token`, { method: 'DELETE' })
    setShareToken(null)
  }

  async function deleteCollection() {
    setDeleting(true)
    try {
      const res = await fetch(`/api/collections/${encodeURIComponent(collectionId)}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      router.push('/raccolte')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setDeleting(false)
    }
  }

  const publicUrl = shareToken && typeof window !== 'undefined' ? `${window.location.origin}/leggi/c/${shareToken}` : ''

  if (error && !collection) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 text-center" style={{ color: '#b3413a' }}>
        <TaccuinoPaperTexture />
        Impossibile caricare questa raccolta: {error}
      </div>
    )
  }

  return (
    <div className={`relative min-h-screen ${MOBILE_BOTTOMBAR_SPACER}`}>
      <TaccuinoPaperTexture />
      <TaccuinoRuledLines />
      <Navbar />
      <div className="max-w-[640px] mx-auto px-4 sm:px-8 pb-14" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 28px)' }}>
        <Link href="/raccolte" className="inline-flex items-center gap-1.5 mb-4" style={{ color: TACCUINO_INK.hand, fontSize: 12.5 }}>
          <ArrowLeft className="w-3.5 h-3.5" /> Le mie Raccolte
        </Link>

        {!collection ? (
          <div className="flex items-center justify-center py-24" style={{ color: TACCUINO_INK.handMuted }}>
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : (
          <>
            <h1 style={{ fontFamily: FONT_HAND, fontWeight: 700, fontSize: 30, ...INK_ABSORB_STYLE }} className="mb-5">
              {collection.title}
            </h1>

            <EditableField label="Titolo" value={collection.title} onSave={v => patchField('title', v)} />
            <EditableField label="Sottotitolo" value={collection.subtitle} onSave={v => patchField('subtitle', v)} placeholder="es. Tre stagioni sullo stesso crinale" />
            <EditableField label="Prefazione" value={collection.preface} onSave={v => patchField('preface', v)} multiline placeholder="Qualche riga per introdurre la collana…" />

            <div className="flex items-center justify-between mt-7 mb-2.5">
              <p style={{ fontFamily: FONT.barlow, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: 11, color: TACCUINO_INK.hand }}>
                Volumi ({collection.diari.length})
              </p>
              {reordering && <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: TACCUINO_ACCENT[600] }} />}
            </div>

            <div className="flex flex-col gap-2 mb-3">
              {collection.diari.map((d, i) => (
                <VolumeRow
                  key={d.id} volume={d} index={i} total={collection.diari.length}
                  onMoveUp={() => moveVolume(i, -1)} onMoveDown={() => moveVolume(i, 1)}
                  onRemove={() => removeVolume(d.id)}
                />
              ))}
              {collection.diari.length === 0 && (
                <p style={{ fontSize: 13, color: TACCUINO_INK.hand }}>Ancora nessun volume — aggiungine uno qui sotto.</p>
              )}
            </div>

            {showPicker ? (
              <div className="rounded-xl mb-6" style={{ background: TACCUINO_PAPER.card, border: `1px solid ${TACCUINO_PAPER.cardBorder}` }}>
                <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: `1px solid ${TACCUINO_PAPER.cardBorder}` }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: TACCUINO_INK.hand, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Aggiungi un volume</p>
                  <button type="button" onClick={() => setShowPicker(false)} style={{ color: TACCUINO_INK.handMuted }}><X className="w-4 h-4" /></button>
                </div>
                {allDiari === null ? (
                  <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin" style={{ color: TACCUINO_INK.handMuted }} /></div>
                ) : pickerOptions.length === 0 ? (
                  <p className="px-3 py-3 text-center" style={{ fontSize: 12.5, color: TACCUINO_INK.handMuted }}>
                    Nessun altro Diario disponibile — o sono già tutti in questa raccolta.
                  </p>
                ) : (
                  pickerOptions.map(d => (
                    <button
                      key={d.id} type="button" onClick={() => addVolume(d.id)}
                      className="w-full flex items-center justify-between px-3 py-2.5 text-left"
                      style={{ borderBottom: `1px dotted ${TACCUINO_PAPER.cardBorder}` }}
                    >
                      <span style={{ fontFamily: FONT.lora, fontWeight: 600, fontSize: 13.5, color: TACCUINO_INK.typed }}>{d.title}</span>
                      <span style={{ fontSize: 10.5, color: TACCUINO_INK.handMuted }}>{d.reportageCount} reportage</span>
                    </button>
                  ))
                )}
              </div>
            ) : (
              <button
                type="button" onClick={openPicker}
                className="flex items-center justify-center gap-2 h-11 rounded-xl w-full mb-6"
                style={{ border: `1.5px dashed ${TACCUINO_PAPER.cardBorder}`, color: TACCUINO_INK.hand, fontFamily: FONT.barlow, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: 11 }}
              >
                <Plus className="w-4 h-4" /> Aggiungi un volume
              </button>
            )}

            <div className="rounded-2xl px-4 py-4 mb-6" style={{ background: TACCUINO_PAPER.card, border: `1px solid ${TACCUINO_PAPER.cardBorder}` }}>
              <p style={{ fontFamily: FONT.barlow, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: 11, color: TACCUINO_INK.hand }} className="mb-2.5">
                Pubblicazione
              </p>
              {publishError && <p className="text-xs text-red-600 mb-2">{publishError}</p>}
              {shareToken ? (
                <div className="flex flex-col gap-2">
                  <a href={publicUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wide"
                    style={{ background: TACCUINO_PAPER.light, color: TACCUINO_INK.hand }}>
                    <ExternalLink className="w-3.5 h-3.5" /> Apri la raccolta
                  </a>
                  <button
                    type="button"
                    onClick={async () => { await navigator.clipboard.writeText(publicUrl); setCopyOk(true); setTimeout(() => setCopyOk(false), 2000) }}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wide text-white"
                    style={{ background: TACCUINO_ACCENT[600] }}
                  >
                    <Copy className="w-3.5 h-3.5" /> {copyOk ? 'Copiato!' : 'Copia link'}
                  </button>
                  <button type="button" onClick={revoke}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs border border-red-200 text-red-500">
                    <Link2Off className="w-3.5 h-3.5" /> Rimuovi link
                  </button>
                </div>
              ) : (
                <>
                  <p style={{ fontSize: 12, color: TACCUINO_INK.handMuted }} className="mb-2.5">
                    Pubblica una pagina web con tutti i volumi di questa raccolta, leggibile da chiunque abbia il link.
                  </p>
                  <button
                    type="button" onClick={publish} disabled={publishing}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wide text-white disabled:opacity-60"
                    style={{ background: TACCUINO_ACCENT[600] }}
                  >
                    {publishing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Share2 className="w-3.5 h-3.5" />}
                    Pubblica online
                  </button>
                </>
              )}
            </div>

            <div className="pt-4" style={{ borderTop: `1px solid ${TACCUINO_PAPER.cardBorder}` }}>
              {!deleteConfirming ? (
                <button onClick={() => setDeleteConfirming(true)} className="inline-flex items-center gap-2 text-sm" style={{ color: '#b3413a' }}>
                  <Trash2 className="w-4 h-4" /> Elimina questa raccolta
                </button>
              ) : (
                <div className="rounded-xl px-4 py-3 space-y-2" style={{ background: '#fdf2f0', border: '1px solid #f3d3cc' }}>
                  <p style={{ fontSize: 12.5, color: '#8a2f22' }}>
                    I Diari contenuti non vengono toccati — restano dove sono, esce solo la raccolta.
                  </p>
                  <div className="flex items-center gap-3">
                    <button onClick={deleteCollection} disabled={deleting}
                      className="px-3.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide text-white disabled:opacity-60"
                      style={{ background: '#b3413a' }}>
                      {deleting ? 'Elimino…' : 'Elimina'}
                    </button>
                    <button onClick={() => setDeleteConfirming(false)} disabled={deleting} style={{ fontSize: 12.5, color: TACCUINO_INK.handMuted }}>
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
