'use client'
import { useEffect, useState, useMemo } from 'react'
import { useParams } from 'next/navigation'
import { getActivityById, type StoredActivity } from '@/lib/blobStore'
import FloraGallery from '@/components/FloraGallery'

export default function ActivityFloraPage() {
  const params = useParams()
  const id = decodeURIComponent(params.id as string)

  const [activity, setActivity] = useState<StoredActivity | null>(null)
  const [loadingActivity, setLoadingActivity] = useState(true)

  useEffect(() => {
    getActivityById(id).then(a => {
      setActivity(a)
      setLoadingActivity(false)
    }).catch(() => setLoadingActivity(false))
  }, [id])

  const trackPoints = useMemo(() => activity?.trackPoints ?? [], [activity])

  const month = useMemo(() => {
    if (!activity?.startTime) return new Date().getMonth() + 1
    return new Date(activity.startTime).getMonth() + 1
  }, [activity])

  const title = activity?.title ?? activity?.notes ?? 'Escursione'

  return (
    <FloraGallery
      trackPoints={trackPoints}
      month={month}
      loadingTrack={loadingActivity}
      backHref={`/escursione/${encodeURIComponent(id)}`}
      backLabel={title}
    />
  )
}
