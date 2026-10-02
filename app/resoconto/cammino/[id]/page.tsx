'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Loader2, Sparkles, Check, Pencil, ChevronRight, Route } from 'lucide-react'
import Navbar, { MOBILE_TOPBAR_SPACER } from '@/components/Navbar'
import StatFigure from '@/components/ui/StatFigure'
import { MiniScoreRing, tsColor } from '@/components/ScoreRing'
import { getPlannedById, refetchPlannedById, type PlannedHike } from '@/lib/plannedStore'
import { getAllActivities, type ActivityMeta } from '@/lib/blobStore'
import { formatDuration } from '@/lib/tcxParser'
import type { CamminoPlan, CamminoReport } from '@/lib/cammini/plan'
import { chapterFor, reportProgress } from '@/lib/cammini/report'
import { useCamminoDetail, dayColor } from '@/lib/cammini/useCamminoDetail'
import RouteMapSection from '@/components/RouteMapSection'
import type { TrackPoint } from '@/lib/tcxParser'

// Reportage unico del cammino (docs/piano-cammini.md, Fase 6): introduzione, un capitolo per ogni
// tappa percorsa — che si aggiungono man mano — e la conclusione a cammino finito. I testi stanno
// in planned_hikes.cammino_plan.report; foto e dettagli di ogni tappa restano nel suo reportage.

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })
}

export default function CamminoReportagePage() {
  const params = useParams()
  const id = decodeURIComponent(params.id as string)
  const [hike, setHike] = useState<PlannedHike | null>(null)
  const [activities, setActivities] = useState<ActivityMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ key: string; text: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    getPlannedById(id).then(h => { if (!cancelled) setHike(h) }).finally(() => { if (!cancelled) setLoading(false) })
    const apply = (l: ActivityMeta[]) => { if (!cancelled) setActivities(l) }
    getAllActivities(apply).then(apply).catch(() => {})
    return () => { cancelled = true }
  }, [id])

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

  const textBlock = (key: string, text: string) => editing?.key === key ? (
    <div className="space-y-2">
      <textarea value={editing.text} onChange={e => setEditing({ key, text: e.target.value })} rows={9}
        className="w-full rounded-xl border border-stone-300 bg-white p-3 text-[15px] leading-relaxed text-stone-800 outline-none focus:border-forest-500" />
      <div className="flex gap-2">
        <button type="button" onClick={saveEdit} disabled={busy === 'save'} className="rounded-full bg-forest-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{busy === 'save' ? 'Salvo…' : 'Salva'}</button>
        <button type="button" onClick={() => setEditing(null)} className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-600">Annulla</button>
      </div>
    </div>
  ) : (
    <div>
      <p className="whitespace-pre-line text-[15.5px] leading-[1.75] text-stone-700">{text}</p>
      <button type="button" onClick={() => setEditing({ key, text })} className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-stone-400 hover:text-stone-600"><Pencil className="w-3 h-3" /> Modifica</button>
    </div>
  )

  const writeBtn = (key: string, label: string, onClick: () => void) => (
    <button type="button" disabled={busy != null} onClick={onClick}
      className="flex w-full items-center justify-center gap-2 rounded-full border border-terra-200 bg-terra-50 py-3 text-sm font-semibold text-terra-700 transition-colors hover:bg-terra-100 disabled:opacity-60">
      {busy === key ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
      {busy === key ? 'Giulia sta scrivendo…' : label}
    </button>
  )

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

  return (
    <div className={`min-h-screen bg-stone-50 ${MOBILE_TOPBAR_SPACER}`}>
      <Navbar />
      <div className="bg-gradient-to-br from-forest-800 to-forest-900 bg-topography px-6 pb-8 pt-10 sm:px-10">
        <div className="mx-auto max-w-3xl">
          <p className="mb-1.5 text-[13px] font-semibold text-forest-300">Reportage del cammino</p>
          <h1 className="font-display text-[28px] font-bold leading-tight text-white sm:text-4xl">{plan.camminoName}</h1>
          <p className="mt-2 text-sm text-forest-200">{done.length} di {sequence.length} tappe percorse</p>
        </div>
      </div>

      <main className="mx-auto max-w-3xl space-y-8 px-4 py-6 sm:py-10">
        <div className="grid grid-cols-3 overflow-hidden rounded-2xl border border-stone-200 bg-white py-4 text-center">
          <StatFigure size="sm" className="items-center" value={`${(totals.m / 1000).toFixed(1)} km`} label="Percorsi" />
          <StatFigure size="sm" className="items-center" value={`+${Math.round(totals.up)} m`} label="Dislivello" />
          <StatFigure size="sm" className="items-center" value={formatDuration(totals.sec)} label="In cammino" />
        </div>

        {walkedPoints.length > 1 && <RouteMapSection trackPoints={walkedPoints} showPois={false} />}

        {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

        <p className="rounded-xl bg-forest-50 px-4 py-3 text-[13px] leading-relaxed text-forest-900">
          Questo è un <b>reportage contenitore</b>: raccoglie in un unico racconto le tappe del cammino. Ogni tappa percorsa è un capitolo, con i suoi dati e un collegamento al reportage completo della tappa (foto, note, mappa). Cresce man mano che cammini.
        </p>

        <section className="space-y-3">
          <p className="font-barlow text-[11px] font-bold uppercase tracking-[0.14em] text-stone-500">Introduzione</p>
          {plan.report?.intro ? textBlock('intro', plan.report.intro) : <p className="text-sm text-stone-400">Si scrive insieme al primo capitolo.</p>}
        </section>

        <p className="font-barlow text-[11px] font-bold uppercase tracking-[0.14em] text-stone-500">Le tappe · {done.length} di {sequence.length}</p>

        {sequence.map((x, i) => {
          const a = byOrdinal.get(x.ordinal)
          const ch = chapterFor(plan, x.ordinal)
          const place = `${x.tappa.fromName ?? 'Partenza'} → ${x.tappa.toName ?? 'Arrivo'}`
          if (!a) {
            // Le tappe ancora da percorrere non diventano un segnaposto ciascuna: solo la prossima, e il conto delle altre.
            const firstTodo = sequence.findIndex(y => !byOrdinal.has(y.ordinal))
            if (i !== firstTodo) return null
            const remaining = sequence.filter(y => !byOrdinal.has(y.ordinal)).length - 1
            return (
              <Link key={x.ordinal} href={`/guida/${encodeURIComponent(id)}/tappa/${x.ordinal}`} className="block rounded-2xl border border-dashed border-stone-300 px-4 py-4 text-stone-500">
                <p className="text-xs font-semibold uppercase tracking-wide">Prossima tappa · {i + 1} di {sequence.length}</p>
                <p className="mt-0.5 text-sm font-semibold text-stone-700">{place}</p>
                {remaining > 0 && <p className="mt-1 text-xs text-stone-400">e altre {remaining} {remaining === 1 ? 'tappa' : 'tappe'} da percorrere</p>}
              </Link>
            )
          }
          return (
            <article key={x.ordinal} className="space-y-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
              <header className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-forest-700"><Check className="h-3.5 w-3.5" /> Tappa {i + 1} · {fmtDate(a.startTime)}</p>
                  <h2 className="font-display text-[22px] font-semibold leading-tight text-stone-800">{place}</h2>
                  <p className="mt-1 text-sm tabular-nums text-stone-500">{(a.distanceMeters / 1000).toFixed(1)} km · {formatDuration(a.totalTimeSeconds)} · +{Math.round(a.elevationGain ?? 0)} m</p>
                </div>
                {(a.trailScore ?? x.tappa.cts?.ts) != null && (
                  <div className="flex shrink-0 flex-col items-center"><MiniScoreRing value={Math.round((a.trailScore ?? x.tappa.cts!.ts))} size={44} color={tsColor(Math.round(a.trailScore ?? x.tappa.cts!.ts))} /><span className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-stone-500">CTS</span></div>
                )}
              </header>
              {ch ? textBlock(`t${x.ordinal}`, ch.body) : writeBtn(`t${x.ordinal}`, 'Scrivi il capitolo di questa tappa con Giulia', () => generate('tappa', x.ordinal))}
              <Link href={`/resoconto/${encodeURIComponent(a.id)}`} className="inline-flex items-center gap-1 text-sm font-semibold text-forest-700 hover:text-forest-800">
                Apri il reportage della tappa <ChevronRight className="h-4 w-4" />
              </Link>
            </article>
          )
        })}

        <p className="font-barlow text-[11px] font-bold uppercase tracking-[0.14em] text-stone-500">Conclusione</p>
        <section className="space-y-3">
          {plan.report?.epilogue
            ? textBlock('epilogue', plan.report.epilogue)
            : allDone && progress.complete
              ? writeBtn('epilogue', 'Scrivi la conclusione del cammino', () => generate('epilogue'))
              : (
                <p className="flex items-start gap-2 rounded-xl bg-stone-100 px-4 py-3 text-sm text-stone-500">
                  <Route className="mt-0.5 w-4 h-4 shrink-0" />
                  {allDone ? 'Scrivi il capitolo di ogni tappa: la conclusione arriva per ultima.' : 'Il reportage cresce con te: ogni tappa che percorri aggiunge il suo capitolo. La conclusione si scrive a cammino finito.'}
                </p>
              )}
        </section>
      </main>
    </div>
  )
}
