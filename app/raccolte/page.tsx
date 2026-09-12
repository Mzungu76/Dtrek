'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2, Plus } from 'lucide-react'
import Navbar, { MOBILE_TOPBAR_SPACER } from '@/components/Navbar'
import { getBrowserSupabase } from '@/lib/supabaseBrowser'
import { uploadCollectionCover } from '@/lib/collectionCoverUpload'
import { uploadDiaryCover } from '@/lib/diaryCoverUpload'
import RaccoltaSection, { type RaccoltaSectionActions } from '@/components/raccolte/RaccoltaSection'
import { useRowDrag } from '@/components/raccolte/useRowDrag'
import MovePicker, { type MovePickerOption } from '@/components/raccolte/MovePicker'
import type { RaccoltaTreeNode } from '@/app/api/collections/tree/route'

const RACCOLTA_ROW_H = 64

async function currentUserId(): Promise<string> {
  const supabase = getBrowserSupabase()
  // getSession() rinfresca proattivamente un token vicino alla scadenza prima del controllo,
  // stesso motivo/commento di app/diario/libro/[id]/page.tsx (handleCoverUpload).
  await supabase.auth.getSession()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Non autenticato')
  return user.id
}

// Pagina Raccolte come centro di controllo — Direzione A del mockup approvato
// (docs/mockup-raccolte-controlcenter/Main.dc.html): l'intera gerarchia Raccolta → Diario →
// Reportage in un solo albero, con trascinamento reale per riordinare Raccolte fra loro e Diari
// dentro una Raccolta (l'unica pagina dell'app che lo fa — vedi il README dei mockup). Spostare un
// Diario in un'ALTRA Raccolta, o un Reportage in un ALTRO Diario, passa invece da un selettore
// (MovePicker) invece che dal trascinamento: stesso principio già usato altrove nell'app per
// esattamente questa operazione (ManageReportageOverlay in app/resoconto/ResocontoHub.tsx) — i
// Reportage inoltre non hanno un ordine proprio da riordinare (sono sempre mostrati per data), solo
// da spostare.
export default function RaccolteTreePage() {
  const router = useRouter()
  const [tree, setTree] = useState<RaccoltaTreeNode[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const [expandedRaccolte, setExpandedRaccolte] = useState<Set<string>>(new Set())
  const [expandedDiari, setExpandedDiari] = useState<Set<string>>(new Set())
  const [kebabOpenId, setKebabOpenId] = useState<string | null>(null)
  const [raccoltaCoverUploadingId, setRaccoltaCoverUploadingId] = useState<string | null>(null)
  const [diarioCoverUploadingId, setDiarioCoverUploadingId] = useState<string | null>(null)
  const [raccoltaPublishBusyId, setRaccoltaPublishBusyId] = useState<string | null>(null)
  const [diarioPublishBusyId, setDiarioPublishBusyId] = useState<string | null>(null)
  const [reportagePublishBusyId, setReportagePublishBusyId] = useState<string | null>(null)
  const [movePicker, setMovePicker] = useState<{ kind: 'diario'; diarioId: string; currentRaccoltaId: string } | { kind: 'reportage'; reportageId: string; linkedPlannedId: string; currentDiarioId: string } | null>(null)

  function load() {
    fetch('/api/collections/tree')
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((data: RaccoltaTreeNode[]) => {
        setTree(data)
        // Tutte le Raccolte aperte di default — "l'intera gerarchia in un colpo d'occhio" era la
        // richiesta originale — i Diari restano chiusi (i loro Reportage si aprono al tocco).
        setExpandedRaccolte(new Set(data.map(r => r.id)))
      })
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
  }
  useEffect(() => { load() }, [])

  function updateTree(fn: (t: RaccoltaTreeNode[]) => RaccoltaTreeNode[]) {
    setTree(t => t ? fn(t) : t)
  }
  function reportError(e: unknown) {
    setError(e instanceof Error ? e.message : String(e))
  }

  // ── Raccolte: crea / riordina ──────────────────────────────────────────────────────────────
  async function createRaccolta() {
    setCreating(true); setError(null)
    try {
      const res = await fetch('/api/collections', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message ?? data.error ?? `HTTP ${res.status}`)
      load()
    } catch (e) {
      reportError(e)
    } finally {
      setCreating(false)
    }
  }

  async function commitRaccolteReorder(from: number, to: number) {
    if (!tree) return
    const copy = [...tree]
    const [moved] = copy.splice(from, 1)
    copy.splice(to, 0, moved)
    setTree(copy)
    try {
      await Promise.all(
        copy.map((r, i) => r.position === i ? null : fetch(`/api/collections/${r.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ position: i }),
        })),
      )
      updateTree(t => t.map((r, i) => ({ ...r, position: i })))
    } catch (e) {
      reportError(e)
      load()
    }
  }
  const raccolteDrag = useRowDrag(RACCOLTA_ROW_H, tree?.length ?? 0, commitRaccolteReorder)

  // ── Una Raccolta: rinomina / elimina / copertina / dettagli ───────────────────────────────
  async function renameRaccolta(id: string, title: string) {
    updateTree(t => t.map(r => r.id === id ? { ...r, title } : r))
    setKebabOpenId(null)
    try {
      const res = await fetch(`/api/collections/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`)
    } catch (e) {
      reportError(e); load()
    }
  }
  async function deleteRaccolta(id: string) {
    setKebabOpenId(null)
    if (!window.confirm('Eliminare questa Raccolta?')) return
    try {
      const res = await fetch(`/api/collections/${id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      updateTree(t => t.filter(r => r.id !== id))
    } catch (e) {
      reportError(e)
    }
  }
  async function pickRaccoltaCover(id: string, file: File) {
    setRaccoltaCoverUploadingId(id); setError(null)
    try {
      const userId = await currentUserId()
      const url = await uploadCollectionCover(userId, file, id)
      const res = await fetch(`/api/collections/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ coverUrl: url }) })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`)
      updateTree(t => t.map(r => r.id === id ? { ...r, coverUrl: url } : r))
    } catch (e) {
      reportError(e)
    } finally {
      setRaccoltaCoverUploadingId(null)
    }
  }
  // Accendi/spegni la pubblicazione direttamente dall'albero — stesso contratto PATCH garantisce/
  // DELETE revoca già usato in /raccolte/[id], solo senza passare da quella pagina.
  async function toggleRaccoltaPublish(id: string, currentlyPublished: boolean) {
    setRaccoltaPublishBusyId(id); setError(null)
    try {
      const res = await fetch(`/api/collections/${id}/token`, {
        method: currentlyPublished ? 'DELETE' : 'PATCH',
        headers: currentlyPublished ? undefined : { 'Content-Type': 'application/json' },
        body: currentlyPublished ? undefined : '{}',
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`)
      updateTree(t => t.map(r => r.id === id ? { ...r, isPublished: !currentlyPublished } : r))
    } catch (e) {
      reportError(e)
    } finally {
      setRaccoltaPublishBusyId(null)
    }
  }

  // ── Un Diario: riordino dentro la sua Raccolta, rinomina, copertina, spostamento ───────────
  async function reorderDiari(raccoltaId: string, from: number, to: number) {
    const raccolta = tree?.find(r => r.id === raccoltaId)
    if (!raccolta) return
    const copy = [...raccolta.diari]
    const [moved] = copy.splice(from, 1)
    copy.splice(to, 0, moved)
    updateTree(t => t.map(r => r.id === raccoltaId ? { ...r, diari: copy } : r))
    try {
      const res = await fetch(`/api/collections/${raccoltaId}/diari`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ diaryIds: copy.map(d => d.id) }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`)
    } catch (e) {
      reportError(e); load()
    }
  }
  async function renameDiario(diarioId: string, title: string) {
    updateTree(t => t.map(r => ({ ...r, diari: r.diari.map(d => d.id === diarioId ? { ...d, title } : d) })))
    try {
      const res = await fetch(`/api/diaries/${diarioId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`)
    } catch (e) {
      reportError(e); load()
    }
  }
  async function pickDiarioCover(diarioId: string, file: File) {
    setDiarioCoverUploadingId(diarioId); setError(null)
    try {
      const userId = await currentUserId()
      const url = await uploadDiaryCover(userId, file, diarioId)
      const res = await fetch(`/api/diaries/${diarioId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ coverUrl: url }) })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`)
      updateTree(t => t.map(r => ({ ...r, diari: r.diari.map(d => d.id === diarioId ? { ...d, coverUrl: url } : d) })))
    } catch (e) {
      reportError(e)
    } finally {
      setDiarioCoverUploadingId(null)
    }
  }
  async function toggleDiarioPublish(diarioId: string, currentlyPublished: boolean) {
    setDiarioPublishBusyId(diarioId); setError(null)
    try {
      const res = await fetch(`/api/diaries/${diarioId}/token`, {
        method: currentlyPublished ? 'DELETE' : 'PATCH',
        headers: currentlyPublished ? undefined : { 'Content-Type': 'application/json' },
        body: currentlyPublished ? undefined : '{}',
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`)
      updateTree(t => t.map(r => ({ ...r, diari: r.diari.map(d => d.id === diarioId ? { ...d, isPublished: !currentlyPublished } : d) })))
    } catch (e) {
      reportError(e)
    } finally {
      setDiarioPublishBusyId(null)
    }
  }
  function requestMoveDiario(diarioId: string) {
    const owner = tree?.find(r => r.diari.some(d => d.id === diarioId))
    if (!owner) return
    setMovePicker({ kind: 'diario', diarioId, currentRaccoltaId: owner.id })
  }
  async function moveDiarioTo(diarioId: string, targetRaccoltaId: string) {
    const target = tree?.find(r => r.id === targetRaccoltaId)
    if (!target) return
    const newIds = [...target.diari.map(d => d.id), diarioId]
    const res = await fetch(`/api/collections/${targetRaccoltaId}/diari`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ diaryIds: newIds }),
    })
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`)
    load()
  }

  // ── Un Reportage: rinomina, spostamento in un altro Diario ──────────────────────────────────
  async function renameReportage(reportageId: string, title: string) {
    updateTree(t => t.map(r => ({
      ...r,
      diari: r.diari.map(d => ({ ...d, reportage: d.reportage.map(x => x.id === reportageId ? { ...x, title } : x) })),
    })))
    try {
      const res = await fetch('/api/activity', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: reportageId, title }) })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`)
    } catch (e) {
      reportError(e); load()
    }
  }
  // Il Reportage senza un racconto scritto (nessuna riga in hike_reports) non arriva qui: il
  // PublishToggle resta disattivato finché non c'è nulla da pubblicare (vedi RaccoltaSection.tsx).
  async function toggleReportagePublish(reportageId: string, currentlyPublished: boolean) {
    setReportagePublishBusyId(reportageId); setError(null)
    try {
      const res = currentlyPublished
        ? await fetch(`/api/share-report?activityId=${encodeURIComponent(reportageId)}`, { method: 'DELETE' })
        : await fetch('/api/share-report', {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ activityId: reportageId }),
          })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`)
      updateTree(t => t.map(r => ({
        ...r,
        diari: r.diari.map(d => ({ ...d, reportage: d.reportage.map(x => x.id === reportageId ? { ...x, isPublished: !currentlyPublished } : x) })),
      })))
    } catch (e) {
      reportError(e)
    } finally {
      setReportagePublishBusyId(null)
    }
  }
  function requestMoveReportage(reportageId: string) {
    if (!tree) return
    for (const r of tree) {
      for (const d of r.diari) {
        const found = d.reportage.find(x => x.id === reportageId)
        if (found) {
          if (!found.linkedPlannedId) {
            setError('Questo reportage è antecedente ai Diari e non ha una Meta da spostare.')
            return
          }
          setMovePicker({ kind: 'reportage', reportageId, linkedPlannedId: found.linkedPlannedId, currentDiarioId: d.id })
          return
        }
      }
    }
  }
  async function moveReportageTo(linkedPlannedId: string, targetDiarioId: string) {
    const res = await fetch('/api/planned', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: linkedPlannedId, diaryId: targetDiarioId }),
    })
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`)
    load()
  }

  const actions: RaccoltaSectionActions = {
    onRenameRaccolta: renameRaccolta,
    onDeleteRaccolta: deleteRaccolta,
    onOpenDetails: id => router.push(`/raccolte/${encodeURIComponent(id)}`),
    onPickRaccoltaCover: pickRaccoltaCover,
    onToggleRaccoltaPublish: toggleRaccoltaPublish,
    onReorderDiari: reorderDiari,
    onRenameDiario: renameDiario,
    onPickDiarioCover: pickDiarioCover,
    onMoveDiarioRequest: requestMoveDiario,
    onToggleDiarioPublish: toggleDiarioPublish,
    onRenameReportage: renameReportage,
    onMoveReportageRequest: requestMoveReportage,
    onToggleReportagePublish: toggleReportagePublish,
    onOpenReportage: id => router.push(`/resoconto/${encodeURIComponent(id)}`),
  }

  const raccolteOptions: MovePickerOption[] = useMemo(() => (tree ?? []).map(r => ({ id: r.id, title: r.title })), [tree])
  const diariOptions: MovePickerOption[] = useMemo(
    () => (tree ?? []).flatMap(r => r.diari.map(d => ({ id: d.id, title: `${d.title} · ${r.title}` }))),
    [tree],
  )

  return (
    <div className={`min-h-screen bg-stone-50 ${MOBILE_TOPBAR_SPACER}`}>
      <Navbar mobileNavPosition="bottom" />
      <div className="max-w-2xl mx-auto px-4 sm:px-8 pb-[calc(env(safe-area-inset-bottom,0px)+80px)] md:pb-16">
        <Link href="/diario" className="inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-700 mt-3 mb-5 transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> Diari
        </Link>

        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="font-display text-3xl font-bold text-stone-800">Raccolte</h1>
            <p className="font-lora italic text-sm text-stone-500 mt-1.5">Tocca una riga per aprirla, tieni premuto sulla maniglia per trascinarla.</p>
          </div>
          <button
            onClick={createRaccolta} disabled={creating}
            className="shrink-0 inline-flex items-center gap-1.5 bg-forest-600 hover:bg-forest-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors disabled:opacity-60 shadow-sm"
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Nuova
          </button>
        </div>

        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

        {tree === null ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-stone-400" /></div>
        ) : tree.length === 0 ? (
          <p className="font-lora italic text-sm text-stone-400 py-10 text-center">Nessuna raccolta ancora.</p>
        ) : (
          <div onClick={() => setKebabOpenId(null)}>
            {tree.map((raccolta, i) => (
              <div key={raccolta.id}>
                {raccolteDrag.dropIndex === i && raccolteDrag.dragIndex !== null && raccolteDrag.dragIndex !== i && (
                  <div className="h-[3px] mx-1 rounded-full bg-forest-500" />
                )}
                <RaccoltaSection
                  raccolta={raccolta}
                  expanded={expandedRaccolte.has(raccolta.id)}
                  expandedDiari={expandedDiari}
                  kebabOpen={kebabOpenId === raccolta.id}
                  raccoltaCoverUploadingId={raccoltaCoverUploadingId}
                  diarioCoverUploadingId={diarioCoverUploadingId}
                  raccoltaPublishBusyId={raccoltaPublishBusyId}
                  diarioPublishBusyId={diarioPublishBusyId}
                  reportagePublishBusyId={reportagePublishBusyId}
                  isDragging={raccolteDrag.dragIndex === i}
                  dropBefore={false}
                  deltaY={raccolteDrag.dragIndex === i ? raccolteDrag.deltaY : 0}
                  onToggleExpand={() => setExpandedRaccolte(s => { const n = new Set(s); n.has(raccolta.id) ? n.delete(raccolta.id) : n.add(raccolta.id); return n })}
                  onToggleDiario={diarioId => setExpandedDiari(s => { const n = new Set(s); n.has(diarioId) ? n.delete(diarioId) : n.add(diarioId); return n })}
                  onToggleKebab={() => setKebabOpenId(id => id === raccolta.id ? null : raccolta.id)}
                  onGripPointerDown={e => raccolteDrag.start(i, e)}
                  onGripPointerMove={raccolteDrag.move}
                  onGripPointerUp={raccolteDrag.end}
                  actions={actions}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {movePicker?.kind === 'diario' && (
        <MovePicker
          title="Sposta il Diario in…"
          options={raccolteOptions}
          excludeId={movePicker.currentRaccoltaId}
          onClose={() => setMovePicker(null)}
          onSelect={targetId => moveDiarioTo(movePicker.diarioId, targetId)}
        />
      )}
      {movePicker?.kind === 'reportage' && (
        <MovePicker
          title="Sposta il Reportage in…"
          options={diariOptions}
          excludeId={movePicker.currentDiarioId}
          onClose={() => setMovePicker(null)}
          onSelect={targetId => moveReportageTo(movePicker.linkedPlannedId, targetId)}
        />
      )}
    </div>
  )
}
