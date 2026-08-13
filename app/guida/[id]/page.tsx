'use client'
import { useParams } from 'next/navigation'
import GuidaHub from '../GuidaHub'
import GiftRouteAdminToggle from '@/components/guida/GiftRouteAdminToggle'

export default function PlannedHikePage() {
  const params = useParams()
  const id = decodeURIComponent(params.id as string)
  return (
    <>
      <GuidaHub id={id} />
      <GiftRouteAdminToggle hikeId={id} />
    </>
  )
}
