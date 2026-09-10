'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Eye, EyeOff, X, Plus, Check, Loader2 } from 'lucide-react'
import type { StoredActivity } from '@/lib/blobStore'
import type { RoutePhoto } from '@/lib/activityPhotos'
import { type ReportSection, type ReportAuthoredBy } from '@/lib/reportStore'
import SectionEditor from '@/app/components/SectionEditor'
import ActivityPhotoManager from '@/app/components/ActivityPhotoManager'
import SectionNav from '@/components/editorial/SectionNav'
import SectionCard from '@/components/editorial/SectionCard'
import { narrativeStyleFor } from '@/components/resoconto/sectionStyle'

interface Props {
  activityId: string
  activity: StoredActivity
  photos: RoutePhoto[]
  onPhotosChange: (photos: RoutePhoto[]) => void
  initialSections: ReportSection[]
  initialAuthoredBy: ReportAuthoredBy
  onSave: (sections: ReportSection[], authoredBy: ReportAuthoredBy) => Promise<void>
  onCancel: () => void
}

function emptySection(order: number): ReportSection {
  return {
    id: `sec-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    title: 'Nuova sezione',
    body: '',
    photoId: null,
    extraPhotoIds: [],
    order,
  }
}

export default function ManualEditor({
  activityId, activity, photos, onPhotosChange,
  initialSections, initialAuthoredBy, onSave, onCancel,
}: Props) {
  const [sections,   setSections]   = useState<ReportSection[]>(initialSections)
  const [authoredBy, setAuthoredBy] = useState<ReportAuthoredBy>(initialAuthoredBy)
  const [aiAssistLoadingId, setAiAssistLoadingId] = useState<string | null>(null)
  const [aiAssistError, setAiAssistError] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [showPhotoManager, setShowPhotoManager] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Riordino via Pointer Events — vedi la maniglia GripVertical in SectionEditor.tsx. Non usiamo
  // il drag-and-drop nativo HTML5 (draggable/onDragStart) perché su touch non parte proprio: i
  // Pointer Events unificano mouse e touch, quindi la stessa maniglia funziona ovunque.
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const dragOverIndexRef = useRef<number | null>(null)

  // Indice sezioni (sommario laterale) — stessa componente della lettura finale.
  const [visibleSec, setVisibleSec] = useState(0)
  const sectionRefs = useRef<(HTMLDivElement | null)[]>([])

  // Mirrors latest state into a ref so the unmount-flush effect (which only
  // runs once, on mount/unmount) can read up-to-date values without forcing
  // a re-subscription on every keystroke.
  const latest = useRef({ sections, authoredBy, dirty })
  useEffect(() => { latest.current = { sections, authoredBy, dirty } }, [sections, authoredBy, dirty])

  useEffect(() => {
    function onOpenPhotoManager() { setShowPhotoManager(true) }
    window.addEventListener('dtrek:open-photo-manager', onOpenPhotoManager)
    return () => window.removeEventListener('dtrek:open-photo-manager', onOpenPhotoManager)
  }, [])

  // Flush any unsaved edits when the editor disappears for any reason —
  // "Chiudi editor", the top "Escursione" back button (router.push, bypasses
  // onCancel entirely), or a mobile back gesture — all unmount this component.
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      if (latest.current.dirty) onSave(latest.current.sections, latest.current.authoredBy)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!dirty) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      onSave(sections, authoredBy).then(() => {
        setDirty(false)
        setSavedAt(new Date())
      })
    }, 2000)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections, authoredBy, dirty])

  function updateSection(updated: ReportSection) {
    setSections(prev => prev.map(s => s.id === updated.id ? updated : s))
    if (authoredBy === 'ai') setAuthoredBy('mixed')
    setDirty(true)
  }

  function deleteSection(id: string) {
    setSections(prev => prev.filter(s => s.id !== id).map((s, i) => ({ ...s, order: i })))
    setDirty(true)
  }

  function moveSection(id: string, dir: -1 | 1) {
    setSections(prev => {
      const sorted = [...prev].sort((a, b) => a.order - b.order)
      const idx = sorted.findIndex(s => s.id === id)
      const swapIdx = idx + dir
      if (swapIdx < 0 || swapIdx >= sorted.length) return prev
      const tmp = sorted[idx].order
      sorted[idx].order = sorted[swapIdx].order
      sorted[swapIdx].order = tmp
      return [...sorted]
    })
    setDirty(true)
  }

  // Attivo solo mentre si trascina (dragIndex != null): ascolta il puntatore su tutta la finestra
  // così il riordino segue il dito/mouse anche fuori dai confini della card di partenza, e calcola
  // la sezione più vicina in base alla posizione verticale invece di aspettare eventi di enter/over
  // per-elemento (che il drag-and-drop nativo forniva gratis, ma i Pointer Events no).
  useEffect(() => {
    if (dragIndex == null) return
    dragOverIndexRef.current = null
    const prevUserSelect = document.body.style.userSelect
    document.body.style.userSelect = 'none'

    function handleMove(e: PointerEvent) {
      let closestIdx: number | null = null
      let closestDist = Infinity
      sectionRefs.current.forEach((el, i) => {
        if (!el) return
        const rect = el.getBoundingClientRect()
        const dist = Math.abs(e.clientY - (rect.top + rect.height / 2))
        if (dist < closestDist) { closestDist = dist; closestIdx = i }
      })
      dragOverIndexRef.current = closestIdx
      setDragOverIndex(closestIdx)
    }
    function handleUp() {
      const to = dragOverIndexRef.current
      if (dragIndex != null && to != null && dragIndex !== to) {
        setSections(prev => {
          const sorted = [...prev].sort((a, b) => a.order - b.order)
          const [moved] = sorted.splice(dragIndex, 1)
          sorted.splice(to, 0, moved)
          return sorted.map((s, i) => ({ ...s, order: i }))
        })
        setDirty(true)
      }
      setDragIndex(null)
      setDragOverIndex(null)
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    window.addEventListener('pointercancel', handleUp)
    return () => {
      document.body.style.userSelect = prevUserSelect
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
      window.removeEventListener('pointercancel', handleUp)
    }
  }, [dragIndex])

  function addSection() {
    setSections(prev => [...prev, emptySection(prev.length)])
    setDirty(true)
  }

  const handleAiAssist = useCallback(async (sectionId: string, instruction: string) => {
    const target = sections.find(s => s.id === sectionId)
    if (!target) return
    setAiAssistLoadingId(sectionId)
    setAiAssistError(null)
    try {
      const otherSections = sections
        .filter(s => s.id !== sectionId)
        .map(s => ({ title: s.title, preview: s.body.slice(0, 200) }))

      const res = await fetch('/api/resoconto-assist', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          activityId, sectionTitle: target.title, currentText: target.body,
          instruction, otherSections,
        }),
      })
      if (!res.ok || !res.body) {
        // Il cooldown anti-spam (vedi lib/aiCooldown.ts) e altri errori con un messaggio pensato
        // per l'utente arrivano qui — senza questo l'AI assist fallirebbe in silenzio, lasciando
        // credere all'utente che il click non abbia avuto alcun effetto.
        const j = await res.json().catch(() => ({}))
        throw new Error((j as { message?: string }).message ?? 'Assistente AI non disponibile, riprova tra poco.')
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let acc = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        acc += decoder.decode(value, { stream: true })
        setSections(prev => prev.map(s => s.id === sectionId ? { ...s, body: acc } : s))
      }
      setAuthoredBy(prev => prev === 'manual' ? 'mixed' : prev)
      setDirty(true)
    } catch (e) {
      setAiAssistError(e instanceof Error ? e.message : 'Assistente AI non disponibile, riprova tra poco.')
    } finally {
      setAiAssistLoadingId(null)
    }
  }, [sections, activityId])

  function closePhotoManager() {
    setShowPhotoManager(false)
  }

  async function handleClose() {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    await onSave(sections, authoredBy)
    onCancel()
  }

  const sorted = [...sections].sort((a, b) => a.order - b.order)
  const withText = sorted.filter(s => s.body.trim().length > 0).length

  const navSections = useMemo(
    () => sorted.map((s, i) => ({ key: s.id, title: s.title, empty: !s.body.trim(), ...narrativeStyleFor(i) })),
    [sorted],
  )

  useEffect(() => {
    if (!sorted.length) return
    const state = new Map<number, boolean>()
    const obs = new IntersectionObserver(
      entries => {
        for (const e of entries) {
          const idx = sectionRefs.current.indexOf(e.target as HTMLDivElement)
          if (idx >= 0) state.set(idx, e.isIntersecting)
        }
        const activeIdxs = Array.from(state.entries()).filter(([, v]) => v).map(([k]) => k)
        if (activeIdxs.length > 0) setVisibleSec(Math.max(...activeIdxs))
      },
      { threshold: 0, rootMargin: '-96px 0px -70% 0px' },
    )
    sectionRefs.current.forEach(el => el && obs.observe(el))
    return () => obs.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sorted.length])

  function scrollToSection(idx: number) {
    sectionRefs.current[idx]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // Stessa resa (SectionCard/MagazineBody) della lettura finale — usata sia nel pannello
  // affiancato (xl+, live mentre si scrive) sia nel modal (schermi più piccoli, dove non c'è
  // spazio per una terza colonna).
  function renderPreviewCards() {
    return sorted.map((section, i) => {
      const { icon, color } = narrativeStyleFor(i)
      const primary = photos.find(p => p.id === section.photoId)
      const primaryIdx = primary ? photos.findIndex(p => p.id === primary.id) : -1
      const extraPhotos = (section.extraPhotoIds ?? [])
        .map(id => photos.find(p => p.id === id))
        .filter((p): p is RoutePhoto => !!p)
        .map(p => ({ url: p.url, caption: p.caption }))
      return (
        <SectionCard
          key={section.id}
          title={section.title}
          icon={icon}
          color={color}
          body={section.body}
          sectionPhoto={primary?.url}
          photoCaption={primary ? `${primaryIdx + 1}. ${primary.caption}` : undefined}
          photoIndexBadge={primary ? primaryIdx + 1 : undefined}
          extraPhotos={extraPhotos}
          twoColumns
        />
      )
    })
  }

  return (
    <div className="print:hidden">
      {/* ── Sticky toolbar ── */}
      <div className="sticky top-0 z-20 bg-white border border-stone-200 rounded-xl shadow-sm px-4 py-2.5 mb-4 flex items-center gap-3 flex-wrap">
        <span className="font-display text-xs font-bold uppercase tracking-wide text-stone-600">
          {sorted.length} sezioni · {withText} con testo
        </span>
        <span className="text-[11px] text-stone-400 font-body italic">
          {dirty ? 'Salvataggio…' : savedAt ? 'Salvato' : ''}
        </span>
        <div className="flex-1" />
        <button onClick={() => setShowPreview(s => !s)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-200 text-xs font-display font-bold uppercase tracking-wide text-stone-600 hover:bg-stone-50 transition-colors">
          {showPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          Anteprima
        </button>
        <button onClick={handleClose}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-forest-600 hover:bg-forest-700 text-white text-xs font-display font-bold uppercase tracking-wide transition-colors">
          <Check className="w-3.5 h-3.5" /> Chiudi editor
        </button>
      </div>

      <div className={`md:grid md:grid-cols-[auto_1fr] md:gap-6 md:items-start ${showPreview ? 'xl:grid-cols-[auto_1fr_1fr]' : ''}`}>
        {navSections.length > 1 && (
          <SectionNav sections={navSections} activeIndex={visibleSec} onSelect={scrollToSection} />
        )}

        <div className="min-w-0">
          {sorted.map((section, i) => (
            <div key={section.id} ref={el => { sectionRefs.current[i] = el }}>
              <SectionEditor
                section={section}
                sectionIndex={i}
                totalSections={sorted.length}
                photos={photos}
                onChange={updateSection}
                onDelete={() => deleteSection(section.id)}
                onMoveUp={() => moveSection(section.id, -1)}
                onMoveDown={() => moveSection(section.id, 1)}
                onAiAssist={handleAiAssist}
                aiAssistLoading={aiAssistLoadingId === section.id}
                onDragHandleDown={() => setDragIndex(i)}
                isDragging={dragIndex === i}
                isDragOver={dragOverIndex === i}
              />
            </div>
          ))}

          <button onClick={addSection}
            className="w-full flex items-center justify-center gap-1.5 py-3 rounded-xl border-2 border-dashed border-stone-200 text-xs font-display font-bold uppercase tracking-wide text-stone-400 hover:border-forest-300 hover:text-forest-600 transition-colors mb-4">
            <Plus className="w-4 h-4" /> Aggiungi sezione
          </button>
        </div>

        {/* ── Anteprima live affiancata — solo xl+, dove c'è spazio per una terza colonna; sotto
             xl resta il modal qui sotto, che copre l'intero schermo invece di stringere l'editor. */}
        {showPreview && (
          <div className="hidden xl:block xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto xl:pl-2">
            <h3 className="font-display font-bold text-xs uppercase tracking-wide text-stone-500 mb-3">
              Anteprima live
            </h3>
            {renderPreviewCards()}
          </div>
        )}
      </div>

      {/* ── Preview modal — stessa resa del pannello affiancato, per schermi sotto xl ── */}
      {showPreview && (
        <div className="fixed inset-0 z-30 bg-black/50 flex items-center justify-center p-4 xl:hidden" onClick={() => setShowPreview(false)}>
          <div className="bg-stone-50 rounded-2xl max-w-3xl w-full max-h-[85vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display font-bold text-stone-700">Anteprima</h3>
              <button onClick={() => setShowPreview(false)} className="p-1 rounded hover:bg-stone-200">
                <X className="w-4 h-4 text-stone-500" />
              </button>
            </div>
            {renderPreviewCards()}
          </div>
        </div>
      )}

      {/* ── Photo manager modal ── */}
      {showPhotoManager && (
        <div className="fixed inset-0 z-30 bg-black/50 flex items-center justify-center p-4" onClick={closePhotoManager}>
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display font-bold text-stone-700">Gestione foto</h3>
              <button onClick={closePhotoManager} className="p-1 rounded hover:bg-stone-200">
                <X className="w-4 h-4 text-stone-500" />
              </button>
            </div>
            <ActivityPhotoManager
              activityId={activityId}
              trackPoints={activity.trackPoints}
              photos={photos}
              onPhotosChange={onPhotosChange}
            />
          </div>
        </div>
      )}

      {aiAssistLoadingId && (
        <div className="fixed bottom-4 right-4 z-30 flex items-center gap-2 bg-white border border-stone-200 rounded-xl shadow-lg px-4 py-2.5">
          <Loader2 className="w-4 h-4 text-forest-600 animate-spin" />
          <span className="text-xs font-body italic text-stone-600">L&apos;AI sta scrivendo…</span>
        </div>
      )}

      {aiAssistError && !aiAssistLoadingId && (
        <div className="fixed bottom-4 right-4 z-30 flex items-center gap-2 bg-white border border-amber-200 rounded-xl shadow-lg px-4 py-2.5 max-w-xs">
          <span className="text-xs font-body text-amber-700">{aiAssistError}</span>
          <button onClick={() => setAiAssistError(null)} className="shrink-0 p-0.5 rounded hover:bg-amber-50">
            <X className="w-3.5 h-3.5 text-amber-400" />
          </button>
        </div>
      )}
    </div>
  )
}
