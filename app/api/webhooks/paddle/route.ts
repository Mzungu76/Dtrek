import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { verifyPaddleWebhookSignature } from '@/lib/paddle'

export const dynamic = 'force-dynamic'

interface PaddleSubscriptionData {
  id: string
  customer_id: string
  status: string // 'active' | 'trialing' | 'past_due' | 'paused' | 'canceled'
  current_billing_period?: { ends_at?: string }
  custom_data?: Record<string, unknown> | null
}

interface PaddleTransactionData {
  id: string
  customer_id: string
  subscription_id: string | null
  custom_data?: Record<string, unknown> | null
}

function extractUserId(customData: Record<string, unknown> | null | undefined): string | null {
  const id = customData?.dtrek_user_id
  return typeof id === 'string' ? id : null
}

async function upsertPremium(userId: string, patch: {
  premium_expires_at: string | null
  paddle_customer_id: string
  paddle_subscription_id?: string
}) {
  await supabase.from('user_settings').upsert(
    { user_id: userId, subscription_tier: 'premium', ...patch, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  )
}

// Abbonamento creato o rinnovato (docs/navigator-dtrek-boundary.md) — premium_expires_at diventa la
// fine del periodo di fatturazione corrente; se il rinnovo automatico si interrompe (pagamento
// fallito, cancellazione) semplicemente non arriva più un subscription.updated a spostare questa
// data in avanti, e l'accesso scade da solo (lib/dtrekEntitlement.ts) — nessun downgrade esplicito
// da gestire qui per subscription.canceled/past_due.
async function handleSubscriptionEvent(data: PaddleSubscriptionData) {
  if (data.status !== 'active' && data.status !== 'trialing') return

  const periodEnd = data.current_billing_period?.ends_at
  if (!periodEnd) return

  const userId = extractUserId(data.custom_data)
  const patch = { premium_expires_at: periodEnd, paddle_customer_id: data.customer_id, paddle_subscription_id: data.id }

  if (userId) {
    await upsertPremium(userId, patch)
    return
  }
  // Rinnovi successivi al primo potrebbero non ripetere custom_data (dipende da come Paddle
  // propaga i metadati sull'abbonamento) — fallback: la riga è già collegata a questo
  // subscription_id da un evento precedente, aggiornala per id invece che per user_id.
  await supabase
    .from('user_settings')
    .update({ premium_expires_at: periodEnd, subscription_tier: 'premium', updated_at: new Date().toISOString() })
    .eq('paddle_subscription_id', data.id)
}

// Acquisto una tantum completato — SOLO se non è la transazione di apertura di un abbonamento
// (quelle hanno subscription_id valorizzato e sono già coperte da handleSubscriptionEvent sopra).
// premium_expires_at: null ⇒ sblocco a vita, nessuna scadenza.
async function handleTransactionCompleted(data: PaddleTransactionData) {
  if (data.subscription_id) return

  const userId = extractUserId(data.custom_data)
  if (!userId) return

  await upsertPremium(userId, { premium_expires_at: null, paddle_customer_id: data.customer_id })
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const signature = req.headers.get('paddle-signature')

  if (!verifyPaddleWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Firma non valida' }, { status: 401 })
  }

  let event: { event_type?: string; data?: unknown }
  try {
    event = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Corpo non valido' }, { status: 400 })
  }

  try {
    if (event.event_type === 'subscription.created' || event.event_type === 'subscription.updated') {
      await handleSubscriptionEvent(event.data as PaddleSubscriptionData)
    } else if (event.event_type === 'transaction.completed') {
      await handleTransactionCompleted(event.data as PaddleTransactionData)
    }
    // Altri tipi di evento ignorati volutamente: non servono a sbloccare/rinnovare l'accesso.
  } catch (e) {
    console.error('[webhooks/paddle] errore elaborazione evento:', event.event_type, e)
    // Non-2xx ⇒ Paddle ritenta la consegna più avanti — corretto quando l'errore è nostro (es.
    // Supabase temporaneamente irraggiungibile), non va assorbito silenziosamente con un 200.
    return NextResponse.json({ error: 'Errore interno' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
