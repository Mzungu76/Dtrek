'use client'
import { useMemo, useRef, useState } from 'react'
import { Download, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react'
import { useCamminoDetail } from '@/lib/cammini/useCamminoDetail'
import { orientedTappa } from '@/lib/cammini/offlineTappa'
import { pickOrdinals, downloadTappePackages, type BulkScope, type BulkProgress, type BulkResult } from '@/lib/cammini/offlineBulk'
import { countPackageTiles, estimatePackageSizeBytes } from '@/lib/offline/packageManager'
import type { CamminoPlan } from '@/lib/cammini/plan'

// Scarico offline di più tappe insieme, dal diario di marcia: "prossime 3" o "tutte le restanti".

const NEXT_COUNT = 3

export default function CamminoOfflineBulk({ plan, hikeId, done }: { plan: CamminoPlan; hikeId: string; done: ReadonlySet<number> }) {
  const detail = useCamminoDetail(plan.camminoId)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<BulkProgress | null>(null)
  const [result, setResult] = useState<BulkResult | null>(null)
  const stopRef = useRef(false)

  const scopes = useMemo(() => {
    const next = pickOrdinals(plan, done, { kind: 'next', count: NEXT_COUNT })
    const all = pickOrdinals(plan, done, { kind: 'all' })
    return { next, all }
  }, [plan, done])

  const estimateMb = (ordinals: number[]): string | null => {
    if (!detail) return null
    const tiles = ordinals.reduce((s, o) => s + countPackageTiles(orientedTappa(detail, o, plan.direction)?.polyline ?? []), 0)
    return `${(estimatePackageSizeBytes(tiles) / (1024 * 1024)).toFixed(0)} MB`
  }

  if (scopes.all.length === 0) return null

  const start = async (scope: BulkScope) => {
    if (!detail || running) return
    const ordinals = pickOrdinals(plan, done, scope)
    stopRef.current = false
    setRunning(true); setResult(null); setProgress(null)
    try {
      setResult(await downloadTappePackages(plan, hikeId, ordinals, detail, setProgress, () => stopRef.current))
    } finally {
      setRunning(false); setProgress(null)
    }
  }

  const pct = progress ? Math.round(((progress.index - 1 + progress.fraction) / progress.total) * 100) : 0
  const btn = 'flex flex-1 items-center justify-center gap-1.5 rounded-full border border-stone-300 bg-white px-3 py-2 text-[12.5px] font-bold text-stone-700 disabled:opacity-50'

  return (
    <div className="mt-4 rounded-2xl border border-stone-200 bg-white px-3.5 py-3">
      <p className="font-barlow text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500">Offline</p>
      {running ? (
        <div className="mt-2">
          <div className="flex items-center gap-2 text-[12.5px] text-stone-700">
            <Loader2 className="h-4 w-4 animate-spin" /> Tappa {progress?.index ?? 1} di {progress?.total ?? scopes.all.length} · {pct}%
            <button type="button" onClick={() => { stopRef.current = true }} className="ml-auto text-[12px] font-bold text-stone-500">Ferma</button>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-stone-200"><div className="h-full rounded-full bg-sky-500" style={{ width: `${pct}%` }} /></div>
        </div>
      ) : (
        <div className="mt-2 flex gap-2">
          <button type="button" disabled={!detail} onClick={() => start({ kind: 'next', count: NEXT_COUNT })} className={btn}>
            <Download className="h-3.5 w-3.5" /> Prossime {scopes.next.length}{estimateMb(scopes.next) ? ` · ~${estimateMb(scopes.next)}` : ''}
          </button>
          {scopes.all.length > scopes.next.length && (
            <button type="button" disabled={!detail} onClick={() => start({ kind: 'all' })} className={btn}>
              <Download className="h-3.5 w-3.5" /> Tutte ({scopes.all.length}){estimateMb(scopes.all) ? ` · ~${estimateMb(scopes.all)}` : ''}
            </button>
          )}
        </div>
      )}
      {result && !running && (
        <p className={`mt-2 flex items-center gap-1.5 text-[12px] font-semibold ${result.failed.length ? 'text-amber-700' : 'text-emerald-700'}`}>
          {result.failed.length ? <AlertTriangle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
          {result.ready.length} {result.ready.length === 1 ? 'tappa pronta' : 'tappe pronte'} offline{result.failed.length ? ` · ${result.failed.length} non scaricate, riprova con la rete` : ''}
        </p>
      )}
    </div>
  )
}
