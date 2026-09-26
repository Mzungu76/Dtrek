import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Landmark } from 'lucide-react'
import { SITE_TYPE_CONFIG } from '@/lib/metaTypes'
import type { PlannedHikeMeta } from '@/lib/plannedStore'

interface Props {
  /** id della Guida Borgo/Città che le "possiede" — interrogate via parentMetaId (piano §51.4). */
  parentMetaId: string
}

/**
 * Elenco delle Guide di Sito nate da questa Guida di Borgo/Città (tappe promosse, piano §51.3) —
 * restano annidate qui, MAI nella lista top-level "Siti" (app/guida/GuidaHub.tsx). Silenzioso
 * (null) finché non ce n'è nessuna, mai un riquadro vuoto — stesso principio degli altri widget
 * della Guida.
 */
export default function NestedSiteGuidesWidget({ parentMetaId }: Props) {
  const [children, setChildren] = useState<PlannedHikeMeta[]>([])

  useEffect(() => {
    let cancelled = false
    fetch(`/api/planned?parentMetaId=${encodeURIComponent(parentMetaId)}`)
      .then(res => res.ok ? res.json() : [])
      .then((data: PlannedHikeMeta[]) => { if (!cancelled) setChildren(data) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [parentMetaId])

  if (children.length === 0) return null

  return (
    <div className="mt-4">
      <p className="font-barlow font-bold uppercase tracking-wide text-[10px] text-stone-400 mb-2.5">
        Guide dei Siti di questo Borgo
      </p>
      <div className="flex flex-col gap-2">
        {children.map(child => {
          const Icon = child.siteType ? SITE_TYPE_CONFIG[child.siteType]?.icon ?? Landmark : Landmark
          return (
            <Link
              key={child.id}
              href={`/guida/${encodeURIComponent(child.id)}`}
              className="flex items-center gap-2.5 rounded-xl border border-stone-200 px-3.5 py-2.5 hover:border-terra-300 transition-colors"
            >
              <Icon className="w-4 h-4 text-terra-600 shrink-0" />
              <span className="min-w-0 flex-1 font-semibold text-[13px] text-stone-800 truncate">{child.title}</span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
