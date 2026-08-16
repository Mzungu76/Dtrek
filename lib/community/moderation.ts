// Fase 4 di docs/navigator-orizzonti-roadmap.md — filtraggio DETERMINISTICO, non moderazione:
// nessun intervento umano, nessun ML, nessuna valutazione di contesto o intento. Un primo
// argine contro lo spam/abuso più ovvio (rate-limit + cap di lunghezza + parole bandite), non
// una garanzia di contenuto appropriato — va comunicato come tale, mai come "moderato".
import { Redis } from '@upstash/redis'

export const MAX_NOTE_LENGTH = 280
export const MAX_NOTES_PER_DAY = 3

// Lista statica minimale, non esaustiva — v1 volutamente semplice (nessun pannello admin, nessuna
// fonte esterna). Solo termini italiani comuni di spam/volgarità più ovvi.
const BANNED_WORDS = ['cazzo', 'merda', 'stronzo', 'vaffanculo', 'puttana', 'bastardo']

let redisClient: Redis | null | undefined

function getClient(): Redis | null {
  if (redisClient !== undefined) return redisClient
  const url = process.env.KV_REST_API_URL
  const token = process.env.KV_REST_API_TOKEN
  redisClient = url && token ? new Redis({ url, token }) : null
  return redisClient
}

export interface ModerationResult {
  ok: boolean
  reason?: string
}

/**
 * Filtro puro, deterministico — riusabile sia in scrittura (route POST) sia in lettura (route
 * GET, difesa in profondità contro contenuto scritto prima di un aggiornamento della lista di
 * parole bandite). Una stringa vuota/solo spazi è considerata "nessuna nota", non un errore —
 * il chiamante decide se salvare `null` in quel caso.
 */
export function filterNoteText(text: string): ModerationResult {
  const trimmed = text.trim()
  if (trimmed.length === 0) return { ok: true }
  if (trimmed.length > MAX_NOTE_LENGTH) {
    return { ok: false, reason: `Nota troppo lunga (massimo ${MAX_NOTE_LENGTH} caratteri)` }
  }
  const lower = trimmed.toLowerCase()
  if (BANNED_WORDS.some((w) => lower.includes(w))) {
    return { ok: false, reason: 'Contenuto non consentito' }
  }
  return { ok: true }
}

/**
 * Solo in scrittura (a differenza di filterNoteText sopra) — un limite sull'ATTO di scrivere,
 * non sul contenuto in sé, non ha senso riapplicato in lettura. Stesso pattern di degrado
 * morbido di lib/aiCooldown.ts: se Redis non è configurato, ogni chiamata torna "consentito" in
 * silenzio — nessun blocco nuovo introdotto quando l'infrastruttura manca.
 */
export async function checkNoteRateLimit(userId: string, maxPerDay: number = MAX_NOTES_PER_DAY): Promise<boolean> {
  const redis = getClient()
  if (!redis) return true
  try {
    const key = `dtrek:community:notes:${userId}`
    const count = await redis.incr(key)
    if (count === 1) await redis.expire(key, 86400)
    return count <= maxPerDay
  } catch {
    return true
  }
}
