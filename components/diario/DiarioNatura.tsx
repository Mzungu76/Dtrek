'use client'
import { useMemo } from 'react'
import { Leaf, PawPrint } from 'lucide-react'
import type { ActivityMeta } from '@/lib/blobStore'

export function DiarioNatura({ activities }: { activities: ActivityMeta[] }) {
  const withTrack = useMemo(
    () => activities
      .filter(a => (a.routePolyline?.length ?? 0) > 1)
      .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
      .slice(0, 8),
    [activities],
  )
  if (withTrack.length === 0) return null
  return (
    <div className="print:hidden max-w-[794px] mx-auto mb-6">
      <div className="rounded-xl border border-stone-200 bg-white p-4">
        <p className="font-lora text-sm text-stone-700 mb-0.5">
          <Leaf className="inline w-4 h-4 -mt-0.5 mr-1 text-emerald-600" />
          Osservazioni natura
        </p>
        <p className="text-xs text-stone-400 mb-3">
          Flora e fauna della zona attraversata in queste escursioni
        </p>
        <div className="flex flex-wrap gap-2">
          {withTrack.map(a => (
            <div key={a.id} className="flex items-center gap-1 rounded-lg border border-stone-200 pl-2.5 pr-1 py-1">
              <span className="text-xs text-stone-600 truncate max-w-[140px]" title={a.title}>{a.title}</span>
              <a href={`/resoconto/${a.id}/flora`} title="Galleria Verde"
                className="flex items-center justify-center w-6 h-6 rounded-md text-emerald-600 hover:bg-emerald-50 transition-colors">
                <Leaf className="w-3.5 h-3.5" />
              </a>
              <a href={`/resoconto/${a.id}/animali`} title="Galleria Animali"
                className="flex items-center justify-center w-6 h-6 rounded-md text-amber-600 hover:bg-amber-50 transition-colors">
                <PawPrint className="w-3.5 h-3.5" />
              </a>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
