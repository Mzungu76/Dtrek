'use client'
import { useEffect, useState } from 'react'
import { Key, Trash2, Eye, EyeOff, Loader2, ShieldCheck, WifiOff } from 'lucide-react'

/** Gestione della chiave API Claude personale per la generazione delle guide AI. Piano di ristrutturazione, Parte 2.4. */
export default function SectionClaudeKey() {
  const [hasKey,      setHasKey]      = useState(false)
  const [keyHint,     setKeyHint]     = useState<string | null>(null)
  const [input,       setInput]       = useState('')
  const [showKey,     setShowKey]     = useState(false)
  const [loading,     setLoading]     = useState(true)
  const [saving,      setSaving]      = useState(false)
  const [deleting,    setDeleting]    = useState(false)
  const [status,      setStatus]      = useState<{ ok: boolean; msg: string } | null>(null)
  // true quando /api/user-settings non è riuscito a leggere le impostazioni (es. Supabase
  // irraggiungibile) — va distinto da "hasKey: false", altrimenti una chiave già salvata
  // sparirebbe dalla vista durante un blackout, inducendo a incollarla di nuovo inutilmente.
  const [unavailable, setUnavailable] = useState(false)

  useEffect(() => {
    fetch('/api/user-settings')
      .then(r => r.json().then(d => {
        if (!r.ok) { setUnavailable(true); return }
        setHasKey(d.hasKey); setKeyHint(d.keyHint); setUnavailable(!!d.settingsUnavailable)
      }))
      .catch(() => setUnavailable(true))
      .finally(() => setLoading(false))
  }, [])

  async function handleSave() {
    if (!input.trim()) return
    setSaving(true); setStatus(null)
    const res  = await fetch('/api/user-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: input.trim() }),
    })
    const data = await res.json()
    setSaving(false)
    if (res.ok) {
      setHasKey(true); setKeyHint(data.keyHint); setInput('')
      setStatus({ ok: true, msg: 'Chiave salvata correttamente.' })
    } else {
      setStatus({ ok: false, msg: data.error ?? 'Errore durante il salvataggio.' })
    }
  }

  async function handleDelete() {
    setDeleting(true); setStatus(null)
    const res = await fetch('/api/user-settings', { method: 'DELETE' })
    setDeleting(false)
    if (res.ok) { setHasKey(false); setKeyHint(null); setStatus({ ok: true, msg: 'Chiave rimossa.' }) }
    else setStatus({ ok: false, msg: 'Errore durante la rimozione.' })
  }

  return (
    <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6">
      <div className="flex items-center gap-2.5 mb-1">
        <Key className="w-5 h-5 text-forest-600 shrink-0" />
        <h2 className="text-sm font-semibold text-stone-800">Chiave API Claude</h2>
      </div>
      <p className="text-xs text-stone-500 mb-4 ml-7 leading-relaxed">
        Inserisci la tua chiave personale di{' '}
        <a href="https://console.anthropic.com/" target="_blank" rel="noopener noreferrer"
           className="underline text-forest-600 hover:text-forest-700">
          Anthropic Console
        </a>{' '}
        per generare guide turistiche AI sui tuoi percorsi pianificati.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-stone-400 text-xs ml-7">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Caricamento…
        </div>
      ) : unavailable && !hasKey ? (
        /* Non sappiamo se una chiave esiste già (lookup fallito, non "nessuna chiave") — non
           mostrare il form di inserimento, sarebbe fuorviante per chi l'ha già salvata. */
        <div className="ml-7 flex items-center gap-2 px-3 py-2.5 rounded-lg bg-stone-50 border border-stone-200">
          <WifiOff className="w-4 h-4 text-stone-400 shrink-0" />
          <span className="text-xs text-stone-500">
            Non riesco a verificare la tua chiave in questo momento — riprova tra poco.
          </span>
        </div>
      ) : hasKey ? (
        /* Key already saved */
        <div className="ml-7 space-y-3">
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-forest-50 border border-forest-200">
            <ShieldCheck className="w-4 h-4 text-forest-600 shrink-0" />
            <span className="text-xs font-mono text-forest-800 flex-1">{keyHint}</span>
            <span className="text-[10px] font-medium text-forest-600 bg-forest-100 px-1.5 py-0.5 rounded-full">attiva</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { setHasKey(false); setKeyHint(null) }}
              className="text-xs text-forest-600 hover:text-forest-700 font-medium"
            >
              Sostituisci
            </button>
            <span className="text-stone-300">·</span>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 font-medium disabled:opacity-50"
            >
              {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
              Rimuovi
            </button>
          </div>
        </div>
      ) : (
        /* Input for new key */
        <div className="ml-7 space-y-2">
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={input}
              onChange={e => { setInput(e.target.value); setStatus(null) }}
              placeholder="sk-ant-api03-…"
              className="w-full rounded-lg border border-stone-300 px-3 py-2.5 pr-10 text-sm font-mono outline-none focus:border-forest-500 focus:ring-2 focus:ring-forest-500/20 transition"
            />
            <button
              type="button"
              onClick={() => setShowKey(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
              tabIndex={-1}
            >
              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <button
            onClick={handleSave}
            disabled={saving || !input.trim()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-forest-600 hover:bg-forest-700 disabled:opacity-50 text-white text-sm font-medium transition"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Salva chiave
          </button>
        </div>
      )}

      {status && (
        <p className={`mt-3 ml-7 text-xs font-medium ${status.ok ? 'text-forest-600' : 'text-red-600'}`}>
          {status.ok ? '✓ ' : '✗ '}{status.msg}
        </p>
      )}
    </div>
  )
}
