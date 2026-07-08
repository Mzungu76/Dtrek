'use client'
import { useEffect, useState } from 'react'
import type { StoredActivity } from '@/lib/blobStore'
import { checkProtectedArea } from '@/lib/natura2000/checkProtectedArea'

export function useProtectedAreaCheck(activity: StoredActivity | null): boolean | undefined {
  const [inProtectedArea, setInProtectedArea] = useState<boolean | undefined>(undefined)

  useEffect(() => {
    if (!activity) return
    const gps = activity.trackPoints.filter(p => p.lat && p.lon).map(p => [p.lat!, p.lon!] as [number, number])
    if (gps.length < 2) return
    checkProtectedArea(gps).then(r => setInProtectedArea(r.inProtectedArea)).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activity?.id])

  return inProtectedArea
}
