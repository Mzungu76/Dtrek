import { NextResponse } from 'next/server'
import { fetchPaddlePrice } from '@/lib/paddle'

export const dynamic = 'force-dynamic'

// Prezzi Dtrek Premium letti dal vivo da Paddle (docs/navigator-dtrek-boundary.md) — nessuna
// autenticazione richiesta: non è un dato per-utente, è il listino pubblico del prodotto, uguale
// per chiunque lo chieda (usato dal pannello di acquisto sia in /prezzi sia nel badge in Navbar).
export async function GET() {
  const monthlyPriceId  = process.env.PADDLE_PRICE_ID_MONTHLY  ?? ''
  const lifetimePriceId = process.env.PADDLE_PRICE_ID_LIFETIME ?? ''

  const [monthly, lifetime] = await Promise.all([
    monthlyPriceId  ? fetchPaddlePrice(monthlyPriceId)  : Promise.resolve(null),
    lifetimePriceId ? fetchPaddlePrice(lifetimePriceId) : Promise.resolve(null),
  ])

  return NextResponse.json({
    monthly:  monthly  ? { ...monthly, priceId: monthlyPriceId }  : null,
    lifetime: lifetime ? { ...lifetime, priceId: lifetimePriceId } : null,
  })
}
