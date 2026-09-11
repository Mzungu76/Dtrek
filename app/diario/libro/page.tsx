'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import type { DiarySummary } from '@/app/api/diaries/route'

// Vecchia rotta (senza id): il libro è ora per-Diario (/diario/libro/[id], uno per ognuno, con solo
// i propri Resoconti — non più un unico libro globale). Questa resta solo come redirect per link o
// scorciatoie salvate prima del cambio, verso il libro del Diario di default.
export default function DiarioLibroRedirect() {
  const router = useRouter()

  useEffect(() => {
    fetch('/api/diaries')
      .then(r => r.ok ? r.json() : [])
      .then((ds: DiarySummary[]) => {
        const defaultDiary = ds.find(d => d.isDefault) ?? ds[0]
        router.replace(defaultDiary ? `/diario/libro/${encodeURIComponent(defaultDiary.id)}` : '/diario')
      })
      .catch(() => router.replace('/diario'))
  }, [router])

  return (
    <div className="fixed inset-0 bg-[#0b1a24] flex items-center justify-center text-white/40">
      <Loader2 className="w-6 h-6 animate-spin" />
    </div>
  )
}
