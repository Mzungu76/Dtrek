'use client'
import { useParams } from 'next/navigation'
import ResocontoHub from '@/app/resoconto/ResocontoHub'

// Reportage di una tappa DENTRO il reportage del cammino: la galleria contiene solo le tappe di quel cammino
// e ogni uscita riporta al reportage padre, mai all'elenco generale dei reportage.
export default function TappaReportagePage() {
  const params = useParams()
  return <ResocontoHub id={decodeURIComponent(params.activityId as string)} parentCammino={decodeURIComponent(params.id as string)} />
}
