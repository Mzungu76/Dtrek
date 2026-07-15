import { Redis } from '@upstash/redis'

/**
 * Cooldown anti-spam best-effort per le generazioni AI più costose (guida, resoconto,
 * assistente di editing del resoconto) — non un rate limit stretto per abuso, solo una rete di
 * sicurezza economica contro click ripetuti in sequenza sulla stessa risorsa (lo stesso percorso o
 * la stessa attività): senza questo, nulla impediva a un utente di rigenerare la stessa guida
 * dieci volte in un minuto, pagando ogni volta una chiamata Claude piena.
 *
 * Usa Upstash Redis (stessa istanza di lib/aiKeyCache.ts, integrazione Vercel KV) invece di uno
 * stato in-memory perché le funzioni serverless non condividono memoria tra istanze — un contatore
 * locale non fermerebbe due richieste ravvicinate finite su istanze diverse. Se Redis non è
 * configurato, ogni chiamata qui torna "consentito" in silenzio: nessun blocco nuovo introdotto,
 * stesso principio di degrado di lib/aiKeyCache.ts.
 */

let client: Redis | null | undefined

function getClient(): Redis | null {
  if (client !== undefined) return client
  const url   = process.env.KV_REST_API_URL
  const token = process.env.KV_REST_API_TOKEN
  client = url && token ? new Redis({ url, token }) : null
  return client
}

/** Durata standard del cooldown per le rigenerazioni AI più onerose — vedi il commento sopra. */
export const AI_COOLDOWN_SECONDS = 30

/**
 * Tenta di "prenotare" `resourceId` per i prossimi `seconds` secondi: ritorna true la prima volta
 * (e la richiesta può procedere), false se una richiesta precedente ha già prenotato la stessa
 * risorsa da meno di `seconds` secondi. SET...NX è atomico lato Redis, quindi due richieste
 * arrivate quasi in contemporanea non possono passare entrambe.
 */
export async function tryAcquireCooldown(scope: string, resourceId: string, seconds: number = AI_COOLDOWN_SECONDS): Promise<boolean> {
  const redis = getClient()
  if (!redis) return true
  try {
    const key = `dtrek:cooldown:${scope}:${resourceId}`
    const ok = await redis.set(key, '1', { nx: true, ex: seconds })
    return ok === 'OK'
  } catch {
    return true
  }
}
