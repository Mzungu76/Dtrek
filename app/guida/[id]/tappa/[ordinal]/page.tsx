'use client'
import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import Navbar, { MOBILE_TOPBAR_SPACER } from '@/components/Navbar'
import { getPlannedById, type PlannedHike } from '@/lib/plannedStore'
import { getAllActivities, type ActivityMeta } from '@/lib/blobStore'
import { tryOpenNavigatorApp } from '@/lib/navigatorHandoff'
import { buildSequence } from '@/lib/cammini/progress'
import CamminoTappaDetail, { type TappaDone } from '@/components/guida/widgets/CamminoTappaDetail'
import type { CamminoPlan } from '@/lib/cammini/plan'

// Dettaglio di una tappa del cammino (docs/piano-cammini.md, Fase 5) — raggiunto dal diario di marcia della
// guida. Si può sfogliare la tappa precedente e la successiva: anche quelle ancora da percorrere, per farsi
// un'idea di cosa aspetta.

export default function TappaPage() {
  const params = useParams()
  const router = useRouter()
  const id = decodeURIComponent(params.id as string)
  const ordinal = Number(params.ordinal)
  const [hike, setHike] = useState<PlannedHike | null>(null)
  const [loading, setLoading] = useState(true)
  const [activities, setActivities] = useState<ActivityMeta[]>([])

  useEffect(() => {
    let cancelled = false
    getPlannedById(id).then(h => { if (!cancelled) setHike(h) }).finally(() => { if (!cancelled) setLoading(false) })
    const apply = (l: ActivityMeta[]) => { if (!cancelled) setActivities(l) }
    getAllActivities(apply).then(apply).catch(() => {})
    return () => { cancelled = true }
  }, [id])

  const plan: CamminoPlan | undefined = hike?.camminoPlan
  const seq = useMemo(() => (plan ? buildSequence(plan) : []), [plan])
  const done = useMemo(() => {
    const m: Record<number, TappaDone> = {}
    for (const a of activities) {
      if (a.linkedPlannedId !== id || a.tappaIndex == null || m[a.tappaIndex]) continue
      m[a.tappaIndex] = { activityId: a.id, distanceMeters: a.distanceMeters, totalTimeSeconds: a.totalTimeSeconds, elevationGain: a.elevationGain, startTime: a.startTime }
    }
    return m
  }, [activities, id])

  const idx = seq.findIndex(x => x.ordinal === ordinal)
  const item = idx >= 0 ? seq[idx] : null
  const go = (o: number) => router.replace(`/guida/${encodeURIComponent(id)}/tappa/${o}`)

  if (loading) return <div className="flex min-h-screen items-center justify-center text-stone-400"><Loader2 className="h-6 w-6 animate-spin" /></div>
  if (!hike || !plan || !item) {
    return (
      <div className={`min-h-screen bg-stone-50 ${MOBILE_TOPBAR_SPACER}`}><Navbar />
        <p className="px-6 py-24 text-center text-stone-500">Tappa non trovata.</p>
      </div>
    )
  }

  const setPlan = (p: CamminoPlan) => setHike(h => (h ? { ...h, camminoPlan: p } : h))

  return (
    <div className={`min-h-screen bg-stone-50 ${MOBILE_TOPBAR_SPACER}`}>
      <Navbar />
      <div className="mx-auto max-w-2xl">
        <div className="sticky top-[calc(env(safe-area-inset-top,0px)+56px)] z-20 flex items-center gap-2 border-b border-stone-200 bg-stone-50/95 px-3 py-2 backdrop-blur md:top-0">
          <button type="button" onClick={() => router.push(`/guida/${encodeURIComponent(id)}`)} aria-label="Torna alla guida"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-stone-200/70 text-stone-700"><ChevronLeft className="h-5 w-5" /></button>
          <div className="min-w-0 flex-1 text-center">
            <p className="truncate text-[13px] font-semibold text-stone-800">{plan.camminoName}</p>
            <p className="text-[11px] text-stone-500">Tappa {item.seq} di {seq.length}</p>
          </div>
          <button type="button" disabled={idx <= 0} onClick={() => go(seq[idx - 1].ordinal)} aria-label="Tappa precedente"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-stone-200/70 text-stone-700 disabled:opacity-30"><ChevronLeft className="h-5 w-5" /></button>
          <button type="button" disabled={idx >= seq.length - 1} onClick={() => go(seq[idx + 1].ordinal)} aria-label="Tappa successiva"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-stone-200/70 text-stone-700 disabled:opacity-30"><ChevronRight className="h-5 w-5" /></button>
        </div>

        <CamminoTappaDetail
          key={item.ordinal}
          plan={plan}
          hikeId={id}
          tappa={item.tappa}
          seq={item.seq}
          dayIdx={item.dayIdx}
          done={done[item.ordinal]}
          onPlanChange={setPlan}
          onNaviga={() => tryOpenNavigatorApp(router, `/guida/${encodeURIComponent(id)}/naviga?tappa=${item.ordinal}`)}
          onImporta={() => router.push(`/upload?tab=activity&planned=${encodeURIComponent(id)}&tappa=${item.ordinal}`)}
          onOpenReportage={() => router.push(`/resoconto/cammino/${encodeURIComponent(id)}`)}
        />
      </div>
    </div>
  )
}
