'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Check } from 'lucide-react'
import UnlockedStatusPanel from '@/components/premium/UnlockedStatusPanel'
import GemIcon from '@/components/premium/GemIcon'

/**
 * Stato reale dell'abbonamento Premium (docs/navigator-dtrek-boundary.md) — sostituisce il vecchio
 * teaser statico "Prossimamente" ora che il checkout Paddle (app/prezzi) esiste davvero. Montata
 * in cima a /profilo (raggiungibile in un tap dall'avatar, sempre visibile in Navbar, che porta
 * anche un piccolo indicatore di stato) e di nuovo dentro /profilo/ai per chi arriva da lì.
 */
export default function SectionAbbonamento() {
  const [unlocked, setUnlocked] = useState<boolean | null>(null)

  useEffect(() => {
    fetch('/api/dtrek-entitlement')
      .then(r => r.ok ? r.json() : null)
      .then(d => setUnlocked(d ? !!d.unlocked : null))
      .catch(() => setUnlocked(null))
  }, [])

  if (unlocked === null) {
    return <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6 h-[92px] animate-pulse" />
  }

  if (unlocked) return <UnlockedStatusPanel />

  return (
    <div className="relative bg-gradient-to-br from-forest-800 to-forest-950 rounded-2xl p-6 overflow-hidden">
      <div className="absolute -top-8 -right-8 w-32 h-32 bg-forest-400/20 rounded-full blur-2xl pointer-events-none" />

      <div className="flex items-start gap-3 mb-3">
        <div className="shrink-0 w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center">
          <GemIcon tone="trial" size={20} />
        </div>
        <div>
          <h2 className="text-sm font-bold text-white">Dtrek Premium</h2>
          <p className="text-xs text-forest-300 mt-0.5">Guide AI senza bisogno di una chiave personale</p>
        </div>
      </div>

      <ul className="space-y-1.5 mb-4 ml-12">
        {[
          'Percorsi, guide e resoconti AI senza limiti di volume',
          'Nessun periodo di prova a tempo',
          'Sincronizzazione multi-dispositivo illimitata',
        ].map(item => (
          <li key={item} className="flex items-center gap-2 text-xs text-forest-200">
            <Check className="w-3.5 h-3.5 text-forest-400 shrink-0" />
            {item}
          </li>
        ))}
      </ul>

      <Link
        href="/prezzi"
        className="ml-12 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white text-forest-900 text-xs font-semibold hover:bg-forest-50 transition-colors"
      >
        Sblocca Dtrek
      </Link>
    </div>
  )
}
