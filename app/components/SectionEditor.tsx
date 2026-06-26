'use client'

import { useEffect, useRef, useState } from 'react'
import { GripVertical, ChevronUp, ChevronDown, X, Sparkles, Loader2 } from 'lucide-react'
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
}: Props) {
  const textareaRef   = useRef<HTMLTextAreaElement>(null)
  const [editingTitle, setEditingTitle]   = useState(false)
  const [titleDraft,   setTitleDraft]     = useState(section.title)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [showAi,       setShowAi]         = useState(false)
  const [customInstruction, setCustomInstruction] = useState('')
  const [showPhotoGrid, setShowPhotoGrid] = useState(section.photoId === null)

  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${ta.scrollHeight}px`
  }, [section.body])

  const photo = photos.find(p => p.id === section.photoId)

  function commitTitle() {
    const t = titleDraft.trim()
    if (t && t !== section.title) onChange({ ...section, title: t })
    else setTitleDraft(section.title)
    setEditingTitle(false)
  }

  return (
    <div className="bg-white rounded-2xl border border-stone-200 shadow-sm mb-4 overflow-hidden">
      {/* ── Top bar ── */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-stone-50 border-b border-stone-200">
        <GripVertical className="w-4 h-4 text-stone-300 shrink-0" />
        <span className="text-[10px] font-barlow font-bold uppercase tracking-wide text-stone-400 shrink-0">
          Sezione {sectionIndex + 1}
        </span>
        {editingTitle ? (
          <input
            autoFocus
            value={titleDraft}
            onChange={e => setTitleDraft(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={e => { if (e.key === 'Enter') commitTitle() }}
            className="flex-1 min-w-0 bg-white border border-forest-300 rounded px-2 py-0.5 text-sm font-barlow font-bold text-stone-700 outline-none"
          />
        ) : (
          <button onClick={() => setEditingTitle(true)}
            className="flex-1 min-w-0 text-left truncate font-barlow font-bold text-sm text-stone-700 hover:text-forest-700 transition-colors">
            {section.title}
          </button>
        )}
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={onMoveUp} disabled={sectionIndex === 0}
            className="p-1 rounded hover:bg-stone-200 disabled:opacity-30 transition-colors">
            <ChevronUp className="w-3.5 h-3.5 text-stone-500" />
          </button>
          <button onClick={onMoveDown} disabled={sectionIndex === totalSections - 1}
            className="p-1 rounded hover:bg-stone-200 disabled:opacity-30 transition-colors">
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
              className="p-1 rounded hover:bg-red-100 transition-colors">
              <X className="w-3.5 h-3.5 text-stone-400 hover:text-red-600" />
            </button>
          )}
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-col md:flex-row gap-4 p-4">
        {/* Left: text editor */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 mb-2">
            {[
              { label: '##',  title: 'Sottosezione', before: '\n## ', after: '\n', ph: 'Titolo' },
              { label: 'B',   title: 'Grassetto',     before: '**',   after: '**', ph: 'testo in grassetto' },
              { label: 'I',   title: 'Corsivo',       before: '*',    after: '*',  ph: 'testo in corsivo' },
              { label: '✦',   title: 'Curiosità',     before: '[curiosita]', after: '[/curiosita]', ph: 'fatto curioso' },
              { label: '¶',   title: 'Nuovo paragrafo', before: '\n\n', after: '', ph: '' },
            ].map(btn => (
              <button key={btn.label} title={btn.title}
                onClick={() => insertAtCursor(textareaRef, section.body, body => onChange({ ...section, body }), btn.before, btn.after, btn.ph)}
                className="px-2 py-1 rounded border border-stone-200 text-xs font-mono text-stone-500 hover:bg-stone-100 transition-colors">
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
              className="w-full font-lora text-sm text-stone-700 leading-relaxed border border-stone-200 rounded-xl p-3 outline-none focus:border-forest-400 resize-none disabled:opacity-50 disabled:bg-stone-50"
            />
            {aiAssistLoading && (
              <div className="absolute inset-0 bg-white/70 rounded-xl flex items-center justify-center gap-2 text-stone-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="font-lora italic text-sm">L&apos;AI sta riscrivendo…</span>
              </div>
            )}
          </div>

          {/* AI assist panel */}
          <div className="mt-2">
            <button onClick={() => setShowAi(s => !s)}
              className="flex items-center gap-1.5 text-xs font-barlow font-bold uppercase tracking-wide text-forest-600 hover:text-forest-800 transition-colors">
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
                    className="flex-1 text-xs font-lora border border-stone-200 rounded-lg p-2 outline-none focus:border-forest-400 resize-none"
                  />
                  <button
                    disabled={aiAssistLoading || !customInstruction.trim()}
                    onClick={() => { onAiAssist(section.id, customInstruction.trim()); setCustomInstruction('') }}
                    className="px-3 py-2 bg-forest-600 hover:bg-forest-700 disabled:opacity-50 text-white rounded-lg text-xs font-barlow font-bold uppercase tracking-wide transition-colors shrink-0">
                    Applica
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: photo panel */}
        <div className="w-full md:w-64 shrink-0">
          <p className="font-barlow text-xs font-bold uppercase tracking-wide text-stone-500 mb-2 flex items-center gap-1.5">
            Foto associata
          </p>

          {!photo || showPhotoGrid ? (
            <div>
              {!photo && (
                <p className="text-xs text-stone-400 font-lora italic mb-2">
                  Nessuna foto associata a questa sezione
                </p>
              )}
              <div className="grid grid-cols-5 gap-1.5 max-h-32 overflow-y-auto">
                {photos.map((p, i) => (
                  <button key={p.id}
                    onClick={() => { onChange({ ...section, photoId: p.id }); setShowPhotoGrid(false) }}
                    className="relative w-12 h-12 rounded-md overflow-hidden border border-stone-200 hover:border-forest-400 transition-colors">
                    <img src={p.url} alt={p.caption} className="w-full h-full object-cover" />
                    <span className="absolute top-0 left-0 w-3.5 h-3.5 bg-amber-500 text-white text-[7px] font-bold flex items-center justify-center rounded-br">
                      {i + 1}
                    </span>
                  </button>
                ))}
              </div>
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('dtrek:open-photo-manager'))}
                className="mt-2 text-xs text-forest-600 hover:underline">
                + Carica nuova foto
              </button>
            </div>
          ) : (
            <div>
              <div className="w-full aspect-[4/3] rounded-xl overflow-hidden">
                <img src={photo.url} alt={photo.caption} className="w-full h-full object-cover" />
              </div>
              {photo.caption && (
                <p className="font-lora text-xs italic text-stone-500 mt-1">{photo.caption}</p>
              )}
              <div className="flex items-center justify-between mt-1">
                <span className="text-[10px] text-stone-400">📍 {progressLabel(photo)}</span>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <button onClick={() => setShowPhotoGrid(true)}
                  className="text-xs text-stone-500 hover:underline">Cambia</button>
                {!photo.hasExifGps && (
                  <button
                    onClick={() => window.dispatchEvent(new CustomEvent('dtrek:open-photo-manager'))}
                    className="text-xs text-forest-600 hover:underline">Riposiziona</button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
