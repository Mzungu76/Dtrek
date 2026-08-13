import Navbar, { MOBILE_TOPBAR_SPACER } from '@/components/Navbar'
import CheckoutButton from '@/components/prezzi/CheckoutButton'
import { fetchPaddlePrice, type PaddlePriceInfo } from '@/lib/paddle'

export const dynamic = 'force-dynamic'

function formatPrice(info: PaddlePriceInfo | null): string | null {
  if (!info) return null
  try {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: info.currencyCode }).format(info.amount)
  } catch {
    return `${info.amount} ${info.currencyCode}`
  }
}

/**
 * Pagina prezzi pubblica (docs/navigator-dtrek-boundary.md) — gli importi sono letti dal vivo da
 * Paddle (lib/paddle.ts), non scritti a mano qui, così non vanno mai disallineati da quanto
 * effettivamente configurato lato Paddle.
 */
export default async function PrezziPage() {
  const monthlyPriceId  = process.env.PADDLE_PRICE_ID_MONTHLY  ?? ''
  const lifetimePriceId = process.env.PADDLE_PRICE_ID_LIFETIME ?? ''

  const [monthly, lifetime] = await Promise.all([
    monthlyPriceId  ? fetchPaddlePrice(monthlyPriceId)  : Promise.resolve(null),
    lifetimePriceId ? fetchPaddlePrice(lifetimePriceId) : Promise.resolve(null),
  ])

  return (
    <div className={`min-h-screen bg-stone-50 md:pb-8 ${MOBILE_TOPBAR_SPACER}`}>
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 py-10">
        <div className="text-center mb-10">
          <h1 className="font-display text-3xl font-bold text-forest-900 mb-2">Sblocca Dtrek</h1>
          <p className="text-stone-500">
            Percorsi, guide e resoconti generati dall&apos;AI senza limiti di volume né periodo di prova.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-5">
          <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6 flex flex-col">
            <h2 className="font-display text-xl font-semibold text-stone-800 mb-1">Mensile</h2>
            <p className="text-3xl font-bold text-forest-700 mb-1">
              {formatPrice(monthly) ?? '—'}
              <span className="text-sm font-normal text-stone-400"> /mese</span>
            </p>
            <p className="text-sm text-stone-500 mb-6">Rinnovo automatico, disdicibile in qualsiasi momento.</p>
            <div className="mt-auto">
              {monthlyPriceId
                ? <CheckoutButton priceId={monthlyPriceId} label="Sblocca mensile" />
                : <p className="text-sm text-red-500">Prezzo non ancora configurato.</p>}
            </div>
          </div>

          <div className="bg-white rounded-2xl border-2 border-forest-400 shadow-sm p-6 flex flex-col relative">
            <span className="absolute -top-3 left-6 bg-forest-600 text-white text-xs font-semibold px-3 py-1 rounded-full">
              Consigliato
            </span>
            <h2 className="font-display text-xl font-semibold text-stone-800 mb-1">A vita</h2>
            <p className="text-3xl font-bold text-forest-700 mb-1">
              {formatPrice(lifetime) ?? '—'}
              <span className="text-sm font-normal text-stone-400"> una tantum</span>
            </p>
            <p className="text-sm text-stone-500 mb-6">Un pagamento unico, accesso per sempre, nessun rinnovo.</p>
            <div className="mt-auto">
              {lifetimePriceId
                ? <CheckoutButton priceId={lifetimePriceId} label="Sblocca a vita" primary />
                : <p className="text-sm text-red-500">Prezzo non ancora configurato.</p>}
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-stone-400 mt-8">
          Hai già una chiave API Claude personale? Aggiungila gratis nelle{' '}
          <a href="/profilo/ai" className="underline">impostazioni del profilo</a> — sblocca Dtrek allo stesso modo, senza pagare.
        </p>
      </main>
    </div>
  )
}
