'use client'
import { useEffect, useState } from 'react'
import { Users, Loader2, Copy, Check, LogOut, WifiOff } from 'lucide-react'
import { lsGet, lsSet, lsDel } from '@/lib/localStore'

interface Props {
  /** null quando la navigazione è stata avviata offline — stesso caso di LiveShareToggle.tsx (Fase 1). */
  sessionId: string | null
  plannedHikeId: string
  /** Riusa esattamente lo stesso interruttore che già guida il loop di pubblicazione posizione
   *  della Fase 1 (ActiveNavigationView.tsx) — un gruppo attivo deve far partire quel loop
   *  tanto quanto la condivisione individuale, non serve un secondo meccanismo. */
  onGroupActive?: (active: boolean) => void
}

interface JoinedInfo { token: string; sessionId: string }

const JOINED_KEY = (hikeId: string) => `nav-group-joined:${hikeId}`

function extractToken(input: string): string {
  const trimmed = input.trim()
  const match = trimmed.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i)
  return match ? match[1] : trimmed
}

/**
 * Fase 9 di docs/navigator-orizzonti-roadmap.md — "crea un gruppo" o "unisciti con un link",
 * montato nello stesso foglio "Condividi posizione" di LiveShareToggle.tsx. Modello scelto
 * esplicitamente con l'utente: link pubblico broadcast per GUARDARE (nessun login), ma
 * PARTECIPARE (pubblicare la propria posizione) richiede un account, come per la Fase 1.
 */
export default function GroupModeSection({ sessionId, plannedHikeId, onGroupActive }: Props) {
  const [ownGroup, setOwnGroup] = useState<{ groupId: string; token: string; expiresAt: string } | null>(null)
  const [joined, setJoined] = useState<JoinedInfo | null>(null)
  const [joinCode, setJoinCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const originUrl = typeof window !== 'undefined' ? window.location.origin : ''

  useEffect(() => {
    lsGet<JoinedInfo>(JOINED_KEY(plannedHikeId)).then((j) => { if (j) { setJoined(j); onGroupActive?.(true) } })
    fetch(`/api/navigation/groups?plannedHikeId=${encodeURIComponent(plannedHikeId)}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.groupId) { setOwnGroup({ groupId: d.groupId, token: d.token, expiresAt: d.expiresAt }); onGroupActive?.(true) } })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plannedHikeId])

  const createGroup = async () => {
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/navigation/groups', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plannedHikeId }),
      })
      const d = await res.json()
      if (!res.ok) { setError(d.error ?? 'Errore nella creazione del gruppo'); return }
      setOwnGroup({ groupId: d.groupId, token: d.token, expiresAt: d.expiresAt })
      onGroupActive?.(true)
    } finally { setBusy(false) }
  }

  const closeGroup = async () => {
    if (!ownGroup) return
    setBusy(true)
    try {
      await fetch(`/api/navigation/groups?groupId=${encodeURIComponent(ownGroup.groupId)}`, { method: 'DELETE' })
      setOwnGroup(null)
    } finally { setBusy(false) }
  }

  const joinGroup = async () => {
    if (!sessionId || !joinCode.trim()) return
    setBusy(true); setError(null)
    try {
      const token = extractToken(joinCode)
      const res = await fetch('/api/navigation/groups/join', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, sessionId }),
      })
      const d = await res.json()
      if (!res.ok) { setError(d.error ?? 'Impossibile unirsi al gruppo'); return }
      const info: JoinedInfo = { token, sessionId }
      setJoined(info)
      await lsSet(JOINED_KEY(plannedHikeId), info)
      onGroupActive?.(true)
    } finally { setBusy(false) }
  }

  const leaveGroup = async () => {
    if (!joined) return
    setBusy(true)
    try {
      await fetch(`/api/navigation/groups/join?sessionId=${encodeURIComponent(joined.sessionId)}`, { method: 'DELETE' })
      setJoined(null)
      await lsDel(JOINED_KEY(plannedHikeId))
    } finally { setBusy(false) }
  }

  const copyLink = async () => {
    if (!ownGroup) return
    try {
      await navigator.clipboard.writeText(`${originUrl}/s/live/group/${ownGroup.token}`)
      setCopied(true); setTimeout(() => setCopied(false), 2200)
    } catch { /* ignorato */ }
  }

  if (!sessionId) {
    return (
      <div className="flex items-start gap-3 p-4 rounded-xl bg-stone-50 border border-stone-200 mt-3">
        <WifiOff className="w-5 h-5 text-stone-400 shrink-0 mt-0.5" />
        <p className="text-xs text-stone-500">La modalità gruppo richiede una sessione online — riprova quando torna la rete.</p>
      </div>
    )
  }

  return (
    <div className="mt-4 pt-4 border-t border-stone-100 space-y-3">
      <div className="flex items-center gap-2">
        <Users className="w-4 h-4 text-forest-600" />
        <p className="text-xs font-semibold text-stone-700 uppercase tracking-widest">Modalità gruppo</p>
      </div>

      {ownGroup ? (
        <div className="space-y-2">
          <p className="text-xs text-stone-500">Chiunque abbia il link vede tutti i partecipanti che si sono uniti — nessun login richiesto per guardare.</p>
          <div className="flex items-center gap-2 bg-stone-50 border border-stone-200 rounded-xl px-3 py-2">
            <input readOnly value={`${originUrl}/s/live/group/${ownGroup.token}`} onFocus={(e) => e.target.select()} className="flex-1 bg-transparent text-xs text-stone-600 outline-none min-w-0" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={copyLink} className={`flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-medium border ${copied ? 'bg-forest-50 border-forest-300 text-forest-700' : 'bg-forest-600 hover:bg-forest-700 text-white border-forest-600'}`}>
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} {copied ? 'Copiato!' : 'Copia link'}
            </button>
            <button onClick={closeGroup} disabled={busy} className="flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-medium text-red-500 border border-red-200 hover:bg-red-50 disabled:opacity-40">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />} Chiudi gruppo
            </button>
          </div>
        </div>
      ) : joined ? (
        <div className="flex items-center justify-between p-3 rounded-xl bg-forest-50 border border-forest-200">
          <p className="text-xs text-forest-700">Sei nel gruppo — la tua posizione è visibile a chi ha il link.</p>
          <button onClick={leaveGroup} disabled={busy} className="text-xs font-medium text-red-500 hover:text-red-600 disabled:opacity-40 shrink-0 ml-2">
            {busy ? '…' : 'Esci'}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <button onClick={createGroup} disabled={busy} className="w-full flex items-center justify-center gap-2 py-2.5 bg-forest-600 hover:bg-forest-700 text-white rounded-xl text-sm font-medium disabled:opacity-40">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />} Crea un gruppo
          </button>
          <div className="flex items-center gap-2">
            <input
              value={joinCode} onChange={(e) => setJoinCode(e.target.value)}
              placeholder="Incolla il link o il codice del gruppo"
              className="flex-1 px-3 py-2 rounded-xl border border-stone-200 text-sm text-stone-800 outline-none focus:ring-2 focus:ring-forest-400"
            />
            <button onClick={joinGroup} disabled={busy || !joinCode.trim()} className="px-4 py-2 rounded-xl bg-stone-800 text-white text-sm font-medium disabled:opacity-40">
              Unisciti
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
