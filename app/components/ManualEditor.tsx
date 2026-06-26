'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Eye, EyeOff, X, Plus, Check, Loader2 } from 'lucide-react'
import type { StoredActivity } from '@/lib/blobStore'
import { fetchActivityPhotos, type RoutePhoto } from '@/lib/activityPhotos'
import { type ReportSection, type ReportAuthoredBy } from '@/lib/reportStore'
import SectionEditor from '@/app/components/SectionEditor'
import SectionCard from '@/app/components/ResocontoSectionCard'
import ActivityPhotoManager from '@/app/components/ActivityPhotoManager'

interface Props {
  activityId: string
  activity: StoredActivity
  photos: RoutePhoto[]
  onPhotosChange: (photos: RoutePhoto[]) => void
  initialSections: ReportSection[]
  initialAuthoredBy: ReportAuthoredBy
  onSave: (sections: ReportSection[], authoredBy: ReportAuthoredBy) => Promise<void>
  onCancel: () => void
  saving: boolean
}

function emptySection(order: number): ReportSection {
  return {
    id: `sec-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    title: 'Nuova sezione',
    body: '',
    photoId: null,
    order,
  }
}

export default function ManualEditor({
  activityId, activity, photos, onPhotosChange,
  initialSections, initialAuthoredBy, onSave, onCancel, saving,
}: Props) {
  const [sections,   setSections]   = useState<ReportSection[]>(initialSections)
  const [authoredBy, setAuthoredBy] = useState<ReportAuthoredBy>(initialAuthoredBy)
  const [aiAssistLoadingId, setAiAssistLoadingId] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [showPhotoManager, setShowPhotoManager] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  function addSection() {
    setSections(prev => [...prev, emptySection(prev.length)])
    setDirty(true)
  }

  const handleAiAssist = useCallback(async (sectionId: string, instruction: string) => {
    const target = sections.find(s => s.id === sectionId)
    if (!target) return
    setAiAssistLoadingId(sectionId)
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
      if (!res.ok || !res.body) throw new Error('AI assist failed')

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
    } catch {
      /* leave section body unchanged on failure */
    } finally {
      setAiAssistLoadingId(null)
    }
  }, [sections, activityId])

  async function closePhotoManager() {
    setShowPhotoManager(false)
    const fresh = await fetchActivityPhotos(activityId)
    onPhotosChange(fresh)
  }

  async function handleClose() {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    await onSave(sections, authoredBy)
    onCancel()
  }

  const sorted = [...sections].sort((a, b) => a.order - b.order)
  const withText = sorted.filter(s => s.body.trim().length > 0).length

  return (
    <div className="print:hidden">
      {/* ── Sticky toolbar ── */}
      <div className="sticky top-0 z-20 bg-white border border-stone-200 rounded-xl shadow-sm px-4 py-2.5 mb-4 flex items-center gap-3 flex-wrap">
        <span className="font-barlow text-xs font-bold uppercase tracking-wide text-stone-600">
          {sorted.length} sezioni · {withText} con testo
        </span>
        <span className="text-[11px] text-stone-400 font-lora italic">
          {saving || dirty ? 'Salvataggio…' : savedAt ? 'Salvato' : ''}
        </span>
        <div className="flex-1" />
        <button onClick={() => setShowPreview(s => !s)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-200 text-xs font-barlow font-bold uppercase tracking-wide text-stone-600 hover:bg-stone-50 transition-colors">
          {showPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          Anteprima
        </button>
        <button onClick={handleClose}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-forest-600 hover:bg-forest-700 text-white text-xs font-barlow font-bold uppercase tracking-wide transition-colors">
          <Check className="w-3.5 h-3.5" /> Chiudi editor
        </button>
      </div>

      {sorted.map((section, i) => (
        <SectionEditor
          key={section.id}
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
        />
      ))}

      <button onClick={addSection}
        className="w-full flex items-center justify-center gap-1.5 py-3 rounded-xl border-2 border-dashed border-stone-200 text-xs font-barlow font-bold uppercase tracking-wide text-stone-400 hover:border-forest-300 hover:text-forest-600 transition-colors mb-4">
        <Plus className="w-4 h-4" /> Aggiungi sezione
      </button>

      {/* ── Preview modal ── */}
      {showPreview && (
        <div className="fixed inset-0 z-30 bg-black/50 flex items-center justify-center p-4" onClick={() => setShowPreview(false)}>
          <div className="bg-stone-50 rounded-2xl max-w-3xl w-full max-h-[85vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-barlow font-bold text-stone-700">Anteprima</h3>
              <button onClick={() => setShowPreview(false)} className="p-1 rounded hover:bg-stone-200">
                <X className="w-4 h-4 text-stone-500" />
              </button>
            </div>
            {sorted.map((section, i) => {
              const photo = photos.find(p => p.id === section.photoId)
              const photoIndex = photo ? photos.findIndex(p => p.id === photo.id) + 1 : undefined
              return (
                <SectionCard key={section.id} section={section} index={i} photo={photo} photoIndex={photoIndex} />
              )
            })}
          </div>
        </div>
      )}

      {/* ── Photo manager modal ── */}
      {showPhotoManager && (
        <div className="fixed inset-0 z-30 bg-black/50 flex items-center justify-center p-4" onClick={closePhotoManager}>
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-barlow font-bold text-stone-700">Gestione foto</h3>
              <button onClick={closePhotoManager} className="p-1 rounded hover:bg-stone-200">
                <X className="w-4 h-4 text-stone-500" />
              </button>
            </div>
            <ActivityPhotoManager
              activityId={activityId}
              trackPoints={activity.trackPoints}
              activityTitle={activity.title ?? undefined}
              distanceMeters={activity.distanceMeters}
              elevationGain={activity.elevationGain}
            />
          </div>
        </div>
      )}

      {aiAssistLoadingId && (
        <div className="fixed bottom-4 right-4 z-30 flex items-center gap-2 bg-white border border-stone-200 rounded-xl shadow-lg px-4 py-2.5">
          <Loader2 className="w-4 h-4 text-forest-600 animate-spin" />
          <span className="text-xs font-lora italic text-stone-600">L&apos;AI sta scrivendo…</span>
        </div>
      )}
    </div>
  )
}
