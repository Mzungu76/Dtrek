'use client'
import { useParams } from 'next/navigation'
import ResocontoHub from '../ResocontoHub'

export default function EscursionePage() {
  const params = useParams()
  const id = decodeURIComponent(params.id as string)
  return <ResocontoHub id={id} />
}
