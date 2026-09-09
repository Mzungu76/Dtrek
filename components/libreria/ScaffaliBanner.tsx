'use client'
// Banner inferiore della Libreria — chiuso è un promemoria (dorsi in miniatura + conteggio),
// aperto è la vera navigazione fra scaffali (docs/libreria-atlante-piano.md, Fase 1): con molti
// Diari, arrivare al quinto a forza di swipe nel carosello sarebbe sfogliare alla cieca — qui
// invece si tocca il dorso e si salta.
//
// Nessun drag & drop: un Diario si sposta scegliendo lo scaffale di destinazione da un piccolo
// elenco (bottone "Sposta" su ogni riga), non trascinandolo — stesso risultato (un solo scaffale
// per Diario, mai un'ambiguità fra "sposta" e "aggiungi a"), senza la fisica del trascinamento
// touch che una libreria dedicata (@dnd-kit) comporterebbe.
import { useState } from 'react'
import { ChevronDown, ChevronUp, Loader2, Plus, X } from 'lucide-react'
import { FONT } from '@/lib/designTokens'
import { TACCUINO_PAPER, TACCUINO_INK, TACCUINO_ACCENT, TACCUINO_RULED_TEXT_STYLE } from '@/lib/taccuinoTokens'
import { dorsoColore } from '@/lib/diari/dorsoColore'
import type { DiarySummary } from '@/lib/diari/aggregateDiaries'
import type { ShelfSummary } from '@/app/api/shelves/route'
import { apiFetch } from '@/lib/apiFetch'

interface Props {
  shelves: ShelfSummary[]
  /** Solo i Diari attivi (non archiviati) — un Diario archiviato non compare né in libreria né
   *  negli scaffali da sistemare. */
  diaries: DiarySummary[]
  currentShelfId: string | null
  currentDiaryId: string
  onSelectDiary: (diaryId: string) => void
  /** Aggiornamento ottimistico nel genitore dopo uno spostamento riuscito — evita un secondo
   *  fetch di /api/diaries solo per riflettere un campo che conosciamo già. */
  onDiaryMoved: (diaryId: string, shelfId: string, shelfPosition: number) => void
  onShelfCreated: (shelf: ShelfSummary) => void
}

export function ScaffaliBanner({ shelves, diaries, currentShelfId, currentDiaryId, onSelectDiary, onDiaryMoved, onShelfCreated }: Props) {
  const [open, setOpen] = useState(false)
  const [movingDiaryId, setMovingDiaryId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [creatingShelf, setCreatingShelf] = useState(false)
  const [newShelfName, setNewShelfName] = useState('')

  const currentShelf = shelves.find(s => s.id === currentShelfId)
  const diariesByShelf = new Map<string, DiarySummary[]>()
  for (const d of diaries) {
    if (!d.shelfId) continue
    const lista = diariesByShelf.get(d.shelfId) ?? []
    lista.push(d)
    diariesByShelf.set(d.shelfId, lista)
  }
  for (const lista of Array.from(diariesByShelf.values())) lista.sort((a, b) => a.shelfPosition - b.shelfPosition)

  async function spostaSu(diaryId: string, shelfId: string) {
    setBusy(true)
    try {
      const shelfPosition = (diariesByShelf.get(shelfId)?.length ?? 0)
      await apiFetch(`/api/diaries/${encodeURIComponent(diaryId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shelfId, shelfPosition }),
      })
      onDiaryMoved(diaryId, shelfId, shelfPosition)
      setMovingDiaryId(null)
    } catch {
      // silenzioso: la riga resta dove era, l'utente può riprovare
    } finally {
      setBusy(false)
    }
  }

  async function creaScaffale() {
    const name = newShelfName.trim()
    if (!name || busy) return
    setBusy(true)
    try {
      const shelf = await apiFetch<ShelfSummary>('/api/shelves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      onShelfCreated(shelf)
      setNewShelfName('')
      setCreatingShelf(false)
    } catch {
      // silenzioso, l'utente può riprovare
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
          <p className="truncate" style={{ fontFamily: FONT.lora, fontWeight: 600, fontSize: 12.5, color: TACCUINO_INK.typed }}>
            {currentShelf?.name ?? 'Scaffale'} &middot; {diariesByShelf.get(currentShelfId ?? '')?.length ?? 0} Diari
          </p>
          <p style={{ fontSize: 10.5, color: TACCUINO_INK.handMuted, ...TACCUINO_RULED_TEXT_STYLE }}>
            {open ? 'tocca per chiudere' : 'tocca per vedere tutti gli scaffali'}
          </p>
        </span>
        {open ? <ChevronDown className="w-4 h-4" style={{ color: TACCUINO_INK.handMuted }} /> : <ChevronUp className="w-4 h-4" style={{ color: TACCUINO_INK.handMuted }} />}
      </button>

      {open && (
        <div className="max-h-[52vh] overflow-y-auto px-4 pb-4" style={{ borderTop: `1px dotted ${TACCUINO_PAPER.cardBorder}` }}>
          {shelves.map(shelf => (
            <div key={shelf.id} className="mt-3">
              <p className="mb-1.5" style={{ fontFamily: FONT.barlow, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: 10, color: shelf.id === currentShelfId ? TACCUINO_ACCENT[600] : TACCUINO_INK.hand }}>
                {shelf.name} &middot; {diariesByShelf.get(shelf.id)?.length ?? 0}
              </p>
              <div className="flex flex-col gap-1.5">
                {(diariesByShelf.get(shelf.id) ?? []).map(d => (
                  <div key={d.id} className="flex items-center gap-2 rounded-xl px-2.5 py-2" style={{ background: d.id === currentDiaryId ? TACCUINO_PAPER.card : 'transparent', border: `1px solid ${d.id === currentDiaryId ? TACCUINO_ACCENT[600] : 'transparent'}` }}>
                    <button onClick={() => { onSelectDiary(d.id); setOpen(false) }} className="min-w-0 flex-1 text-left truncate" style={{ fontFamily: FONT.lora, fontSize: 13, color: TACCUINO_INK.typed }}>
                      {d.title}
                    </button>
                    {movingDiaryId === d.id ? (
                      <div className="flex items-center gap-1 flex-wrap justify-end">
                        {shelves.filter(s => s.id !== shelf.id).map(s => (
                          <button
                            key={s.id}
                            disabled={busy}
                            onClick={() => spostaSu(d.id, s.id)}
                            className="rounded-full px-2 py-1 text-[10px] font-semibold"
                            style={{ background: TACCUINO_PAPER.base, border: `1px solid ${TACCUINO_PAPER.cardBorder}`, color: TACCUINO_INK.hand }}
                          >
                            {s.name}
                          </button>
                        ))}
                        <button onClick={() => setMovingDiaryId(null)} aria-label="Annulla" style={{ color: TACCUINO_INK.handMuted }}><X className="w-3.5 h-3.5" /></button>
                      </div>
                    ) : (
                      <button onClick={() => setMovingDiaryId(d.id)} className="shrink-0 text-[10px] font-semibold rounded-full px-2.5 py-1" style={{ color: TACCUINO_INK.hand, border: `1px solid ${TACCUINO_PAPER.cardBorder}` }}>
                        Sposta
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="mt-3">
            {creatingShelf ? (
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  value={newShelfName}
                  onChange={e => setNewShelfName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') creaScaffale() }}
                  placeholder="Nome dello scaffale"
                  className="flex-1 px-3 py-2 rounded-full text-[13px] outline-none"
                  style={{ background: TACCUINO_PAPER.card, border: `1px solid ${TACCUINO_PAPER.cardBorder}`, color: TACCUINO_INK.typed }}
                />
                <button onClick={creaScaffale} disabled={busy || !newShelfName.trim()} className="shrink-0 rounded-full px-3 py-2 text-[12px] font-semibold" style={{ background: TACCUINO_ACCENT[600], color: TACCUINO_PAPER.light }}>
                  {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Crea'}
                </button>
              </div>
            ) : (
              <button onClick={() => setCreatingShelf(true)} className="flex items-center gap-2 text-[12.5px] font-semibold" style={{ color: TACCUINO_INK.hand }}>
                <Plus className="w-3.5 h-3.5" /> Nuovo scaffale
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
