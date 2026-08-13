'use client'
import { useState } from 'react'
import { Sparkles, ExternalLink, Loader2 } from 'lucide-react'

/**
 * Stato di un account già sbloccato (docs/navigator-dtrek-boundary.md) — condiviso tra
 * SectionAbbonamento.tsx (Impostazioni) e il pannello del badge Premium in Navbar. Il pulsante
 * porta al Customer Portal Paddle solo se esiste un paddle_customer_id (chi ha pagato); per
 * owner/BYOK non c'è nulla da gestire lì, e il messaggio lo spiega invece di fallire in silenzio.
 */
export default function UnlockedStatusPanel({ compact = false }: { compact?: boolean }) {
  const [portalLoading, setPortalLoading] = useState(false)
  const [portalError, setPortalError] = useState(false)

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

  return (
    <div className={compact ? '' : 'bg-white rounded-2xl border border-stone-200 shadow-sm p-6'}>
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
