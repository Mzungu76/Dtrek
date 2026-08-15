'use client'
import { useEffect, useState } from 'react'
import { Radio, Loader2, Copy, Check, Share2, ExternalLink, Trash2, WifiOff } from 'lucide-react'

interface Props {
  /** null quando la navigazione è stata avviata offline e non esiste ancora una sessione
   *  server a cui agganciare la condivisione (la creazione sessione è anch'essa best-effort). */
  sessionId: string | null
  /** Il componente gestisce da solo il proprio stato (token/scadenza) — questo callback serve
   *  solo a far sapere al genitore SE deve far partire il loop di pubblicazione posizione
   *  (ActiveNavigationView.tsx), senza duplicare la logica di create/revoke/reload qui sopra. */
  onSharingChange?: (enabled: boolean) => void
}

function formatExpiry(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
}

/**
 * Fase 1 di docs/navigator-orizzonti-roadmap.md — stessa logica create/revoke/copy già scritta
 * in components/ShareModal.tsx (condivisione attività), adattata alle route
 * app/api/navigation/share/*. Nessuna generazione di immagine qui: solo gestione del link.
 */
export default function LiveShareToggle({ sessionId, onSharingChange }: Props) {
  const [token, setToken] = useState<string | null>(null)
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [canNativeShare, setCanNativeShare] = useState(false)

  const publicUrl = token && typeof window !== 'undefined' ? `${window.location.origin}/s/live/${token}` : ''

  useEffect(() => {
    setCanNativeShare(typeof navigator !== 'undefined' && !!navigator.share)
  }, [])

  useEffect(() => {
    if (!sessionId) return
    let cancelled = false
    fetch(`/api/navigation/share?sessionId=${encodeURIComponent(sessionId)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (cancelled || !d) return
        setToken(d.token ?? null)
        setExpiresAt(d.expiresAt ?? null)
        if (d.token) onSharingChange?.(true)
      })
      .catch(() => {})
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  const enable = async () => {
    if (!sessionId) return
    setBusy(true)
    try {
      const res = await fetch('/api/navigation/share', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      })
      const d = await res.json()
      if (res.ok) { setToken(d.token); setExpiresAt(d.expiresAt); onSharingChange?.(true) }
    } finally { setBusy(false) }
  }

  const revoke = async () => {
    if (!sessionId) return
    setBusy(true)
    try {
      await fetch(`/api/navigation/share?sessionId=${encodeURIComponent(sessionId)}`, { method: 'DELETE' })
      setToken(null); setExpiresAt(null)
      onSharingChange?.(false)
    } finally { setBusy(false) }
  }

  const copyLink = async () => {
    if (!publicUrl) return
    try {
      if (canNativeShare && navigator.share) {
        await navigator.share({ title: 'La mia posizione live su DTrek', url: publicUrl })
      } else {
        await navigator.clipboard.writeText(publicUrl)
        setCopied(true); setTimeout(() => setCopied(false), 2200)
      }
    } catch { /* condivisione annullata dall'utente */ }
  }

  if (!sessionId) {
    return (
      <div className="flex items-start gap-3 p-4 rounded-xl bg-stone-50 border border-stone-200">
        <WifiOff className="w-5 h-5 text-stone-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-stone-700">Non disponibile senza connessione</p>
          <p className="text-xs text-stone-500 mt-1">
            La navigazione è iniziata offline: non esiste ancora una sessione da condividere.
            Riprova quando torna la rete.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Radio className={`w-4 h-4 ${token ? 'text-sky-600' : 'text-stone-400'}`} />
        <p className="text-xs font-semibold text-stone-700 uppercase tracking-widest">Posizione live</p>
      </div>
      <p className="text-xs text-stone-500 leading-relaxed">
        Un contatto di fiducia con il link vede la tua ultima posizione nota, senza dover
        accedere. Il link scade automaticamente {expiresAt ? `alle ${formatExpiry(expiresAt)}` : 'dopo 12 ore'} — puoi disattivarlo prima in ogni momento.
      </p>

      {!token ? (
        <button
          onClick={enable}
          disabled={busy}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-40"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Radio className="w-4 h-4" />}
          Attiva condivisione live
        </button>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2 bg-stone-50 border border-stone-200 rounded-xl px-3 py-2">
            <input
              readOnly value={publicUrl} onFocus={e => e.target.select()}
              className="flex-1 bg-transparent text-xs text-stone-600 outline-none min-w-0"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={copyLink}
              className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all border
                ${copied ? 'bg-sky-50 border-sky-300 text-sky-700' : 'bg-sky-600 hover:bg-sky-700 text-white border-sky-600'}`}
            >
              {copied ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
              {copied ? 'Copiato!' : canNativeShare ? 'Condividi link' : 'Copia link'}
            </button>
            <a
              href={publicUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 py-2.5 border border-stone-200 rounded-xl text-sm font-medium text-stone-600 hover:border-stone-300 transition-colors"
            >
              <ExternalLink className="w-4 h-4" /> Apri
            </a>
          </div>
          <button
            onClick={enable}
            disabled={busy}
            className="w-full text-center py-1.5 text-xs font-medium text-sky-600 hover:text-sky-700 transition-colors disabled:opacity-40"
          >
            Rinnova per altre 12 ore
          </button>
          <button
            onClick={revoke}
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 py-2 text-xs font-medium text-red-500 hover:text-red-600 transition-colors disabled:opacity-40"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            Disattiva condivisione
          </button>
        </div>
      )}
    </div>
  )
}
