/**
 * Gate/trial di Dtrek (docs/navigator-dtrek-boundary.md) — risolutore centrale usato da ogni punto
 * di enforcement (app/api/planned, app/api/resoconto, app/api/guide): un solo posto che decide se
 * l'utente ha accesso pieno, ed entro quali limiti opera durante il periodo di prova.
 *
 * `unlocked` copre le tre vie di sblocco decise: account owner (is_owner, mai visibile ad altri
 * account grazie alla RLS già esistente su user_settings), abbonamento Premium a pagamento
 * (subscription_tier), o chiave Claude propria (BYOK) — quest'ultima sblocca l'intero Dtrek, non
 * solo il costo AI, per decisione esplicita (vedi il documento).
 *
 * Il periodo di prova (utente né owner né Premium né BYOK) resta attivo finché NON scade il primo
 * tra due limiti indipendenti:
 *  - tempo: DTREK_TRIAL_DAYS giorni da trial_started_at;
 *  - consumo: ENTRAMBI i tetti (percorsi E resoconti) esauriti — i due tetti restano indipendenti
 *    finché non scattano tutti e due: esaurire i percorsi non blocca i resoconti e viceversa
 *    (canCreateRoute/canCreateReport sono valutati separatamente da trialExpired).
 *
 * Nessuna colonna contatore: routesUsed/reportsUsed sono COUNT(*) live su planned_hikes/hike_reports
 * — niente da tenere sincronizzato, niente rischio di drift.
 */
import { supabase } from '@/lib/supabase'

export const DTREK_TRIAL_DAYS           = 30
export const DTREK_TRIAL_ROUTES_LIMIT   = 2
export const DTREK_TRIAL_REPORTS_LIMIT  = 2

export interface DtrekEntitlement {
  unlocked: boolean
  isOwner: boolean
  /** Prova in corso: né sbloccato né scaduta (né per tempo né per consumo di ENTRAMBI i tetti). */
  trialActive: boolean
  /** Prova scaduta (tempo o entrambi i tetti esauriti) e utente non sbloccato — sola lettura su
   *  tutto: niente nuovi percorsi/resoconti, niente modifiche a quelli esistenti. Le GET restano
   *  sempre permesse a prescindere da questo flag. */
  trialExpired: boolean
  /** 0 quando trialExpired o quando l'utente è sbloccato (il conteggio giorni non si applica). */
  trialDaysLeft: number
  routesUsed: number
  routesLimit: number
  canCreateRoute: boolean
  reportsUsed: number
  reportsLimit: number
  canCreateReport: boolean
  /** True dal momento in cui l'utente ha toccato "Passa a Dtrek" dentro Navigator (o l'ha già
   *  raggiunto autonomamente prima ancora di scaricare Navigator — stesso account, stesso flag) —
   *  indipendente da unlocked/trial: un utente in prova può già essere "passato a Dtrek" e vedersi
   *  le sue schermate, semplicemente con i limiti di prova invece che sbloccati. Confine
   *  Navigator/Dtrek (docs/navigator-dtrek-boundary.md), non gate di pagamento. */
  dtrekActivated: boolean
}

function unlockedEntitlement(isOwner: boolean, dtrekActivated: boolean): DtrekEntitlement {
  return {
    unlocked: true, isOwner, trialActive: false, trialExpired: false, trialDaysLeft: 0,
    routesUsed: 0, routesLimit: DTREK_TRIAL_ROUTES_LIMIT, canCreateRoute: true,
    reportsUsed: 0, reportsLimit: DTREK_TRIAL_REPORTS_LIMIT, canCreateReport: true,
    dtrekActivated,
  }
}

export async function resolveDtrekEntitlement(userId: string): Promise<DtrekEntitlement> {
  const { data: settings, error } = await supabase
    .from('user_settings')
    .select('is_owner, subscription_tier, claude_api_key, trial_started_at, premium_expires_at, dtrek_activated_at')
    .eq('user_id', userId)
    .maybeSingle()

  // Supabase irraggiungibile — stesso principio di degrado morbido applicato ovunque nel resto del
  // codice (vedi lib/supabaseAuth.ts, app/lib/guide/resolveApiKeyAndSettings.ts): un blackout non
  // deve trasformarsi in un blocco totale della scrittura per chi normalmente avrebbe accesso.
  // Sbloccato temporaneamente finché la verifica non torna disponibile, non è un bypass permanente.
  // dtrekActivated=true nel degrado: un blackout Supabase non deve far ripiombare in Navigator-only
  // un utente che ha già attivato Dtrek — mai vero il contrario (attivare qualcuno per errore).
  if (error) return unlockedEntitlement(false, true)

  const dtrekActivated = !!settings?.dtrek_activated_at

  const isOwner = (settings?.is_owner as boolean | null) ?? false
  // premium_expires_at NULL con subscription_tier='premium' ⇒ sblocco a vita (una tantum), nessuna
  // scadenza. Valorizzato ⇒ abbonamento ricorrente, valido solo finché non supera quella data —
  // aggiornata ad ogni rinnovo dal webhook Paddle (app/api/webhooks/paddle/route.ts); se il rinnovo
  // fallisce o l'utente cancella, questa data smette di avanzare e l'accesso scade da solo, nessun
  // downgrade esplicito necessario.
  const premiumExpiresAt = settings?.premium_expires_at ? new Date(settings.premium_expires_at as string) : null
  const isPremium = (settings?.subscription_tier as string | null) === 'premium'
    && (premiumExpiresAt === null || premiumExpiresAt > new Date())
  const hasByok = !!(settings?.claude_api_key as string | null)
  const unlocked = isOwner || isPremium || hasByok
  if (unlocked) return unlockedEntitlement(isOwner, dtrekActivated)

  const trialStartedAt = settings?.trial_started_at ? new Date(settings.trial_started_at as string) : new Date()
  const daysSinceStart = (Date.now() - trialStartedAt.getTime()) / (1000 * 60 * 60 * 24)
  const timeExpired = daysSinceStart >= DTREK_TRIAL_DAYS
  const trialDaysLeft = timeExpired ? 0 : Math.ceil(DTREK_TRIAL_DAYS - daysSinceStart)

  // is_sample=true (percorso/resoconto omaggio clonato al primo accesso, vedi lib/giftRoute.ts)
  // non conta contro il tetto di prova — non l'ha creato l'utente, non deve consumarne metà da solo.
  const [routesRes, reportsRes] = await Promise.all([
    supabase.from('planned_hikes').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('is_sample', false),
    supabase.from('hike_reports').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('is_sample', false),
  ])
  const routesUsed  = routesRes.count  ?? 0
  const reportsUsed = reportsRes.count ?? 0

  const canCreateRoute  = !timeExpired && routesUsed  < DTREK_TRIAL_ROUTES_LIMIT
  const canCreateReport = !timeExpired && reportsUsed < DTREK_TRIAL_REPORTS_LIMIT
  const consumeExpired = routesUsed >= DTREK_TRIAL_ROUTES_LIMIT && reportsUsed >= DTREK_TRIAL_REPORTS_LIMIT
  const trialExpired = timeExpired || consumeExpired

  return {
    unlocked: false, isOwner: false, trialActive: !trialExpired, trialExpired, trialDaysLeft,
    routesUsed, routesLimit: DTREK_TRIAL_ROUTES_LIMIT, canCreateRoute,
    reportsUsed, reportsLimit: DTREK_TRIAL_REPORTS_LIMIT, canCreateReport,
    dtrekActivated,
  }
}
