'use client'
import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { initializePaddle } from '@paddle/paddle-js'
import { Capacitor } from '@capacitor/core'
import { Browser } from '@capacitor/browser'
import { getBrowserSupabase } from '@/lib/supabaseBrowser'

interface Props {
  priceId: string
  label: string
  primary?: boolean
}

/**
 * Apre il checkout Paddle per il prezzo indicato (docs/navigator-dtrek-boundary.md). Richiede una
 * sessione Dtrek attiva — senza, rimanda al login e basta: il checkout senza un account da sbloccare
 * non avrebbe senso, dato che è `dtrek_user_id` (in customData) il solo modo con cui il webhook
 * (app/api/webhooks/paddle/route.ts) sa quale account aggiornare quando arriva la conferma.
 *
 * Dentro l'app nativa Navigator (che dall'attivazione di Dtrek può navigare la stessa WebView
 * anche in `/prezzi`, vedi components/navigation/NavigatorMenu.tsx) questo pulsante non deve MAI
 * aprire l'overlay Paddle incorporato — venderebbe un abbonamento con un processore terzo dentro
 * un'app nativa distribuita sullo store, vietato da Google/Apple. Rimanda invece al browser di
 * sistema, esattamente come Navigator ha sempre fatto per qualunque cosa relativa al pagamento.
 */
export default function CheckoutButton({ priceId, label, primary }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleClick() {
    setError(null)
    setLoading(true)
    try {
      if (Capacitor.isNativePlatform()) {
        await Browser.open({ url: `${window.location.origin}/prezzi` })
        return
      }

      const supabase = getBrowserSupabase()
      const { data } = await supabase.auth.getUser()
      if (!data.user) {
        window.location.href = `/login?next=${encodeURIComponent('/prezzi')}`
        return
      }

      const clientToken = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN
      if (!clientToken) throw new Error('Checkout non configurato — riprova più tardi.')

      const paddle = await initializePaddle({
        environment: process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT === 'production' ? 'production' : 'sandbox',
        token: clientToken,
      })
      if (!paddle) throw new Error('Impossibile aprire il checkout — riprova.')

      paddle.Checkout.open({
        items: [{ priceId, quantity: 1 }],
        customer: data.user.email ? { email: data.user.email } : undefined,
        customData: { dtrek_user_id: data.user.id },
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore imprevisto — riprova.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={loading}
        className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold transition-colors disabled:opacity-50 ${
          primary
            ? 'bg-forest-600 hover:bg-forest-700 text-white'
            : 'bg-stone-100 hover:bg-stone-200 text-stone-700'
        }`}
      >
        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
        {label}
      </button>
      {error && <p className="text-sm text-red-500 mt-2">{error}</p>}
    </div>
  )
}
