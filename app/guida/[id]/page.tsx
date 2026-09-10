'use client'
import { Suspense } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import GuidaHub from '../GuidaHub'
import GiftRouteAdminToggle from '@/components/guida/GiftRouteAdminToggle'
import SampleRouteBadge from '@/components/guida/SampleRouteBadge'
import TrialStatusBanner from '@/components/dtrek/TrialStatusBanner'

function PlannedHikePageInner() {
  const params = useParams()
  const searchParams = useSearchParams()
  const id = decodeURIComponent(params.id as string)
  // ?scheda=1: arrivo esplicito dal bottone "Apri scheda" della Home — mostra la copertina chiusa
  // invece di aprire subito la guida (il default per un id esplicito, vedi GuidaHub.tsx's
  // autoOpenSection): l'altro bottone della Home ("Naviga"/"Vai al percorso") non passa questo
  // parametro e continua ad aprire direttamente.
  const startClosed = searchParams.get('scheda') === '1'
  return (
    <>
      <TrialStatusBanner />
      <SampleRouteBadge hikeId={id} />
      <GuidaHub id={id} startClosed={startClosed} />
      <GiftRouteAdminToggle hikeId={id} />
    </>
  )
}

export default function PlannedHikePage() {
  return (
    <Suspense>
      <PlannedHikePageInner />
    </Suspense>
  )
}
