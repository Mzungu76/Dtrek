'use client'
import { useEffect, useState } from 'react'
import { Loader2, RefreshCw, Search, Route as RouteIcon } from 'lucide-react'

interface LogRow {
  id: string
  created_at: string
  kind: 'search' | 'build'
  query: string | null
  route_type: string | null
  target_distance_km: number | null
  use_ai: boolean
  tier_reached: string
  place_name: string | null
  found_count: number | null
  built_count: number | null
  escalated_to_ai: boolean
  retried: boolean
  message: string | null
  duration_ms: number | null
  details: Record<string, unknown> | null
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function Badge({ children, tone = 'stone' }: { children: React.ReactNode; tone?: 'stone' | 'forest' | 'amber' | 'red' }) {
  const tones: Record<string, string> = {
    stone: 'bg-stone-100 text-stone-600',
    forest: 'bg-forest-100 text-forest-700',
    amber: 'bg-amber-100 text-amber-700',
    red: 'bg-red-100 text-red-700',
  }
  return <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${tones[tone]}`}>{children}</span>
}

/** Log privato (solo il proprio account, vedi app/api/route-build/logs/route.ts) delle ricerche e
 * costruzioni di percorsi — per capire a colpo d'occhio quale livello ha risolto una ricerca,
 * quanti risultati ha prodotto, e se è scattato un ritentativo, senza dover leggere i log Vercel. */
export default function SectionLogRicerche() {
  const [logs, setLogs] = useState<LogRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function load() {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/route-build/logs')
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? `Errore ${res.status}`)
      setLogs(data.logs ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore di caricamento')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  return (
    <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2.5">
          <RouteIcon className="w-5 h-5 text-forest-600 shrink-0" />
          <h2 className="text-sm font-semibold text-stone-800">Log ricerche e costruzioni percorsi</h2>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1 text-xs text-stone-500 hover:text-stone-700 font-medium disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Aggiorna
        </button>
      </div>
      <p className="text-xs text-stone-500 mb-4 ml-7 leading-relaxed">
        Le ultime {logs?.length ?? ''} operazioni del route builder (ricerca e costruzione percorsi), visibili solo dal tuo account.
      </p>

      <div className="ml-7 space-y-2">
        {loading && !logs && <p className="text-xs text-stone-400">Caricamento…</p>}
        {error && <p className="text-xs text-red-600">{error}</p>}
        {logs && logs.length === 0 && <p className="text-xs text-stone-400">Nessuna operazione registrata finora.</p>}

        {logs?.map(row => (
          <div key={row.id} className="rounded-lg border border-stone-100 bg-stone-50/60 px-3 py-2 text-xs">
            <div className="flex items-center gap-1.5 flex-wrap mb-1">
              <span className="text-stone-400 tabular-nums">{formatWhen(row.created_at)}</span>
              <Badge tone={row.kind === 'search' ? 'forest' : 'stone'}>
                {row.kind === 'search' ? <Search className="w-3 h-3 inline -mt-0.5 mr-0.5" /> : <RouteIcon className="w-3 h-3 inline -mt-0.5 mr-0.5" />}
                {row.kind === 'search' ? 'Ricerca' : 'Costruzione'}
              </Badge>
              <Badge>{row.tier_reached}</Badge>
              {row.use_ai && <Badge tone="amber">AI</Badge>}
              {row.escalated_to_ai && <Badge tone="amber">→ Giulia</Badge>}
              {row.retried && <Badge tone="amber">ritentato</Badge>}
              {row.duration_ms != null && <span className="text-stone-400">{(row.duration_ms / 1000).toFixed(1)}s</span>}
            </div>

            {row.kind === 'search' ? (
              <p className="text-stone-700">
                <span className="font-medium">&quot;{row.query}&quot;</span>
                {row.place_name && <> → {row.place_name}</>}
                {' — '}{row.found_count ?? 0} trovati
              </p>
            ) : (
              <p className="text-stone-700">
                {row.route_type} {row.target_distance_km != null && `~${row.target_distance_km} km`}
                {' — '}{row.built_count ?? 0} costruiti
              </p>
            )}

            {row.message && <p className="text-stone-500 mt-0.5">{row.message}</p>}
          </div>
        ))}
      </div>
    </div>
  )
}
