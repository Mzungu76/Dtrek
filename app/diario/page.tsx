'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Camera, ChevronDown, Globe2, Image as ImageIcon, Layers, Library, ListChecks, Loader2, Lock, Pencil,
  Plus, Route, TrendingUp, X,
} from 'lucide-react'
import RouteHub from '@/components/routehub/RouteHub'
import type { RouteHubItem, SectionKind } from '@/components/routehub/types'
import DiarioSommarioContent from '@/components/diario/DiarioSommarioContent'
import { normalizeDiaryConfig, DEFAULT_DIARY_CONFIG, type DiaryConfig } from '@/lib/diaryConfig'
import { uploadDiaryCover } from '@/lib/diaryCoverUpload'
import { uploadCollectionCover } from '@/lib/collectionCoverUpload'
import { getBrowserSupabase } from '@/lib/supabaseBrowser'
import type { DiarySummary } from '@/app/api/diaries/route'
import type { CollectionSummary } from '@/app/api/collections/route'

interface DiarioHubItem extends RouteHubItem {
  diary: DiarySummary
}

function toHubItem(d: DiarySummary): DiarioHubItem {
  return {
    id: d.id,
    title: d.title,
    coverPhotoUrl: d.coverUrl ?? undefined,
    statPills: [
      { icon: Camera, label: `${d.reportageCount} resoconti` },
      { icon: Route, label: `${(d.distanceMeters / 1000).toFixed(0)} km` },
      { icon: TrendingUp, label: `${Math.round(d.elevationGain)} m D+` },
    ],
    sortValues: {
      date: d.lastActivityAt ? new Date(d.lastActivityAt).getTime() : 0,
      km: d.distanceMeters,
      dplus: d.elevationGain,
      count: d.reportageCount,
    },
    diary: d,
  }
}

// Hub "Diari" — copertina a schermo intero come /guida e /resoconto (stesso RouteHub, mode
// 'diario'): trascinamento verso l'alto per aprire il Sommario del Diario in copertina, swipe
// orizzontale per scorrere i Diari della stessa Raccolta. Il Diario in copertina è l'ultimo su cui
// l'utente ha lavorato (user_settings.last_diary_id — un campo che esisteva già, scritto da
// nessuno e letto da nessuno: lo aggancio qui), altrimenti il Diario di default.
export default function DiarioHubPage() {
  const router = useRouter()

  const [diaries, setDiaries] = useState<DiarySummary[] | null>(null)
  const [collections, setCollections] = useState<CollectionSummary[]>([])
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null)
  const [currentItemId, setCurrentItemId] = useState<string | null>(null)
  const initializedRef = useRef(false)

  const [collectionSwitcherOpen, setCollectionSwitcherOpen] = useState(false)

  const [creatingDiary, setCreatingDiary] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const [diaryEditOpen, setDiaryEditOpen] = useState(false)
  // L'item "live" passato da RouteHub a titleAction/contextBadge, non lo stato (debounced) di
  // currentItemId — altrimenti uno swipe seguito subito da un tap sulla matita potrebbe salvare
  // sul Diario/Raccolta appena lasciato invece di quello mostrato.
  const [diaryEditTarget, setDiaryEditTarget] = useState<DiarySummary | null>(null)
  const [diaryEditConfig, setDiaryEditConfig] = useState<DiaryConfig | null>(null)
  const [diaryEditLoading, setDiaryEditLoading] = useState(false)
  const [diaryCoverUploading, setDiaryCoverUploading] = useState(false)
  const [diaryCoverError, setDiaryCoverError] = useState<string | null>(null)
  const diaryCoverInputRef = useRef<HTMLInputElement>(null)

  const [collectionEditOpen, setCollectionEditOpen] = useState(false)
  const [collectionEditTarget, setCollectionEditTarget] = useState<CollectionSummary | null>(null)
  const [collectionCoverUploading, setCollectionCoverUploading] = useState(false)
  const [collectionCoverError, setCollectionCoverError] = useState<string | null>(null)
  const collectionCoverInputRef = useRef<HTMLInputElement>(null)

  function loadAll() {
    return Promise.all([
      fetch('/api/diaries').then(r => r.ok ? r.json() : []),
      fetch('/api/collections').then(r => r.ok ? r.json() : []),
    ]).then(([ds, cs]: [DiarySummary[], CollectionSummary[]]) => {
      setDiaries(ds)
      setCollections(cs)
      return { ds, cs }
    })
  }

  useEffect(() => {
    Promise.all([loadAll(), fetch('/api/user-settings').then(r => r.ok ? r.json() : {})])
      .then(([{ ds, cs }, us]: [{ ds: DiarySummary[]; cs: CollectionSummary[] }, { lastDiaryId?: string | null }]) => {
        if (initializedRef.current) return
        initializedRef.current = true
        const visible = ds.filter(d => !d.archivedAt)
        const featured = visible.find(d => d.id === us.lastDiaryId) ?? visible.find(d => d.isDefault) ?? visible[0]
        if (!featured) return
        const map = new Map<string, string>()
        for (const c of cs) for (const id of c.diaryIds) map.set(id, c.id)
        setSelectedCollectionId(map.get(featured.id) ?? null)
        setCurrentItemId(featured.id)
      })
  }, [])

  // Chiude il popover "modifica Diario" se cambia il Diario in copertina (swipe, o cambio
  // Raccolta) — evita di salvare per sbaglio sul Diario sbagliato se restasse aperto.
  useEffect(() => { setDiaryEditOpen(false); setDiaryEditConfig(null); setDiaryEditTarget(null) }, [currentItemId])
  useEffect(() => { setCollectionEditOpen(false); setCollectionEditTarget(null) }, [selectedCollectionId])

  const diaryToCollectionId = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of collections) for (const id of c.diaryIds) map.set(id, c.id)
    return map
  }, [collections])

  const visibleDiaries = useMemo(() => (diaries ?? []).filter(d => !d.archivedAt), [diaries])

  const itemsForCollection = useMemo(() => visibleDiaries
    .filter(d => diaryToCollectionId.get(d.id) === selectedCollectionId)
    .sort((a, b) => a.shelfPosition - b.shelfPosition)
    .map(toHubItem),
  [visibleDiaries, diaryToCollectionId, selectedCollectionId])

  const currentDiary = itemsForCollection.find(i => i.id === currentItemId)?.diary ?? itemsForCollection[0]?.diary ?? null
  const initialIndex = Math.max(0, itemsForCollection.findIndex(i => i.id === currentItemId))

  async function createDiary() {
    setCreatingDiary(true); setCreateError(null)
    try {
      const res = await fetch('/api/diaries', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(selectedCollectionId ? { shelfId: selectedCollectionId } : {}),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message ?? data.error ?? `HTTP ${res.status}`)
      await loadAll()
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : String(e))
    } finally {
      setCreatingDiary(false)
    }
  }

  function openDiaryEdit(diary: DiarySummary) {
    setDiaryEditTarget(diary)
    setDiaryEditOpen(true)
    setDiaryEditLoading(true)
    fetch(`/api/diaries/${encodeURIComponent(diary.id)}/config`)
      .then(r => r.ok ? r.json() : DEFAULT_DIARY_CONFIG)
      .then(c => setDiaryEditConfig(normalizeDiaryConfig(c)))
      .finally(() => setDiaryEditLoading(false))
  }

  async function saveDiaryField(field: 'title' | 'subtitle' | 'coverUrl', value: string) {
    if (!diaryEditTarget || !diaryEditConfig) return
    const id = diaryEditTarget.id
    const merged = { ...diaryEditConfig, [field]: value }
    setDiaryEditConfig(merged)
    try {
      const res = await fetch(`/api/diaries/${encodeURIComponent(id)}/config`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(merged),
      })
      if (!res.ok) throw new Error()
      setDiaries(ds => ds?.map(d => d.id === id ? { ...d, [field]: value } : d) ?? ds)
    } catch { /* un refresh manuale mostrerà lo stato reale */ }
  }

  async function handleDiaryCoverUpload(file: File) {
    if (!diaryEditTarget) return
    setDiaryCoverUploading(true); setDiaryCoverError(null)
    try {
      const supabase = getBrowserSupabase()
      await supabase.auth.getSession()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Non autenticato')
      const url = await uploadDiaryCover(user.id, file, diaryEditTarget.id)
      await saveDiaryField('coverUrl', url)
    } catch (e) {
      setDiaryCoverError(e instanceof Error ? e.message : String(e))
    } finally {
      setDiaryCoverUploading(false)
    }
  }

  function openCollectionEdit(collection: CollectionSummary) {
    setCollectionEditTarget(collection)
    setCollectionEditOpen(true)
  }

  async function patchCollectionField(field: 'title' | 'subtitle', value: string) {
    if (!collectionEditTarget) return
    const id = collectionEditTarget.id
    setCollections(cs => cs.map(c => c.id === id ? { ...c, [field]: value } : c))
    try {
      const res = await fetch(`/api/collections/${encodeURIComponent(id)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [field]: value }),
      })
      if (!res.ok) throw new Error()
    } catch { loadAll() }
  }

  async function handleCollectionCoverUpload(file: File) {
    if (!collectionEditTarget) return
    setCollectionCoverUploading(true); setCollectionCoverError(null)
    try {
      const supabase = getBrowserSupabase()
      await supabase.auth.getSession()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Non autenticato')
      const url = await uploadCollectionCover(user.id, file, collectionEditTarget.id)
      const id = collectionEditTarget.id
      const res = await fetch(`/api/collections/${encodeURIComponent(id)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ coverUrl: url }),
      })
      if (!res.ok) throw new Error()
      setCollections(cs => cs.map(c => c.id === id ? { ...c, coverUrl: url } : c))
    } catch (e) {
      setCollectionCoverError(e instanceof Error ? e.message : String(e))
    } finally {
      setCollectionCoverUploading(false)
    }
  }

  function handleSectionChange(section: SectionKind | null) {
    if (!section || !currentDiary) return
    // "L'ultimo Diario su cui l'utente ha lavorato" — il momento in cui apre davvero il Sommario,
    // non ogni fotogramma di uno swipe di passaggio (vedi RouteHub.onIndexChange, debounced per lo
    // stesso motivo).
    fetch('/api/user-settings', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lastDiaryId: currentDiary.id }),
    }).catch(() => {})
  }

  if (diaries === null) {
    return (
      <div className="fixed inset-0 bg-[#0b1a24] flex items-center justify-center text-stone-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    )
  }

  return (
    <>
      <RouteHub
        mode="diario"
        items={itemsForCollection}
        initialIndex={initialIndex}
        onIndexChange={item => setCurrentItemId(item.id)}
        onSectionChange={handleSectionChange}
        bodyMode="continuous"
        showToolsMenu={false}
        topOverlayVariant="magazine"
        emptyNoun="Diario"
        emptyAction={
          <div className="flex flex-col items-center gap-2">
            <button onClick={createDiary} disabled={creatingDiary}
              className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-white text-stone-800 text-sm font-semibold">
              {creatingDiary ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Nuovo Diario in questa Raccolta
            </button>
            {collections.length > 1 && (
              <button onClick={() => setCollectionSwitcherOpen(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 text-white text-sm font-semibold">
                <Library className="w-4 h-4" />
                Cambia raccolta
              </button>
            )}
          </div>
        }
        subtitle={item => (item as DiarioHubItem).diary.subtitle}
        importLabel="Nuovo diario"
        onImport={createDiary}
        renderSection={(_section, item) => (
          <DiarioSommarioContent
            diaryId={item.id}
            onDeleted={() => loadAll()}
            onChanged={() => loadAll()}
          />
        )}
        // "Aprire" il Diario di default è aprire il libro impaginato (/diario/libro, una rotta a
        // sé — nessun'altra pagina sa mostrare TUTTE le attività dell'utente come lui): il drag
        // verso l'alto (e il suo tap-equivalente, la freccia in basso) ci naviga direttamente
        // invece di aprire il Sommario di Screen 2, che per gli altri Diari resta il contenuto.
        onBeforeOpen={item => {
          if ((item as DiarioHubItem).diary.isDefault) { router.push('/diario/libro'); return false }
          return true
        }}
        primaryAction={() => null}
        titleAction={item => (
          <div className="relative shrink-0 flex items-center gap-1">
            <button
              onClick={() => router.push(`/diario/${encodeURIComponent(item.id)}`)}
              title="Gestisci questo Diario"
              className="pointer-events-auto p-1"
            >
              <ListChecks className="w-5 h-5 text-white" style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.5))' }} />
            </button>
            <button onClick={() => openDiaryEdit((item as DiarioHubItem).diary)} title="Modifica questo Diario" className="pointer-events-auto p-1">
              <Pencil className="w-5 h-5 text-white" style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.5))' }} />
            </button>
            {diaryEditOpen && (
              <div className="absolute z-30 top-full right-0 mt-2 w-72 bg-white rounded-2xl shadow-xl p-4 text-left">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-barlow font-bold uppercase tracking-widest text-stone-400">Modifica Diario</span>
                  <button onClick={() => setDiaryEditOpen(false)} className="text-stone-400 hover:text-stone-600"><X className="w-3.5 h-3.5" /></button>
                </div>
                {diaryEditLoading || !diaryEditConfig ? (
                  <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-stone-400" /></div>
                ) : (
                  <>
                    <label className="block text-[10px] font-barlow font-bold uppercase tracking-widest text-stone-400 mb-1">Titolo</label>
                    <input
                      defaultValue={diaryEditConfig.title}
                      onBlur={e => saveDiaryField('title', e.target.value)}
                      placeholder="Titolo del Diario"
                      className="w-full text-sm border border-stone-200 rounded-lg px-2.5 py-1.5 mb-2.5 outline-none focus:ring-1 focus:ring-forest-400"
                    />
                    <label className="block text-[10px] font-barlow font-bold uppercase tracking-widest text-stone-400 mb-1">Sottotitolo</label>
                    <input
                      defaultValue={diaryEditConfig.subtitle}
                      onBlur={e => saveDiaryField('subtitle', e.target.value)}
                      placeholder="Sottotitolo"
                      className="w-full text-sm border border-stone-200 rounded-lg px-2.5 py-1.5 mb-3 outline-none focus:ring-1 focus:ring-forest-400"
                    />
                    <button
                      onClick={() => diaryCoverInputRef.current?.click()}
                      disabled={diaryCoverUploading}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-semibold transition-colors disabled:opacity-60"
                    >
                      {diaryCoverUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImageIcon className="w-3.5 h-3.5" />}
                      Cambia copertina
                    </button>
                    <input ref={diaryCoverInputRef} type="file" accept="image/*" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) { handleDiaryCoverUpload(f); e.target.value = '' } }} />
                    {diaryCoverError && <p className="text-xs text-red-600 mt-2">{diaryCoverError}</p>}
                  </>
                )}
              </div>
            )}
          </div>
        )}
        contextBadge={item => {
          const diaryId = (item as DiarioHubItem).diary.id
          const collectionForItem = collections.find(c => c.diaryIds.includes(diaryId)) ?? null
          return (
          <div className="relative flex items-center gap-2">
            <button
              onClick={() => setCollectionSwitcherOpen(true)}
              className="pointer-events-auto inline-flex items-center gap-1.5 bg-white/15 backdrop-blur-sm text-white text-xs font-semibold px-3 py-1.5 rounded-full"
            >
              <Layers className="w-3.5 h-3.5" />
              {collectionForItem ? collectionForItem.title : 'Nessuna raccolta'}
              <ChevronDown className="w-3 h-3" />
            </button>
            {collectionForItem && (
              <button
                onClick={() => openCollectionEdit(collectionForItem)}
                title="Modifica questa Raccolta"
                className="pointer-events-auto w-7 h-7 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center"
              >
                <Pencil className="w-3.5 h-3.5 text-white" />
              </button>
            )}
            {collectionEditOpen && collectionEditTarget && (
              <div className="absolute z-30 top-full left-0 mt-2 w-72 bg-white rounded-2xl shadow-xl p-4 text-left">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-barlow font-bold uppercase tracking-widest text-stone-400">Modifica Raccolta</span>
                  <button onClick={() => setCollectionEditOpen(false)} className="text-stone-400 hover:text-stone-600"><X className="w-3.5 h-3.5" /></button>
                </div>
                <label className="block text-[10px] font-barlow font-bold uppercase tracking-widest text-stone-400 mb-1">Titolo</label>
                <input
                  defaultValue={collectionEditTarget.title}
                  onBlur={e => patchCollectionField('title', e.target.value)}
                  className="w-full text-sm border border-stone-200 rounded-lg px-2.5 py-1.5 mb-2.5 outline-none focus:ring-1 focus:ring-forest-400"
                />
                <label className="block text-[10px] font-barlow font-bold uppercase tracking-widest text-stone-400 mb-1">Sottotitolo</label>
                <input
                  defaultValue={collectionEditTarget.subtitle}
                  onBlur={e => patchCollectionField('subtitle', e.target.value)}
                  placeholder="es. Tre stagioni sullo stesso crinale"
                  className="w-full text-sm border border-stone-200 rounded-lg px-2.5 py-1.5 mb-3 outline-none focus:ring-1 focus:ring-forest-400"
                />
                <button
                  onClick={() => collectionCoverInputRef.current?.click()}
                  disabled={collectionCoverUploading}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-semibold transition-colors disabled:opacity-60"
                >
                  {collectionCoverUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImageIcon className="w-3.5 h-3.5" />}
                  Cambia copertina
                </button>
                <input ref={collectionCoverInputRef} type="file" accept="image/*" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) { handleCollectionCoverUpload(f); e.target.value = '' } }} />
                {collectionCoverError && <p className="text-xs text-red-600 mt-2">{collectionCoverError}</p>}
              </div>
            )}
          </div>
          )
        }}
      />

      {createError && (
        <div className="fixed bottom-24 inset-x-4 z-50 bg-red-600 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg">
          {createError}
        </div>
      )}

      {collectionSwitcherOpen && (
        <CollectionSwitcherOverlay
          collections={collections}
          currentId={selectedCollectionId}
          onSelect={id => { setSelectedCollectionId(id); setCollectionSwitcherOpen(false) }}
          onClose={() => setCollectionSwitcherOpen(false)}
        />
      )}
    </>
  )
}

// Fallback per le Raccolte senza copertina propria — un motivo a "dorsi di libri" invece del
// semplice sfondo sfumato piatto di prima, per far leggere a colpo d'occhio che una tessera è
// una Raccolta (uno scaffale) anche senza foto.
function CollectionSpineFallback() {
  return (
    <div className="absolute inset-0 flex" style={{ background: 'linear-gradient(158deg,#132b19 0%,#1c4724 45%,#20592b 100%)' }}>
      {[18, 12, 22, 15, 10, 23].map((w, i) => (
        <div
          key={i}
          className="h-full border-r border-black/25"
          style={{ width: `${w}%`, background: i % 2 === 0 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.14)' }}
        />
      ))}
      <div className="absolute inset-0 flex items-center justify-center opacity-20">
        <Library className="w-10 h-10 text-white" />
      </div>
    </div>
  )
}

function CollectionSwitcherOverlay({ collections, currentId, onSelect, onClose }: {
  collections: CollectionSummary[]
  currentId: string | null
  onSelect: (id: string) => void
  onClose: () => void
}) {
  const router = useRouter()
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  // Crea subito una Raccolta vuota e porta alla sua pagina di composizione (/raccolte/[id]), che
  // ha già rinomina/riordino/eliminazione — niente da duplicare qui dentro.
  async function createCollection() {
    setCreating(true); setCreateError(null)
    try {
      const res = await fetch('/api/collections', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message ?? data.error ?? `HTTP ${res.status}`)
      router.push(`/raccolte/${encodeURIComponent(data.id)}`)
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : String(e))
      setCreating(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#0b1a24] flex flex-col">
      <div className="shrink-0 flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top,0px)+14px)] pb-3">
        <h2 className="font-display text-base font-bold text-white">Raccolte</h2>
        <button onClick={onClose} aria-label="Chiudi" className="shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom,0px)+16px)]">
        {createError && <p className="text-xs text-red-400 mb-3">{createError}</p>}
        <div className="grid grid-cols-2 gap-3">
          {collections.map(c => (
            <div
              key={c.id}
              className={`aspect-square rounded-2xl overflow-hidden relative ${c.id === currentId ? 'ring-2 ring-sky-400' : 'ring-1 ring-white/10'}`}
            >
              <button onClick={() => onSelect(c.id)} className="absolute inset-0 w-full h-full text-left">
                {c.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.coverUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
                ) : (
                  <CollectionSpineFallback />
                )}
                <div className="absolute inset-0 bg-topography opacity-40" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 to-black/10" />
                <div className="absolute bottom-0 inset-x-0 p-3">
                  <p className="font-display font-bold text-white text-sm leading-tight truncate pr-6">{c.title}</p>
                  <p className="text-white/70 text-[11px] mt-1 flex items-center gap-1.5">
                    {c.volumeCount} diari · {c.reportageCount} resoconti
                    {c.isPublished
                      ? <span className="inline-flex items-center gap-1"><Globe2 className="w-3 h-3" /></span>
                      : <span className="inline-flex items-center gap-1"><Lock className="w-3 h-3" /></span>}
                  </p>
                </div>
              </button>
              <button
                onClick={() => router.push(`/raccolte/${encodeURIComponent(c.id)}`)}
                title="Modifica questa Raccolta"
                className="absolute top-2 right-2 z-10 w-7 h-7 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/60 transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          <button
            onClick={createCollection}
            disabled={creating}
            className="aspect-square rounded-2xl border-2 border-dashed border-white/25 hover:border-white/40 flex flex-col items-center justify-center gap-2 text-white/60 hover:text-white/90 transition-colors disabled:opacity-60"
          >
            {creating ? <Loader2 className="w-6 h-6 animate-spin" /> : <Plus className="w-6 h-6" />}
            <span className="text-xs font-semibold">Nuova raccolta</span>
          </button>
        </div>
      </div>
    </div>
  )
}
