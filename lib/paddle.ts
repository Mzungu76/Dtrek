/**
 * Helper server-side per Paddle (docs/navigator-dtrek-boundary.md) — base URL sandbox/production,
 * lettura prezzo live per la pagina /prezzi, verifica della firma dei webhook. Mai importato da un
 * componente client: usa PADDLE_API_KEY (segreto), mai esposto al browser.
 */
import { createHmac, timingSafeEqual } from 'crypto'

/** NEXT_PUBLIC_ perché la stessa variabile serve anche al client per inizializzare Paddle.js
 *  (app/prezzi/page.tsx) — sandbox/production non è un segreto, è solo "quale dei due ambienti". */
function isProduction(): boolean {
  return process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT === 'production'
}

const PADDLE_API_BASE = () => isProduction() ? 'https://api.paddle.com' : 'https://sandbox-api.paddle.com'

export interface PaddlePriceInfo {
  amount: number
  currencyCode: string
  billingInterval: 'month' | 'year' | null
}

/**
 * Prezzo attuale letto direttamente da Paddle invece di tenerlo scritto a mano nel codice — evita
 * che la pagina prezzi mostri un importo diverso da quello vero se cambia lato Paddle. `null` se la
 * chiamata fallisce (chiave mancante, rete, id sbagliato) — il chiamante mostra un prezzo generico
 * invece di un numero, non un errore bloccante.
 */
export async function fetchPaddlePrice(priceId: string): Promise<PaddlePriceInfo | null> {
  const apiKey = process.env.PADDLE_API_KEY
  if (!apiKey) return null

  try {
    const res = await fetch(`${PADDLE_API_BASE()}/prices/${encodeURIComponent(priceId)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      next: { revalidate: 3600 }, // il prezzo non cambia da un minuto all'altro, niente serve rileggerlo ad ogni richiesta
    })
    if (!res.ok) return null
    const json = await res.json()
    const data = json?.data
    if (!data?.unit_price?.amount) return null
    return {
      amount:          Number(data.unit_price.amount) / 100,
      currencyCode:    data.unit_price.currency_code as string,
      billingInterval: (data.billing_cycle?.interval as 'month' | 'year' | undefined) ?? null,
    }
  } catch {
    return null
  }
}

/**
 * Verifica la firma di un webhook Paddle (header `Paddle-Signature: ts=...;h1=...`) — HMAC-SHA256
 * della stringa `${ts}:${rawBody}` con PADDLE_WEBHOOK_SECRET come chiave, confrontata a tempo
 * costante. `rawBody` deve essere il corpo della richiesta ESATTO ricevuto (non ri-serializzato da
 * JSON.parse+JSON.stringify, che potrebbe non corrispondere byte per byte).
 */
export function verifyPaddleWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.PADDLE_WEBHOOK_SECRET
  if (!secret || !signatureHeader) return false

  const parts = Object.fromEntries(
    signatureHeader.split(';').map(kv => kv.split('=') as [string, string]),
  )
  const ts = parts.ts
  const h1 = parts.h1
  if (!ts || !h1) return false

  const expected = createHmac('sha256', secret).update(`${ts}:${rawBody}`).digest('hex')

  const expectedBuf = Buffer.from(expected, 'hex')
  const receivedBuf = Buffer.from(h1, 'hex')
  if (expectedBuf.length !== receivedBuf.length) return false
  return timingSafeEqual(expectedBuf, receivedBuf)
}
