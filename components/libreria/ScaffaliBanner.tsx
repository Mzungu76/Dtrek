'use client'
// Banner inferiore della Libreria — chiuso è un promemoria (dorsi in miniatura + conteggio),
// aperto è la vera navigazione fra scaffali (docs/libreria-atlante-piano.md, Fase 1; grafica
// riavvicinata al mockup docs/mockup-taccuino/Scaffali.dc.html su richiesta esplicita
// dell'utente): dorsi colorati affiancati su un ripiano, non più un elenco testuale di righe.
//
// Gli "scaffali" sono le Raccolte (supabase/migrations/merge_shelves_into_collections.sql) — un
// Diario sta però su un solo scaffale alla volta (UNIQUE(diary_id) sulla tabella), diverso dalla
// raccolta pubblicabile "storica" che poteva contenerne più di una: qui la fisica del libro vince.
//
// Spostare un Diario si fa con drag & drop (@dnd-kit/core, richiesta esplicita dell'utente — la
// versione precedente lo evitava apposta con un bottone "Sposta" per riga): il toggle "Sposta" in
// testata abilita il trascinamento dei dorsi, tap singolo apre il Diario quando non è attivo.
import { useState } from 'react'
import { DndContext, useDraggable, useDroppable, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { ChevronDown, ChevronUp, Loader2, Move, Plus, Share2, X } from 'lucide-react'
import Link from 'next/link'
import { FONT } from '@/lib/designTokens'
import { TACCUINO_PAPER, TACCUINO_INK, TACCUINO_ACCENT, FONT_HAND, TACCUINO_RULED_TEXT_STYLE } from '@/lib/taccuinoTokens'
import { dorsoColore } from '@/lib/diari/dorsoColore'
import type { DiarySummary } from '@/lib/diari/aggregateDiaries'
import type { CollectionSummary } from '@/app/api/collections/route'

interface Props {
  shelves: CollectionSummary[]
  /** Solo i Diari attivi (non archiviati) — un Diario archiviato non compare né in libreria né
   *  negli scaffali da sistemare. */
  diaries: DiarySummary[]
  currentShelfId: string | null
  currentDiaryId: string
  onSelectDiary: (diaryId: string) => void
  /** Aggiornamento ottimistico nel genitore dopo uno spostamento riuscito — evita un secondo
   *  fetch di /api/diaries solo per riflettere un campo che conosciamo già. */
  onDiaryMoved: (diaryId: string, shelfId: string, shelfPosition: number) => void
  onShelfCreated: (shelf: CollectionSummary) => void
}

/** Rotazione d'altezza stabile per un dorso — derivata dall'id (stesso principio di
 *  cutoutRotation altrove nell'app), non `Math.random()`. */
function spineHeight(id: string): number {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0
  return 42 + (Math.abs(hash) % 20)
}

function spineAbbr(title: string): string {
  const letters = title.trim().replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]/g, '').toUpperCase()
  return letters.slice(0, 3) || '···'
}

function Spine({ diary, index, sposta, isCurrent, onTap }: {
  diary: DiarySummary
  index: number
  sposta: boolean
  isCurrent: boolean
  onTap: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: diary.id, disabled: !sposta })

  return (
    <button
      ref={setNodeRef}
      {...(sposta ? { ...attributes, ...listeners } : {})}
      onClick={() => { if (!sposta) onTap() }}
      title={diary.title}
      className="shrink-0 rounded-t-[2px] flex items-end justify-center pb-1 relative"
      style={{
        width: 25,
        height: spineHeight(diary.id),
        background: dorsoColore(index),
        boxShadow: isCurrent ? `0 0 0 2px ${TACCUINO_ACCENT[600]}, 0 0 0 4px ${TACCUINO_PAPER.light}` : undefined,
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        opacity: isDragging ? 0.35 : 1,
        cursor: sposta ? 'grab' : 'pointer',
        touchAction: sposta ? 'none' : undefined,
        zIndex: isDragging ? 10 : undefined,
      }}
    >
      <span style={{ fontFamily: FONT.mono, fontSize: 12, fontWeight: 700, color: 'rgba(245,237,221,.85)' }}>
        {spineAbbr(diary.title)}
      </span>
    </button>
  )
}

function ScaffaleRow({ shelf, shelfDiaries, sposta, currentShelfId, currentDiaryId, onSelectDiary, onCloseBanner }: {
  shelf: CollectionSummary
  shelfDiaries: DiarySummary[]
  sposta: boolean
  currentShelfId: string | null
  currentDiaryId: string
  onSelectDiary: (id: string) => void
  onCloseBanner: () => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: shelf.id, disabled: !sposta })
  const isCurrentShelf = shelf.id === currentShelfId

  return (
    <div className="mt-3">
      <div className="flex items-center gap-2 mb-1.5">
        <span style={{ fontFamily: FONT.lora, fontWeight: 600, fontSize: 14, color: isCurrentShelf ? TACCUINO_ACCENT[600] : TACCUINO_INK.typed }}>
          {shelf.title}
        </span>
        <span style={{ fontFamily: FONT.mono, fontWeight: 700, fontSize: 12, color: TACCUINO_INK.handMuted }}>{shelfDiaries.length}</span>
        <Link
          href={`/raccolte/${encodeURIComponent(shelf.id)}`}
          className="ml-auto shrink-0 flex items-center gap-1 rounded-full px-2 py-0.5"
          style={{ color: TACCUINO_INK.handMuted, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}
          title="Componi e pubblica questo scaffale come Raccolta"
        >
          <Share2 className="w-2.5 h-2.5" /> Pubblica
        </Link>
        {isCurrentShelf && (
          <span style={{ fontFamily: FONT.mono, fontSize: 12, fontWeight: 700, color: TACCUINO_ACCENT[600], textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            sei qui
          </span>
        )}
      </div>
      <div
        ref={setNodeRef}
        className="flex items-end gap-[5px] h-[62px] px-1.5 rounded-t-md overflow-x-auto"
        style={{ background: isOver ? `${TACCUINO_ACCENT[600]}14` : 'transparent', outline: isOver ? `1.5px dashed ${TACCUINO_ACCENT[600]}` : 'none' }}
      >
        {shelfDiaries.length === 0 ? (
          <p className="pb-2" style={{ fontSize: 12, color: TACCUINO_INK.handMuted, fontStyle: 'italic' }}>
            {sposta ? 'trascina qui un Diario' : 'vuoto'}
          </p>
        ) : (
          shelfDiaries.map((d, i) => (
            <Spine
              key={d.id}
              diary={d}
              index={i}
              sposta={sposta}
              isCurrent={d.id === currentDiaryId}
              onTap={() => { onSelectDiary(d.id); onCloseBanner() }}
            />
          ))
        )}
      </div>
      <div className="h-[5px] rounded-b-[2px]" style={{ background: isCurrentShelf ? TACCUINO_ACCENT[600] : TACCUINO_PAPER.contourLine }} />
    </div>
  )
}

export function ScaffaliBanner({ shelves, diaries, currentShelfId, currentDiaryId, onSelectDiary, onDiaryMoved, onShelfCreated }: Props) {
  const [open, setOpen] = useState(false)
  const [sposta, setSposta] = useState(false)
  const [busy, setBusy] = useState(false)
  const [creatingShelf, setCreatingShelf] = useState(false)
  const [newShelfName, setNewShelfName] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const currentShelf = shelves.find(s => s.id === currentShelfId)
  const diaryById = new Map(diaries.map(d => [d.id, d]))
  const diariesByShelf = new Map<string, DiarySummary[]>()
  for (const shelf of shelves) {
    diariesByShelf.set(shelf.id, shelf.diaryIds.map(id => diaryById.get(id)).filter((d): d is DiarySummary => d != null))
  }

  async function spostaSu(diaryId: string, shelfId: string) {
    setBusy(true)
    try {
      const shelfPosition = diariesByShelf.get(shelfId)?.length ?? 0
      const res = await fetch(`/api/diaries/${encodeURIComponent(diaryId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shelfId, shelfPosition }),
      })
      if (!res.ok) return
      onDiaryMoved(diaryId, shelfId, shelfPosition)
    } finally {
      setBusy(false)
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const diaryId = String(event.active.id)
    const targetShelfId = event.over ? String(event.over.id) : null
    if (!targetShelfId) return
    const diary = diaryById.get(diaryId)
    if (!diary || diary.shelfId === targetShelfId) return
    spostaSu(diaryId, targetShelfId)
  }

  async function creaScaffale() {
    const name = newShelfName.trim()
    if (!name || busy) return
    setBusy(true)
    setCreateError(null)
    try {
      const res = await fetch('/api/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: name }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setCreateError(typeof data.message === 'string' ? data.message : 'Impossibile creare lo scaffale.')
        return
      }
      onShelfCreated({
        id: data.id as string, title: name, subtitle: '', coverUrl: null, isPublished: false,
        volumeCount: 0, reportageCount: 0, distanceMeters: 0, elevationGain: 0, diaryIds: [],
        position: shelves.length,
      })
      setNewShelfName('')
      setCreatingShelf(false)
    } catch {
      setCreateError('Impossibile creare lo scaffale — riprova.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed left-0 right-0 z-40 transition-[bottom]"
      style={{
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 80px)',
        background: TACCUINO_PAPER.light,
        borderTop: `1px solid ${TACCUINO_PAPER.cardBorder}`,
        boxShadow: '0 -6px 18px rgba(46,42,34,.13)',
      }}
    >
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-2.5"
        aria-expanded={open}
      >
        <span className="flex items-end gap-[3px] shrink-0" aria-hidden="true">
          {(diariesByShelf.get(currentShelfId ?? '') ?? []).slice(0, 6).map((d, i) => (
            <i key={d.id} style={{ display: 'block', width: 6, height: 18 + (i % 3) * 4, borderRadius: 1, background: dorsoColore(i) }} />
          ))}
        </span>
        <span className="min-w-0 flex-1 text-left">
          <p className="truncate" style={{ fontFamily: FONT.lora, fontWeight: 600, fontSize: 12, color: TACCUINO_INK.typed }}>
            {currentShelf?.title ?? 'Scaffale'} &middot; {diariesByShelf.get(currentShelfId ?? '')?.length ?? 0} Diari
          </p>
          <p style={{ fontSize: 12, color: TACCUINO_INK.handMuted, ...TACCUINO_RULED_TEXT_STYLE }}>
            {open ? 'tocca per chiudere' : 'tocca per vedere tutti gli scaffali'}
          </p>
        </span>
        {open ? <ChevronDown className="w-4 h-4" style={{ color: TACCUINO_INK.handMuted }} /> : <ChevronUp className="w-4 h-4" style={{ color: TACCUINO_INK.handMuted }} />}
      </button>

      {open && (
        <div className="max-h-[58vh] overflow-y-auto px-4 pb-4" style={{ borderTop: `1px dotted ${TACCUINO_PAPER.cardBorder}` }}>
          <div className="flex items-center justify-between gap-2 pt-3">
            <div>
              <p style={{ fontFamily: FONT.barlow, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', fontSize: 12, color: TACCUINO_INK.hand }}>
                La libreria
              </p>
              <p style={{ fontFamily: FONT_HAND, fontWeight: 700, fontSize: 20, color: TACCUINO_INK.typed, marginTop: 1 }}>
                {shelves.length} scaffal{shelves.length === 1 ? 'e' : 'i'}, {diaries.length} taccuin{diaries.length === 1 ? 'o' : 'i'}
              </p>
            </div>
            <button
              onClick={() => setSposta(s => !s)}
              className="shrink-0 flex items-center gap-1.5 rounded-full px-3 py-1.5"
              style={sposta
                ? { background: TACCUINO_ACCENT[600], color: TACCUINO_PAPER.light }
                : { background: TACCUINO_PAPER.card, border: `1px solid ${TACCUINO_PAPER.cardBorder}`, color: TACCUINO_INK.hand }}
            >
              <Move className="w-3.5 h-3.5" />
              <span style={{ fontSize: 12, fontWeight: 700 }}>{sposta ? 'Fatto' : 'Sposta'}</span>
            </button>
          </div>

          {sposta && (
            <p className="mt-1.5" style={{ fontSize: 12, color: TACCUINO_INK.handMuted, fontStyle: 'italic' }}>
              Trascina un dorso su un altro scaffale per spostarlo.
            </p>
          )}

          <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
            {shelves.map(shelf => (
              <ScaffaleRow
                key={shelf.id}
                shelf={shelf}
                shelfDiaries={diariesByShelf.get(shelf.id) ?? []}
                sposta={sposta}
                currentShelfId={currentShelfId}
                currentDiaryId={currentDiaryId}
                onSelectDiary={onSelectDiary}
                onCloseBanner={() => setOpen(false)}
              />
            ))}
          </DndContext>

          <div className="mt-4">
            {createError && (
              <p className="text-xs mb-2 px-3 py-2 rounded-lg" style={{ background: '#fbe9e7', color: '#b3413a' }}>{createError}</p>
            )}
            {creatingShelf ? (
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  value={newShelfName}
                  onChange={e => setNewShelfName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') creaScaffale() }}
                  placeholder="Nome dello scaffale"
                  className="flex-1 px-3 py-2 rounded-full text-sm outline-none"
                  style={{ background: TACCUINO_PAPER.card, border: `1px solid ${TACCUINO_PAPER.cardBorder}`, color: TACCUINO_INK.typed }}
                />
                <button onClick={creaScaffale} disabled={busy || !newShelfName.trim()} className="shrink-0 rounded-full px-3 py-2 text-xs font-semibold" style={{ background: TACCUINO_ACCENT[600], color: TACCUINO_PAPER.light }}>
                  {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Crea'}
                </button>
                <button onClick={() => { setCreatingShelf(false); setCreateError(null) }} aria-label="Annulla" style={{ color: TACCUINO_INK.handMuted }}><X className="w-4 h-4" /></button>
              </div>
            ) : (
              <button
                onClick={() => setCreatingShelf(true)}
                className="inline-flex items-center gap-2 rounded-full px-3.5 py-1.5"
                style={{ border: `1.5px dashed ${TACCUINO_PAPER.cardBorder}`, color: TACCUINO_INK.hand, fontSize: 12, fontWeight: 700 }}
              >
                <Plus className="w-3.5 h-3.5" /> Nuovo scaffale
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
