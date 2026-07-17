'use client'

import { useEffect, useRef, useState } from 'react'
import { GripVertical, ChevronUp, ChevronDown, X, Sparkles, Loader2, Star } from 'lucide-react'
import type { RoutePhoto } from '@/lib/activityPhotos'
import type { ReportSection } from '@/lib/reportStore'

interface Props {
  section: ReportSection
  sectionIndex: number
  totalSections: number
  photos: RoutePhoto[]
  onChange: (updated: ReportSection) => void
  onDelete: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onAiAssist: (sectionId: string, instruction: string) => void
  aiAssistLoading: boolean
  /** Riordino via Pointer Events (non drag-and-drop nativo HTML5, che su touch non parte affatto):
   *  il pointerdown sulla maniglia avvia il trascinamento, il resto della logica (calcolo di dove
   *  verrebbe inserita, in base alla posizione del puntatore) vive nel genitore (ManualEditor), che
   *  possiede l'intero array delle sezioni e ascolta pointermove/pointerup su window. */
  onDragHandleDown: (e: React.PointerEvent) => void
  isDragging: boolean
  isDragOver: boolean
}

const PLACEHOLDERS: Record<string, string> = {
  'Il percorso':     'Descrivi il tracciato, il paesaggio, i punti salienti…',
  'Cronaca':         'Racconta la tua giornata, momento per momento…',
  'Natura e storia': 'Cosa rende speciale questo territorio? Geologia, flora, fauna, storia…',
  'In sintesi':      'Una valutazione complessiva, consigli pratici, le tue impressioni finali…',
}

function progressLabel(photo: RoutePhoto): string {
  if (photo.progress === 0.5 && !photo.hasExifGps) return 'Posizione non definita'
  return `${Math.round(photo.progress * 100)}% del percorso`
}

function insertAtCursor(
  ref: React.RefObject<HTMLTextAreaElement>,
  value: string,
  onChange: (next: string) => void,
  before: string,
  after: string,
  placeholder: string,
) {
  const ta = ref.current
  if (!ta) return
  const start = ta.selectionStart
  const end = ta.selectionEnd
  const selected = value.slice(start, end)
  const text = selected || placeholder
  const next = value.slice(0, start) + before + text + after + value.slice(end)
  onChange(next)
  requestAnimationFrame(() => {
    ta.focus()
    const selStart = start + before.length
    ta.setSelectionRange(selStart, selStart + text.length)
  })
}

export default function SectionEditor({
  section, sectionIndex, totalSections, photos,
  onChange, onDelete, onMoveUp, onMoveDown, onAiAssist, aiAssistLoading,
  onDragHandleDown, isDragging, isDragOver,
}: Props) {
  const textareaRef   = useRef<HTMLTextAreaElement>(null)
  const [editingTitle, setEditingTitle]   = useState(false)
  const [titleDraft,   setTitleDraft]     = useState(section.title)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [showAi,       setShowAi]         = useState(false)
  const [customInstruction, setCustomInstruction] = useState('')

  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${ta.scrollHeight}px`
  }, [section.body])

  const extraIds = section.extraPhotoIds ?? []
  const primaryPhoto = photos.find(p => p.id === section.photoId)
  const wordCount = section.body.trim() ? section.body.trim().split(/\s+/).length : 0

  function commitTitle() {
    const t = titleDraft.trim()
    if (t && t !== section.title) onChange({ ...section, title: t })
    else setTitleDraft(section.title)
    setEditingTitle(false)
  }

  // Tap: aggiunge/rimuove la foto dalla sezione (principale se non ce n'è ancora una, altrimenti
  // extra) — la stella promuove un'extra a principale, scambiando il posto con quella corrente.
  function toggleIncluded(photoId: string) {
    if (section.photoId === photoId) {
      const [firstExtra, ...rest] = extraIds
      onChange({ ...section, photoId: firstExtra ?? null, extraPhotoIds: rest })
    } else if (extraIds.includes(photoId)) {
      onChange({ ...section, extraPhotoIds: extraIds.filter(id => id !== photoId) })
    } else if (!section.photoId) {
      onChange({ ...section, photoId })
    } else {
      onChange({ ...section, extraPhotoIds: [...extraIds, photoId] })
    }
  }

  function makePrimary(photoId: string) {
    if (section.photoId === photoId) return
    const prevPrimary = section.photoId
    const nextExtras = extraIds.filter(id => id !== photoId)
    onChange({ ...section, photoId, extraPhotoIds: prevPrimary ? [prevPrimary, ...nextExtras] : nextExtras })
  }

  return (
    <div
      className={`bg-white rounded-2xl border shadow-sm mb-4 overflow-hidden transition-all ${
        isDragging ? 'opacity-40' : isDragOver ? 'border-forest-400 ring-2 ring-forest-200' : 'border-stone-200'
      }`}
    >
      {/* ── Top bar ── */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-stone-50 border-b border-stone-200">
        <span
          onPointerDown={onDragHandleDown}
          title="Trascina per riordinare"
          className="cursor-grab active:cursor-grabbing p-1 -m-1 rounded touch-none"
        >
          <GripVertical className="w-4 h-4 text-stone-300 shrink-0" />
        </span>
        <span className="text-[10px] font-display font-bold uppercase tracking-wide text-stone-400 shrink-0">
          Sezione {sectionIndex + 1}
        </span>
        {editingTitle ? (
          <input
            autoFocus
            value={titleDraft}
            onChange={e => setTitleDraft(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={e => { if (e.key === 'Enter') commitTitle() }}
            className="flex-1 min-w-0 bg-white border border-forest-300 rounded px-2 py-0.5 text-sm font-display font-bold text-stone-700 outline-none"
          />
        ) : (
          <button onClick={() => setEditingTitle(true)}
            className="flex-1 min-w-0 text-left truncate font-display font-bold text-sm text-stone-700 hover:text-forest-700 transition-colors">
            {section.title}
          </button>
        )}
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={onMoveUp} disabled={sectionIndex === 0}
            className="p-1.5 rounded hover:bg-stone-200 disabled:opacity-30 transition-colors">
            <ChevronUp className="w-3.5 h-3.5 text-stone-500" />
          </button>
          <button onClick={onMoveDown} disabled={sectionIndex === totalSections - 1}
            className="p-1.5 rounded hover:bg-stone-200 disabled:opacity-30 transition-colors">
            <ChevronDown className="w-3.5 h-3.5 text-stone-500" />
          </button>
          {confirmDelete ? (
            <span className="flex items-center gap-1 text-xs">
              <span className="text-stone-500">Eliminare?</span>
              <button onClick={onDelete} className="text-red-600 font-bold hover:underline">Sì</button>
              <button onClick={() => setConfirmDelete(false)} className="text-stone-500 hover:underline">No</button>
            </span>
          ) : (
            <button onClick={() => setConfirmDelete(true)}
              className="p-1.5 rounded hover:bg-red-100 transition-colors">
              <X className="w-3.5 h-3.5 text-stone-400 hover:text-red-600" />
            </button>
          )}
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-col md:flex-row gap-4 p-4">
        {/* Left: text editor */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-2 flex-wrap">
            {[
              { label: '##',  title: 'Sottosezione', before: '\n## ', after: '\n', ph: 'Titolo' },
              { label: 'B',   title: 'Grassetto',     before: '**',   after: '**', ph: 'testo in grassetto' },
              { label: 'I',   title: 'Corsivo',       before: '*',    after: '*',  ph: 'testo in corsivo' },
              { label: '✦',   title: 'Curiosità',     before: '[curiosita]', after: '[/curiosita]', ph: 'fatto curioso' },
              { label: '¶',   title: 'Nuovo paragrafo', before: '\n\n', after: '', ph: '' },
            ].map(btn => (
              <button key={btn.label} title={btn.title}
                onClick={() => insertAtCursor(textareaRef, section.body, body => onChange({ ...section, body }), btn.before, btn.after, btn.ph)}
                className="min-w-[34px] px-2.5 py-2 rounded-lg border border-stone-200 text-sm font-mono font-semibold text-stone-500 hover:bg-stone-100 hover:border-stone-300 active:scale-95 transition-all">
                {btn.label}
              </button>
            ))}
          </div>

          <div className="relative">
            <textarea
              ref={textareaRef}
              value={section.body}
              onChange={e => onChange({ ...section, body: e.target.value })}
              rows={8}
              disabled={aiAssistLoading}
              placeholder={PLACEHOLDERS[section.title] ?? 'Scrivi qui il testo della sezione…'}
              className="w-full font-body text-sm text-stone-700 leading-relaxed border border-stone-200 rounded-xl p-3 outline-none focus:border-forest-400 resize-none disabled:opacity-50 disabled:bg-stone-50"
            />
            {aiAssistLoading && (
              <div className="absolute inset-0 bg-white/70 rounded-xl flex items-center justify-center gap-2 text-stone-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="font-body italic text-sm">L&apos;AI sta riscrivendo…</span>
              </div>
            )}
          </div>
          {wordCount > 0 && (
            <p className="mt-1 text-[11px] text-stone-400 font-body">
              {wordCount} parole · ~{Math.max(1, Math.round(wordCount / 200))} min di lettura
            </p>
          )}

          {/* AI assist panel */}
          <div className="mt-2">
            <button onClick={() => setShowAi(s => !s)}
              className="flex items-center gap-1.5 text-xs font-display font-bold uppercase tracking-wide text-forest-600 hover:text-forest-800 transition-colors">
              <Sparkles className="w-3.5 h-3.5" /> Assistenza AI {showAi ? '▲' : '▼'}
            </button>
            {showAi && (
              <div className="mt-2 p-3 bg-forest-50 rounded-xl border border-forest-100">
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'Correggi stile',   instr: '__correggi' },
                    { label: 'Espandi',          instr: '__espandi' },
                    { label: 'Sintetizza',       instr: '__sintetizza' },
                    { label: 'Rendi personale',  instr: '__personale' },
                  ].map(p => (
                    <button key={p.instr} disabled={aiAssistLoading}
                      onClick={() => onAiAssist(section.id, p.instr)}
                      className="px-2 py-1.5 bg-white border border-forest-200 rounded-lg text-xs font-medium text-forest-700 hover:bg-forest-100 disabled:opacity-50 transition-colors">
                      {p.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <textarea
                    value={customInstruction}
                    onChange={e => setCustomInstruction(e.target.value)}
                    rows={2}
                    placeholder="Oppure scrivi un'istruzione libera…"
                    className="flex-1 text-xs font-body border border-stone-200 rounded-lg p-2 outline-none focus:border-forest-400 resize-none"
                  />
                  <button
                    disabled={aiAssistLoading || !customInstruction.trim()}
                    onClick={() => { onAiAssist(section.id, customInstruction.trim()); setCustomInstruction('') }}
                    className="px-3 py-2 bg-forest-600 hover:bg-forest-700 disabled:opacity-50 text-white rounded-lg text-xs font-display font-bold uppercase tracking-wide transition-colors shrink-0">
                    Applica
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: photo panel */}
        <div className="w-full md:w-72 shrink-0">
          <p className="font-display text-xs font-bold uppercase tracking-wide text-stone-500 mb-2">
            Foto della sezione
          </p>
          <p className="text-[10.5px] text-stone-400 italic mb-2 leading-snug">
            Tocca per aggiungere/togliere · la stella la rende la foto principale
          </p>

          {photos.length === 0 ? (
            <p className="text-xs text-stone-400 font-body italic">Nessuna foto disponibile.</p>
          ) : (
            <div data-hscroll className="flex gap-2 overflow-x-auto pb-1">
              {photos.map((p, i) => {
                const isPrimary = section.photoId === p.id
                const isExtra = extraIds.includes(p.id)
                const included = isPrimary || isExtra
                return (
                  <div key={p.id} className="relative shrink-0">
                    <button
                      onClick={() => toggleIncluded(p.id)}
                      className={`relative block w-20 h-20 rounded-xl overflow-hidden border-2 transition-colors ${
                        isPrimary ? 'border-forest-500' : isExtra ? 'border-forest-300' : 'border-stone-200 hover:border-stone-300'
                      }`}
                    >
                      <img src={p.url} alt={p.caption} className="w-full h-full object-cover" />
                      {included && (
                        <div className="absolute inset-0 bg-forest-900/10" />
                      )}
                      <span className="absolute bottom-0.5 left-0.5 w-4 h-4 bg-black/50 text-white text-[8px] font-bold flex items-center justify-center rounded-full">
                        {i + 1}
                      </span>
                    </button>
                    {included && (
                      <button
                        onClick={() => makePrimary(p.id)}
                        title={isPrimary ? 'Foto principale' : 'Rendi principale'}
                        className={`absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center border-2 border-white shadow-sm transition-colors ${
                          isPrimary ? 'bg-amber-400 text-white' : 'bg-white text-stone-400 hover:text-amber-500'
                        }`}
                      >
                        <Star className="w-2.5 h-2.5" fill={isPrimary ? 'currentColor' : 'none'} />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {primaryPhoto && (
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-[10px] text-stone-400 truncate">📍 {progressLabel(primaryPhoto)}</span>
              {!primaryPhoto.hasExifGps && (
                <button
                  onClick={() => window.dispatchEvent(new CustomEvent('dtrek:open-photo-manager'))}
                  className="text-[11px] text-forest-600 hover:underline shrink-0">Riposiziona</button>
              )}
            </div>
          )}

          <button
            onClick={() => window.dispatchEvent(new CustomEvent('dtrek:open-photo-manager'))}
            className="mt-2 text-xs text-forest-600 hover:underline">
            + Carica nuova foto
          </button>
        </div>
      </div>
    </div>
  )
}
