'use client'
import { useEffect, useState } from 'react'
import { Compass } from 'lucide-react'
import { ITALIAN_REGIONS } from '@/lib/italianRegions'

interface Props {
  hikeId: string
}

/**
 * Badge visibile a chiunque (non solo owner, a differenza di GiftRouteAdminToggle) quando questo
 * percorso è un "Percorso di Default" (docs/navigator-dtrek-boundary.md) — trasparenza sul fatto
 * che i dati sono calcolati/reali ma il percorso non l'ha creato l'utente stesso.
 */
export default function SampleRouteBadge({ hikeId }: Props) {
  const [sampleRegion, setSampleRegion] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/planned?id=${encodeURIComponent(hikeId)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled && d?.isSample) setSampleRegion(d.sampleRegion ?? null) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [hikeId])

  if (!sampleRegion) return null
  const regionName = ITALIAN_REGIONS.find(r => r.slug === sampleRegion)?.name ?? sampleRegion

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 mt-4">
      <div className="flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm text-sky-900 w-fit">
        <Compass className="w-4 h-4 shrink-0" />
        <span>Percorso di Default · {regionName} — dati reali, nessun testo generato da AI</span>
      </div>
    </div>
  )
}
