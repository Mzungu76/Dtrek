'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Sparkles, Lock } from 'lucide-react'
import type { DtrekEntitlement } from '@/lib/dtrekEntitlement'

/**
 * Banner di stato del gate/trial (docs/navigator-dtrek-boundary.md) per le hub di Dtrek — invisibile
 * per chi è sbloccato (owner, Premium, BYOK), un promemoria discreto durante la prova, un avviso di
 * sola lettura quando è scaduta. Nessun checkout ancora (pagamenti non implementati): il CTA porta
 * alle Impostazioni, dove aggiungere una chiave Claude propria (BYOK) sblocca già oggi l'intero Dtrek.
 */
export default function TrialStatusBanner() {
  const [entitlement, setEntitlement] = useState<DtrekEntitlement | null>(null)

  useEffect(() => {
    fetch('/api/dtrek-entitlement')
      .then(r => r.ok ? r.json() : null)
      .then(setEntitlement)
      .catch(() => {})
  }, [])

  if (!entitlement || entitlement.unlocked) return null

  if (entitlement.trialExpired) {
    return (
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 mt-4">
        <div className="flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <Lock className="w-4 h-4 shrink-0" />
          <span className="flex-1">
            Periodo di prova terminato — i tuoi percorsi e resoconti restano consultabili in sola lettura.
          </span>
          <Link href="/prezzi" className="font-semibold underline underline-offset-2 shrink-0">
            Sblocca Dtrek
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 mt-4">
      <div className="flex items-center gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
        <Sparkles className="w-4 h-4 shrink-0" />
        <span className="flex-1">
          Prova gratuita — {Math.max(0, entitlement.routesLimit - entitlement.routesUsed)} percorsi e{' '}
          {Math.max(0, entitlement.reportsLimit - entitlement.reportsUsed)} resoconti rimasti,
          ancora {entitlement.trialDaysLeft} {entitlement.trialDaysLeft === 1 ? 'giorno' : 'giorni'}.
        </span>
        <Link href="/prezzi" className="font-semibold underline underline-offset-2 shrink-0">
          Sblocca Dtrek
        </Link>
      </div>
    </div>
  )
}
