'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Camera, ChevronDown, Globe2, Layers, Library, Loader2, Lock, Pencil, Settings,
  Plus, Route, TrendingUp, X,
} from 'lucide-react'
import RouteHub from '@/components/routehub/RouteHub'
import type { RouteHubItem, SectionKind } from '@/components/routehub/types'
import DiarioSommarioContent from '@/components/diario/DiarioSommarioContent'
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
      { icon: Camera, label: `${d.reportageCount} reportage` },
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

  const diaryToCollectionId = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of collections) for (const id of c.diaryIds) map.set(id, c.id)
    return map
  }, [collections])

  const visibleDiaries = useMemo(() => (diaries ?? []).filter(d => !d.archivedAt), [diaries])

  // selectedCollectionId === null ⇒ "Tutte le Raccolte" (nessun filtro, stesso significato del
  // filtro per Diario in app/resoconto/ResocontoHub.tsx) — non più "Diari senza raccolta", stato
  // che in pratica non esiste mai (ogni Diario ha sempre uno scaffale, vedi DiarioSommarioContent).
  const itemsForCollection = useMemo(() => {
    const filtered = selectedCollectionId === null
      ? visibleDiaries
      : visibleDiaries.filter(d => diaryToCollectionId.get(d.id) === selectedCollectionId)
    const sorted = selectedCollectionId === null
      ? [...filtered].sort((a, b) => a.title.localeCompare(b.title))
      : [...filtered].sort((a, b) => a.shelfPosition - b.shelfPosition)
    return sorted.map(toHubItem)
  }, [visibleDiaries, diaryToCollectionId, selectedCollectionId])

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
        // "Aprire" un Diario è sempre aprire il suo libro impaginato (/diario/libro/[id], scoped ai
        // soli Resoconti di QUESTO Diario) — il drag verso l'alto (e il suo tap-equivalente, la
        // freccia in basso) ci naviga direttamente invece di aprire il Sommario di Screen 2, che
        // resta comunque raggiungibile per la gestione tramite l'icona dedicata sul titolo.
        onBeforeOpen={item => {
          router.push(`/diario/libro/${encodeURIComponent(item.id)}`)
          return false
        }}
        primaryAction={() => null}
        titleAction={item => (
          <button
            onClick={() => router.push(`/diario/${encodeURIComponent(item.id)}`)}
            title="Gestisci questo Diario"
            className="pointer-events-auto shrink-0 p-1"
          >
            <Settings className="w-5 h-5 text-white" style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.5))' }} />
          </button>
        )}
        contextBadge={() => {
          const filterCollection = selectedCollectionId ? collections.find(c => c.id === selectedCollectionId) : null
          return (
            <button
              onClick={() => setCollectionSwitcherOpen(true)}
              className="pointer-events-auto inline-flex items-center gap-1.5 bg-white/15 backdrop-blur-sm text-white text-xs font-semibold px-3 py-1.5 rounded-full"
            >
              <Layers className="w-3.5 h-3.5" />
              {filterCollection ? filterCollection.title : 'Tutte le Raccolte'}
              <ChevronDown className="w-3 h-3" />
            </button>
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
  onSelect: (id: string | null) => void
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
      <div className="shrink-0 flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top,0px)+14px)] pb-3 border-b border-white/10">
        <h2 className="font-display text-base font-bold text-white">Raccolte</h2>
        <button onClick={onClose} aria-label="Chiudi" className="shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom,0px)+16px)]">
        {createError && <p className="text-xs text-red-400 my-3">{createError}</p>}
        <button onClick={() => onSelect(null)} className="w-full flex items-center gap-3.5 py-3 border-b border-white/10 text-left">
          <div className={`w-16 h-16 rounded-xl shrink-0 flex items-center justify-center bg-white/5 ${currentId === null ? 'ring-2 ring-sky-400' : ''}`}>
            <Library className="w-6 h-6 text-white/30" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-display font-semibold text-[15px] text-white truncate">Tutte le Raccolte</p>
            <p className="text-[11px] text-white/50 mt-1.5">{currentId === null ? 'Filtro attuale' : `${collections.length} Raccolte`}</p>
          </div>
        </button>
        {collections.map(c => (
          <div key={c.id} className="relative flex items-center gap-3.5 py-3 border-b border-white/10">
            <button onClick={() => onSelect(c.id)} className="flex items-center gap-3.5 flex-1 min-w-0 text-left">
              <div className={`w-16 h-16 rounded-xl shrink-0 overflow-hidden relative ${c.id === currentId ? 'ring-2 ring-sky-400' : ''}`}>
                {c.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.coverUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
                ) : (
                  <CollectionSpineFallback />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-display font-semibold text-[15px] text-white truncate">{c.title}</p>
                <p className="text-[11px] text-white/50 mt-1.5 flex items-center gap-1.5">
                  {c.volumeCount} diari · {c.reportageCount} reportage
                  {c.isPublished
                    ? <span className="inline-flex items-center gap-1"><Globe2 className="w-3 h-3" /></span>
                    : <span className="inline-flex items-center gap-1"><Lock className="w-3 h-3" /></span>}
                </p>
              </div>
            </button>
            <button
              onClick={() => router.push(`/raccolte/${encodeURIComponent(c.id)}`)}
              title="Modifica questa Raccolta"
              className="shrink-0 p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
            >
              <Pencil className="w-4 h-4" />
            </button>
          </div>
        ))}
        <button
          onClick={createCollection}
          disabled={creating}
          className="w-full flex items-center gap-3.5 py-3 text-left text-white/60 hover:text-white transition-colors disabled:opacity-60"
        >
          <div className="w-16 h-16 rounded-xl shrink-0 border-2 border-dashed border-white/25 flex items-center justify-center">
            {creating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
          </div>
          <span className="text-sm font-semibold">Nuova raccolta</span>
        </button>
      </div>
    </div>
  )
}
