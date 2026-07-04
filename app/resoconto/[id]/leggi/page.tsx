'use client'
import { useParams } from 'next/navigation'
import RacconContent from '../RacconContent'

export default function LeggiRacconto() {
  const params = useParams()
  const id = decodeURIComponent(params.id as string)
  return <RacconContent activityId={id} />
}
