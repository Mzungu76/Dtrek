'use client'
import { useEffect, useState } from 'react'
import type { PlannedHike } from '@/lib/plannedStore'
import { checkProtectedArea } from '@/lib/natura2000/checkProtectedArea'

export function useProtectedAreaCheck(hike: PlannedHike | null): boolean | undefined {
  const [inProtectedArea, setInProtectedArea] = useState<boolean | undefined>(undefined)

  useEffect(() => {
    if (!hike) return
    const gps = (hike.trackPoints ?? []).filter(p => p.lat && p.lon).map(p => [p.lat!, p.lon!] as [number, number])
    if (gps.length < 2) return
    checkProtectedArea(gps).then(r => setInProtectedArea(r.inProtectedArea)).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hike?.id])

  return inProtectedArea
}
