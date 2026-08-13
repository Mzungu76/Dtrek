'use client'
import { useParams } from 'next/navigation'
import GuidaHub from '../GuidaHub'
import GiftRouteAdminToggle from '@/components/guida/GiftRouteAdminToggle'
import SampleRouteBadge from '@/components/guida/SampleRouteBadge'
import TrialStatusBanner from '@/components/dtrek/TrialStatusBanner'

export default function PlannedHikePage() {
  const params = useParams()
  const id = decodeURIComponent(params.id as string)
  return (
    <>
      <TrialStatusBanner />
      <SampleRouteBadge hikeId={id} />
      <GuidaHub id={id} />
      <GiftRouteAdminToggle hikeId={id} />
    </>
  )
}
