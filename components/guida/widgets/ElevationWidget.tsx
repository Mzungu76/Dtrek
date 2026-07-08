'use client'
import ElevationProfileChart from '@/components/ElevationProfileChart'
import type { TrackPoint } from '@/lib/tcxParser'
import { textMuted } from '@/components/routehub/overlayTheme'

interface Props {
  trackPoints?: TrackPoint[]
  onHover?: (i: number | null) => void
}

/** Profilo altimetrico — spostato dalla vecchia tab "Profilo altimetrico" nella sezione
 *  "Il percorso" della guida magazine. */
export default function ElevationWidget({ trackPoints, onHover }: Props) {
  const hasGps = !!trackPoints?.some(p => p.lat && p.lon)
  if (!hasGps || !trackPoints?.length) {
    return <p className={`text-sm italic text-center py-8 ${textMuted}`}>Profilo altimetrico non disponibile senza un tracciato GPS.</p>
  }
  return <ElevationProfileChart trackPoints={trackPoints} onHover={onHover} />
}
