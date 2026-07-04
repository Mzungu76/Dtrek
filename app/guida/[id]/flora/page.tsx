'use client'
import { useEffect, useState, useMemo } from 'react'
import { useParams } from 'next/navigation'
import { getPlannedById, type PlannedHike } from '@/lib/plannedStore'
import FloraGallery from '@/components/FloraGallery'

export default function PlannedFloraPage() {
  const params = useParams()
  const id = decodeURIComponent(params.id as string)

  const [hike, setHike] = useState<PlannedHike | null>(null)
  const [loadingHike, setLoadingHike] = useState(true)

  useEffect(() => {
    getPlannedById(id).then(h => {
      setHike(h)
      setLoadingHike(false)
    }).catch(() => setLoadingHike(false))
  }, [id])

  const trackPoints = useMemo(() => hike?.trackPoints ?? [], [hike])

  const month = useMemo(() => {
    if (!hike?.plannedDate) return new Date().getMonth() + 1
    return new Date(hike.plannedDate).getMonth() + 1
  }, [hike])

  return (
    <FloraGallery
      trackPoints={trackPoints}
      month={month}
      loadingTrack={loadingHike}
      backLabel={hike?.title ?? 'Pianificata'}
    />
  )
}
