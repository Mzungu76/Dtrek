'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import CheckoutButton from '@/components/prezzi/CheckoutButton'

interface PriceInfo {
  amount: number
  currencyCode: string
  priceId: string
}

interface PricesResponse {
  monthly: PriceInfo | null
  lifetime: PriceInfo | null
}

function formatPrice(info: PriceInfo | null): string | null {
  if (!info) return null
  try {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: info.currencyCode }).format(info.amount)
  } catch {
    return `${info.amount} ${info.currencyCode}`
  }
}

/**
 * Le due opzioni di sblocco (mensile/lifetime), auto-alimentate da /api/paddle/prices — condiviso
 * tra /prezzi (pagina intera) e il pannello del badge Premium in Navbar (docs/navigator-dtrek-
 * boundary.md), così i due punti d'accesso mostrano sempre esattamente la stessa cosa.
 */
export default function UpgradeChoicePanel({ compact = false }: { compact?: boolean }) {
  const [prices, setPrices] = useState<PricesResponse | null>(null)

  useEffect(() => {
    fetch('/api/paddle/prices')
      .then(r => r.ok ? r.json() : null)
      .then(setPrices)
      .catch(() => setPrices({ monthly: null, lifetime: null }))
  }, [])

  if (!prices) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 text-stone-300 animate-spin" />
      </div>
    )
  }

  return (
    <div className={compact ? 'space-y-3' : 'grid sm:grid-cols-2 gap-5'}>
      <div className={compact ? 'bg-stone-50 rounded-2xl border border-stone-200 p-4 flex items-center justify-between gap-3' : 'bg-white rounded-2xl border border-stone-200 shadow-sm p-6 flex flex-col'}>
        <div className={compact ? '' : 'flex-1'}>
          <h3 className={compact ? 'text-sm font-semibold text-stone-800' : 'font-display text-xl font-semibold text-stone-800 mb-1'}>Mensile</h3>
          <p className={compact ? 'text-xs text-stone-500' : 'text-3xl font-bold text-forest-700 mb-1'}>
            {formatPrice(prices.monthly) ?? '—'}
            <span className={compact ? '' : 'text-sm font-normal text-stone-400'}> /mese</span>
          </p>
          {!compact && <p className="text-sm text-stone-500 mb-6">Rinnovo automatico, disdicibile in qualsiasi momento.</p>}
        </div>
        {prices.monthly
          ? <div className={compact ? 'w-32 shrink-0' : 'mt-auto'}><CheckoutButton priceId={prices.monthly.priceId} label="Sblocca" /></div>
          : <p className="text-xs text-red-500">Non disponibile</p>}
      </div>

      <div className={compact ? 'bg-forest-50 rounded-2xl border border-forest-300 p-4 flex items-center justify-between gap-3' : 'bg-white rounded-2xl border-2 border-forest-400 shadow-sm p-6 flex flex-col relative'}>
        {!compact && (
          <span className="absolute -top-3 left-6 bg-forest-600 text-white text-xs font-semibold px-3 py-1 rounded-full">
            Consigliato
          </span>
        )}
        <div className={compact ? '' : 'flex-1'}>
          <h3 className={compact ? 'text-sm font-semibold text-stone-800' : 'font-display text-xl font-semibold text-stone-800 mb-1'}>A vita</h3>
          <p className={compact ? 'text-xs text-stone-500' : 'text-3xl font-bold text-forest-700 mb-1'}>
            {formatPrice(prices.lifetime) ?? '—'}
            <span className={compact ? '' : 'text-sm font-normal text-stone-400'}> una tantum</span>
          </p>
          {!compact && <p className="text-sm text-stone-500 mb-6">Un pagamento unico, accesso per sempre, nessun rinnovo.</p>}
        </div>
        {prices.lifetime
          ? <div className={compact ? 'w-32 shrink-0' : 'mt-auto'}><CheckoutButton priceId={prices.lifetime.priceId} label="Sblocca" primary /></div>
          : <p className="text-xs text-red-500">Non disponibile</p>}
      </div>

      <p className={`text-center text-xs text-stone-400 ${compact ? '' : 'sm:col-span-2 mt-3'}`}>
        Hai già una chiave API Claude personale? Aggiungila gratis nelle{' '}
        <Link href="/profilo/ai" className="underline">impostazioni del profilo</Link> — sblocca Dtrek allo stesso modo, senza pagare.
      </p>
    </div>
  )
}
