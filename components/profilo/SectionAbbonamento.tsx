'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Sparkles, Check, ExternalLink, Loader2 } from 'lucide-react'

/**
 * Stato reale dell'abbonamento Premium (docs/navigator-dtrek-boundary.md) — sostituisce il vecchio
 * teaser statico "Prossimamente" ora che il checkout Paddle (app/prezzi) esiste davvero. Sbloccato
 * copre anche owner/BYOK, non solo Premium pagante: per loro non c'è nulla da "gestire" (nessun
 * paddle_customer_id), il pulsante Customer Portal lo segnala invece di fallire in silenzio.
 */
export default function SectionAbbonamento() {
  const [unlocked, setUnlocked] = useState<boolean | null>(null)
  const [portalLoading, setPortalLoading] = useState(false)
  const [portalError, setPortalError] = useState(false)

  useEffect(() => {
    fetch('/api/dtrek-entitlement')
      .then(r => r.ok ? r.json() : null)
      .then(d => setUnlocked(d ? !!d.unlocked : null))
      .catch(() => setUnlocked(null))
  }, [])

  async function openPortal() {
    setPortalError(false)
    setPortalLoading(true)
    try {
      const res = await fetch('/api/paddle/portal')
      const data = await res.json().catch(() => null)
      if (res.ok && data?.url) window.location.href = data.url
      else setPortalError(true)
    } catch {
      setPortalError(true)
    } finally {
      setPortalLoading(false)
    }
  }

  if (unlocked === null) {
    return <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6 h-[92px] animate-pulse" />
  }

  if (unlocked) {
    return (
      <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6">
        <div className="flex items-center gap-2.5 mb-1">
          <div className="w-9 h-9 rounded-xl bg-forest-50 border border-forest-200 flex items-center justify-center shrink-0">
            <Sparkles className="w-4.5 h-4.5 text-forest-600" />
          </div>
          <h2 className="text-sm font-semibold text-stone-800">Dtrek sbloccato</h2>
        </div>
        <p className="text-xs text-stone-400 mb-4 ml-12">Accesso pieno, nessun limite di volume o di tempo.</p>
        <button
          onClick={openPortal}
          disabled={portalLoading}
          className="ml-12 flex items-center gap-2 px-4 py-2 rounded-lg bg-stone-100 hover:bg-stone-200 disabled:opacity-50 text-stone-700 text-xs font-medium transition-colors"
        >
          {portalLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5" />}
          Gestisci abbonamento
        </button>
        {portalError && (
          <p className="ml-12 mt-2 text-xs text-stone-400">
            Nessun abbonamento Paddle da gestire qui — probabilmente hai sbloccato Dtrek con la tua chiave API personale, o come account owner.
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="relative bg-gradient-to-br from-forest-800 to-forest-950 rounded-2xl p-6 overflow-hidden">
      <div className="absolute -top-8 -right-8 w-32 h-32 bg-forest-400/20 rounded-full blur-2xl pointer-events-none" />

      <div className="flex items-start gap-3 mb-3">
        <div className="shrink-0 w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center">
          <Sparkles className="w-5 h-5 text-amber-300" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-white">Dtrek Premium</h2>
          <p className="text-xs text-forest-300 mt-0.5">Guide AI senza bisogno di una chiave personale</p>
        </div>
      </div>

      <ul className="space-y-1.5 mb-4 ml-12">
        {[
          'Percorsi, guide e resoconti AI senza limiti di volume',
          'Nessun periodo di prova a tempo',
          'Sincronizzazione multi-dispositivo illimitata',
        ].map(item => (
          <li key={item} className="flex items-center gap-2 text-xs text-forest-200">
            <Check className="w-3.5 h-3.5 text-forest-400 shrink-0" />
            {item}
          </li>
        ))}
      </ul>

      <Link
        href="/prezzi"
        className="ml-12 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white text-forest-900 text-xs font-semibold hover:bg-forest-50 transition-colors"
      >
        Sblocca Dtrek
      </Link>
    </div>
  )
}
