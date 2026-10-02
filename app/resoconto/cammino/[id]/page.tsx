'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { Loader2, Pencil, ChevronRight, ChevronDown, Settings, Route, Flag, BookOpen, Link2, Copy, Check } from 'lucide-react'
import Navbar, { MOBILE_TOPBAR_SPACER } from '@/components/Navbar'
import ReportHero from '@/components/resoconto/ReportHero'
import ReportStatsStrip from '@/components/resoconto/ReportStatsStrip'
import SectionCard from '@/components/editorial/SectionCard'
import CamminoCtsBadge from '@/components/guida/widgets/CamminoCtsBadge'
import { META_TYPE_CONFIG } from '@/lib/metaTypes'
import { getPlannedById, refetchPlannedById, type PlannedHike } from '@/lib/plannedStore'
import { getAllActivities, type ActivityMeta } from '@/lib/blobStore'
import { formatDuration } from '@/lib/tcxParser'
import type { CamminoPlan, CamminoReport } from '@/lib/cammini/plan'
import { chapterFor, reportProgress } from '@/lib/cammini/report'
import { useCamminoDetail } from '@/lib/cammini/useCamminoDetail'
import CamminoOverviewMap from '@/components/guida/widgets/CamminoOverviewMap'
import { ManageReportageOverlay } from '@/app/resoconto/ResocontoHub'
import type { DiarySummary } from '@/app/api/diaries/route'
import type { TappaDone } from '@/components/guida/widgets/CamminoTappaDetail'
import type { TrackPoint } from '@/lib/tcxParser'

// Reportage unico del cammino (docs/piano-cammini.md, Fase 6): introduzione, un capitolo per ogni
// tappa percorsa — che si aggiungono man mano — e la conclusione a cammino finito. I testi stanno
// in planned_hikes.cammino_plan.report; foto e dettagli di ogni tappa restano nel suo reportage.

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })
}

export default function CamminoReportagePage() {
  const params = useParams()
  const router = useRouter()
  const id = decodeURIComponent(params.id as string)
  const [hike, setHike] = useState<PlannedHike | null>(null)
  const [activities, setActivities] = useState<ActivityMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [shareBusy, setShareBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [manageOpen, setManageOpen] = useState(false)
  const [manageTitle, setManageTitle] = useState('')
  const [titleSaving, setTitleSaving] = useState(false)
  const [diaries, setDiaries] = useState<DiarySummary[]>([])
  const [moveBusy, setMoveBusy] = useState(false)
  const [moveError, setMoveError] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ key: string; text: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    getPlannedById(id).then(h => { if (!cancelled) setHike(h) }).finally(() => { if (!cancelled) setLoading(false) })
    const apply = (l: ActivityMeta[]) => { if (!cancelled) setActivities(l) }
    getAllActivities(apply).then(apply).catch(() => {})
    return () => { cancelled = true }
  }, [id])

  // Gestione del reportage del cammino (rotella): titolo e Diario passano dalla Meta, come per ogni reportage.
  useEffect(() => { fetch('/api/diaries').then(r => (r.ok ? r.json() : [])).then(setDiaries).catch(() => {}) }, [])
  async function patchPlanned(body: Record<string, unknown>) {
    const res = await fetch('/api/planned', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...body }) })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error ?? data.message ?? `HTTP ${res.status}`)
  }
  // Link pubblico del reportage del cammino: il token sta nel piano, come i testi.
  async function setShared(enabled: boolean) {
    if (!hike?.camminoPlan) return
    setShareBusy(true); setError(null)
    try {
      const res = await fetch('/api/cammini/reportage/share', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hikeId: id, enabled }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Non sono riuscita a aggiornare il link, riprova.')
      const p = hike.camminoPlan
      const { shareToken: _t, ...rest } = p.report ?? { chapters: [], updatedAt: new Date().toISOString() }
      void _t
      setHike({ ...hike, camminoPlan: { ...p, report: { ...rest, ...(data.token ? { shareToken: data.token as string } : {}) } } })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Non sono riuscita a aggiornare il link, riprova.')
    } finally { setShareBusy(false) }
  }
  async function copyLink(token: string) {
    const url = `${window.location.origin}/leggi/p/${token}`
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { window.prompt('Copia il link', url) }
  }

  async function saveManageTitle() {
    const t = manageTitle.trim()
    if (!t || !hike || t === hike.title) return
    setTitleSaving(true)
    try { await patchPlanned({ title: t }); setHike({ ...hike, title: t }) } catch (e) { setMoveError(e instanceof Error ? e.message : String(e)) } finally { setTitleSaving(false) }
  }
  async function moveToDiary(diaryId: string) {
    if (!hike) return
    setMoveBusy(true); setMoveError(null)
    try { await patchPlanned({ diaryId }); setHike({ ...hike, diaryId }); setManageOpen(false) } catch (e) { setMoveError(e instanceof Error ? e.message : String(e)) } finally { setMoveBusy(false) }
  }

  const plan: CamminoPlan | undefined = hike?.camminoPlan
  const detail = useCamminoDetail(plan?.camminoId ?? '')

  // Attività della tappa: la più recente per ogni ordinale.
  const byOrdinal = useMemo(() => {
    const m = new Map<number, ActivityMeta>()
    for (const a of activities) {
      if (a.linkedPlannedId !== id || a.tappaIndex == null) continue
      const cur = m.get(a.tappaIndex)
      if (!cur || new Date(a.startTime) > new Date(cur.startTime)) m.set(a.tappaIndex, a)
    }
    return m
  }, [activities, id])

  const sequence = useMemo(() => {
    if (!plan) return []
    const by = new Map(plan.tappe.map(t => [t.ordinal, t]))
    return plan.days.flatMap((d, di) => d.tappe.map(o => ({ ordinal: o, dayIdx: di, tappa: by.get(o)! })).filter(x => x.tappa))
  }, [plan])

  const doneMap: Record<number, TappaDone> = useMemo(() => {
    const m: Record<number, TappaDone> = {}
    byOrdinal.forEach((a, o) => { m[o] = { activityId: a.id, distanceMeters: a.distanceMeters, totalTimeSeconds: a.totalTimeSeconds, elevationGain: a.elevationGain ?? 0, startTime: a.startTime } })
    return m
  }, [byOrdinal])
  const done = sequence.filter(x => byOrdinal.has(x.ordinal))
  const totals = done.reduce((s, x) => {
    const a = byOrdinal.get(x.ordinal)!
    return { m: s.m + a.distanceMeters, sec: s.sec + a.totalTimeSeconds, up: s.up + (a.elevationGain ?? 0) }
  }, { m: 0, sec: 0, up: 0 })

  // Il tracciato percorso: le tappe con un'attività, nell'ordine di marcia.
  const walkedPoints: TrackPoint[] = useMemo(() => {
    if (!detail || !plan) return []
    const by = new Map(detail.tappe.map(t => [t.ordinal, t]))
    const reverse = plan.direction === 'reverse'
    const pts: TrackPoint[] = []
    for (const x of sequence) {
      if (!byOrdinal.has(x.ordinal)) continue
      const poly = by.get(x.ordinal)?.polyline
      if (!poly) continue
      for (const [lat, lon] of reverse ? [...poly].reverse() : poly) pts.push({ time: '', lat, lon })
    }
    return pts
  }, [detail, plan, sequence, byOrdinal])

  async function generate(kind: 'tappa' | 'epilogue', ordinal?: number) {
    const key = kind === 'epilogue' ? 'epilogue' : `t${ordinal}`
    setBusy(key); setError(null)
    try {
      const res = await fetch('/api/cammini/reportage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hikeId: id, kind, ordinal }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message ?? data.error ?? 'Non sono riuscita a scrivere il reportage, riprova.')
      const fresh = await refetchPlannedById(id)
      setHike(fresh ?? (hike ? { ...hike, camminoPlan: hike.camminoPlan ? { ...hike.camminoPlan, report: data.report as CamminoReport } : undefined } : null))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Non sono riuscita a scrivere il reportage, riprova.')
    } finally { setBusy(null) }
  }

  async function saveEdit() {
    if (!editing) return
    const [kind, ord] = [editing.key.startsWith('t') ? 'chapter' : editing.key, Number(editing.key.slice(1))]
    setBusy('save'); setError(null)
    try {
      const res = await fetch('/api/cammini/reportage', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(kind === 'chapter' ? { hikeId: id, ordinal: ord, text: editing.text } : { hikeId: id, part: kind, text: editing.text }) })
      if (!res.ok) throw new Error('Non sono riuscita a salvare la modifica, riprova.')
      const fresh = await refetchPlannedById(id)
      if (fresh) setHike(fresh)
      setEditing(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Non sono riuscita a salvare la modifica.')
    } finally { setBusy(null) }
  }

  if (loading) return <div className="flex min-h-screen items-center justify-center text-stone-400"><Loader2 className="w-6 h-6 animate-spin" /></div>
  if (!hike || !plan) {
    return (
      <div className={`min-h-screen bg-stone-50 ${MOBILE_TOPBAR_SPACER}`}><Navbar />
        <p className="px-6 py-24 text-center text-stone-500">Reportage del cammino non trovato.</p>
      </div>
    )
  }

  const progress = reportProgress(plan)
  const allDone = sequence.length > 0 && done.length === sequence.length
  const color = META_TYPE_CONFIG.cammino.color
  const firstStart = done.length ? byOrdinal.get(done[0].ordinal)!.startTime : new Date().toISOString()
  const facts = [
    { value: `${(totals.m / 1000).toFixed(1)} km`, label: 'Distanza' },
    { value: `${done.length}/${sequence.length}`, label: 'Tappe' },
    { value: `+${Math.round(totals.up)} m`, label: 'Dislivello' },
    { value: formatDuration(totals.sec), label: 'In cammino' },
  ]

  // Modifica a mano di un testo: sostituisce il corpo con un campo di testo dentro la stessa scheda.
  const editor = (key: string) => editing?.key === key ? (
    <div className="space-y-2">
      <textarea value={editing.text} onChange={e => setEditing({ key, text: e.target.value })} rows={9}
        className="w-full rounded-xl border border-stone-300 bg-white p-3 text-[15px] leading-relaxed text-stone-800 outline-none focus:border-forest-500" />
      <div className="flex gap-2">
        <button type="button" onClick={saveEdit} disabled={busy === 'save'} className="rounded-full bg-forest-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{busy === 'save' ? 'Salvo…' : 'Salva'}</button>
        <button type="button" onClick={() => setEditing(null)} className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-600">Annulla</button>
      </div>
    </div>
  ) : null
  const editLink = (key: string, text: string) => (
    <button type="button" onClick={() => setEditing({ key, text })} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-stone-400 hover:text-stone-600"><Pencil className="h-3 w-3" /> Modifica il testo</button>
  )
  const cardBody = (key: string, text?: string) => (editing?.key === key ? undefined : text)

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto" style={{ background: '#fdfcfa' }}>
      <button type="button" onClick={() => router.push('/resoconto')} aria-label="Torna all'elenco dei reportage"
        className="absolute left-4 top-[calc(env(safe-area-inset-top,0px)+12px)] z-20 flex h-9 w-9 items-center justify-center rounded-full bg-stone-100/90 text-stone-600 shadow-sm backdrop-blur">
        <ChevronDown className="h-4 w-4" />
      </button>
      <button type="button" onClick={() => { setManageTitle(hike.title ?? ''); setMoveError(null); setManageOpen(true) }} aria-label="Gestisci questo reportage" title="Gestisci questo reportage"
        className="absolute right-4 top-[calc(env(safe-area-inset-top,0px)+12px)] z-20 flex h-9 w-9 items-center justify-center rounded-full bg-black/35 text-white shadow-sm backdrop-blur">
        <Settings className="h-5 w-5" />
      </button>
      {manageOpen && (
        <ManageReportageOverlay
          titleVal={manageTitle} onTitleChange={setManageTitle} onTitleBlur={saveManageTitle} titleSaving={titleSaving}
          diaries={diaries} currentDiaryId={hike.diaryId ?? null} moveBusy={moveBusy} moveError={moveError}
          onSelectDiary={moveToDiary} onClose={() => setManageOpen(false)}
        />
      )}
      <ReportHero trackPoints={walkedPoints} title={plan.camminoName} categoryBadge={META_TYPE_CONFIG.cammino.label.toUpperCase()} startTime={firstStart} />
      <ReportStatsStrip facts={facts} />

      <main className="mx-auto max-w-3xl px-4 py-5 sm:py-8">
        {error && <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

        {/* link pubblico */}
        <div className="mb-4 flex items-center gap-2.5 rounded-2xl border border-stone-200 bg-white px-3.5 py-3">
          <Link2 className="h-5 w-5 shrink-0 text-forest-700" />
          {plan.report?.shareToken ? (
            <>
              <p className="min-w-0 flex-1 text-[13px] text-stone-600">Il reportage è condiviso con un link pubblico.</p>
              <button type="button" onClick={() => copyLink(plan.report!.shareToken!)} className="flex items-center gap-1 rounded-full bg-forest-600 px-3 py-1.5 text-[12.5px] font-semibold text-white">{copied ? <><Check className="h-3.5 w-3.5" /> Copiato</> : <><Copy className="h-3.5 w-3.5" /> Copia link</>}</button>
              <button type="button" disabled={shareBusy} onClick={() => setShared(false)} className="text-[12px] font-semibold text-stone-400 hover:text-stone-600 disabled:opacity-50">Ritira</button>
            </>
          ) : (
            <>
              <p className="min-w-0 flex-1 text-[13px] text-stone-600">Condividi il reportage con un link pubblico.</p>
              <button type="button" disabled={shareBusy || !plan.report || (plan.report.chapters.length === 0 && !plan.report.intro)} onClick={() => setShared(true)} className="rounded-full bg-forest-600 px-3.5 py-1.5 text-[12.5px] font-semibold text-white disabled:opacity-50">{shareBusy ? 'Creo…' : 'Crea il link'}</button>
            </>
          )}
        </div>

        <div className="mb-4">
          <CamminoOverviewMap
            plan={plan} mode="reportage" done={doneMap}
            onOpen={(o, activityId) => router.push(activityId ? `/resoconto/cammino/${encodeURIComponent(id)}/tappa/${encodeURIComponent(activityId)}` : `/guida/${encodeURIComponent(id)}/tappa/${o}`)}
          />
        </div>

        {/* introduzione */}
        <SectionCard
          title="Il cammino" subtitle="Introduzione" icon={<Route />} color={color} body={cardBody('intro', plan.report?.intro)} twoColumns
          widget={editor('intro')}
        />
        {plan.report?.intro && editing?.key !== 'intro' && <div className="-mt-2 mb-4 px-1">{editLink('intro', plan.report.intro)}</div>}

        {/* un capitolo per tappa percorsa */}
        {sequence.map((x, i) => {
          const a = byOrdinal.get(x.ordinal)
          const place = `${x.tappa.fromName ?? 'Partenza'} → ${x.tappa.toName ?? 'Arrivo'}`
          if (!a) {
            const firstTodo = sequence.findIndex(y => !byOrdinal.has(y.ordinal))
            if (i !== firstTodo) return null
            const remaining = sequence.filter(y => !byOrdinal.has(y.ordinal)).length - 1
            return (
              <Link key={x.ordinal} href={`/guida/${encodeURIComponent(id)}/tappa/${x.ordinal}`} className="mb-4 block rounded-2xl border border-dashed border-stone-300 bg-white px-5 py-4">
                <p className="font-barlow text-[11px] font-bold uppercase tracking-wide text-stone-500">Prossima tappa · {i + 1} di {sequence.length}</p>
                <p className="mt-1 font-display text-[19px] font-semibold text-stone-800">{place}</p>
                {remaining > 0 && <p className="mt-0.5 text-[12.5px] text-stone-400">e altre {remaining} {remaining === 1 ? 'tappa' : 'tappe'} da percorrere</p>}
              </Link>
            )
          }
          const key = `t${x.ordinal}`
          const ch = chapterFor(plan, x.ordinal)
          const cts = x.tappa.cts
          const tsValue = cts?.total ?? cts?.ts ?? (a.trailScore != null ? Math.round(a.trailScore) : null)
          return (
            <SectionCard
              key={x.ordinal}
              title={`Tappa ${i + 1} · ${place}`}
              subtitle={`${fmtDate(a.startTime)} · ${(a.distanceMeters / 1000).toFixed(1)} km · ${formatDuration(a.totalTimeSeconds)} · +${Math.round(a.elevationGain ?? 0)} m`}
              icon={<Flag />} color={color} twoColumns
              body={cardBody(key, ch?.body)}
              showApprofondisciHint={!ch && editing?.key !== key} onApprofondisci={!ch ? () => generate('tappa', x.ordinal) : undefined} approfondendo={busy === key}
              widget={
                <div className="space-y-3">
                  {editor(key)}
                  <div className="flex items-center gap-3">
                    {tsValue != null && <CamminoCtsBadge total={tsValue} safety={cts?.safety ?? null} size={56} />}
                    <Link href={`/resoconto/cammino/${encodeURIComponent(id)}/tappa/${encodeURIComponent(a.id)}`} className="inline-flex items-center gap-1 text-sm font-semibold text-forest-700 hover:text-forest-800">
                      <BookOpen className="h-4 w-4" /> Apri il reportage della tappa <ChevronRight className="h-4 w-4" />
                    </Link>
                  </div>
                  {ch && editing?.key !== key && editLink(key, ch.body)}
                </div>
              }
            />
          )
        })}

        {/* conclusione */}
        <SectionCard
          title="In sintesi" subtitle="Conclusione" icon={<Flag />} color={color} twoColumns
          body={cardBody('epilogue', plan.report?.epilogue)}
          showApprofondisciHint={!plan.report?.epilogue && allDone && progress.complete && editing?.key !== 'epilogue'}
          onApprofondisci={!plan.report?.epilogue && allDone && progress.complete ? () => generate('epilogue') : undefined}
          approfondendo={busy === 'epilogue'}
          widget={editor('epilogue') ?? (!plan.report?.epilogue ? (
            <p className="text-sm text-stone-400">{allDone ? 'Scrivi il capitolo di ogni tappa: la conclusione arriva per ultima.' : 'La conclusione si scrive a cammino finito.'}</p>
          ) : undefined)}
        />
        {plan.report?.epilogue && editing?.key !== 'epilogue' && <div className="-mt-2 mb-4 px-1">{editLink('epilogue', plan.report.epilogue)}</div>}
      </main>
    </div>
  )
}
