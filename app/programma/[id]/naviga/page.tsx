'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { getPlannedById, type PlannedHike } from '@/lib/plannedStore'
import ActiveNavigationView from '@/components/navigation/ActiveNavigationView'

export default function NavigaPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [hike, setHike] = useState<PlannedHike | null>(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    let cancelled = false
    getPlannedById(id).then((h) => {
      if (cancelled) return
      if (!h || !h.routePolyline?.length) { setNotFound(true); return }
      setHike(h)
    })
    return () => { cancelled = true }
  }, [id])

  if (notFound) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-3 bg-slate-900 text-white p-6 text-center">
        <p>Impossibile avviare la navigazione: percorso non disponibile offline.</p>
        <button onClick={() => router.push(`/programma/${id}`)} className="px-4 py-2 rounded-lg bg-sky-600">Torna al percorso</button>
      </div>
    )
  }

  if (!hike) {
    return <div className="fixed inset-0 flex items-center justify-center bg-slate-900 text-white">Caricamento…</div>
  }

  return <ActiveNavigationView hike={hike} />
}
