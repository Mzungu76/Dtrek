'use client'
import { useEffect, useState } from 'react'
import { lsGet, LS_KEYS } from '@/lib/localStore'
import { getLastPullAt, pullAll } from '@/lib/sync/pullEngine'
import { getBrowserSupabase } from '@/lib/supabaseBrowser'
import { isStaleSwResponse } from '@/lib/apiFetch'

interface Snapshot {
  swSupported: boolean
  swControllerUrl: string | null
  swActiveState: string | null
  swHasWaiting: boolean
  swHasInstalling: boolean
  lastPullAt: number | null
  activitiesCount: number | null
  activitiesTitles: string[]
  plannedCount: number | null
}

// Id di "Pian del Vescovo" — il record concreto usato per verificare il report dell'utente
// (assente in locale nonostante pull recenti). Hardcoded solo per la durata di questa indagine.
const INVESTIGATION_TARGET_ID = 'fit_20260719054010_7448_8233'

interface DigestTestResult {
  requestedAt: number
  status: number
  ok: boolean
  dateHeader: string | null
  ageMs: number | null
  wouldBeTreatedAsStale: boolean
  itemCount: number | null
  hasTarget: boolean | null
  sessionPresent: boolean
  sessionExpiresInSec: number | null
  error: string | null
}

/**
 * Temporary, opt-in diagnostic view (add ?synclog=1 to any URL) — added specifically to
 * investigate a hard-to-reproduce report of a device always showing stale data on open even
 * after a hard reload. Every remote check (database, deployment, service worker file/headers,
 * reconciler logic) came back correct; this surfaces the ACTUAL client-side state directly on
 * screen so it can be read off and reported without walking through devtools by voice/chat.
 * Safe to remove once the report is resolved — it changes no behavior, only displays state.
 */
export default function SyncDebugPanel() {
  const [enabled, setEnabled] = useState(false)
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [pulling, setPulling] = useState(false)
  const [testing, setTesting] = useState(false)
  const [digestTest, setDigestTest] = useState<DigestTestResult | null>(null)

  // Chiama /api/activities?digest=1 esattamente come lib/sync/pullEngine.ts, ma qui misuriamo e
  // mostriamo OGNI segnale invece di limitarci ad agire su di esso — l'unico modo per distinguere,
  // sul dispositivo reale dell'utente, se il ciclo di pull silenziosamente fallisce per sessione
  // scaduta (401), per una risposta stale servita dal service worker, o per qualcos'altro.
  const testDigest = async () => {
    setTesting(true)
    const requestedAt = Date.now()
    const result: DigestTestResult = {
      requestedAt, status: 0, ok: false, dateHeader: null, ageMs: null,
      wouldBeTreatedAsStale: false, itemCount: null, hasTarget: null,
      sessionPresent: false, sessionExpiresInSec: null, error: null,
    }
    try {
      const { data } = await getBrowserSupabase().auth.getSession()
      result.sessionPresent = !!data.session
      result.sessionExpiresInSec = data.session?.expires_at
        ? data.session.expires_at - Math.floor(Date.now() / 1000)
        : null
    } catch {}
    try {
      const res = await fetch('/api/activities?digest=1')
      result.status = res.status
      result.ok = res.ok
      result.dateHeader = res.headers.get('date')
      result.ageMs = result.dateHeader ? Date.now() - new Date(result.dateHeader).getTime() : null
      result.wouldBeTreatedAsStale = isStaleSwResponse(res)
      if (res.ok) {
        const json = await res.json() as { id: string }[]
        result.itemCount = json.length
        result.hasTarget = json.some(d => d.id === INVESTIGATION_TARGET_ID)
      }
    } catch (e) {
      result.error = e instanceof Error ? e.message : String(e)
    }
    setDigestTest(result)
    setTesting(false)
  }

  useEffect(() => {
    setEnabled(new URLSearchParams(window.location.search).get('synclog') === '1')
  }, [])

  const refresh = async () => {
    const reg = ('serviceWorker' in navigator) ? await navigator.serviceWorker.getRegistration('/') : undefined
    const activities = await lsGet<{ id: string; title: string }[]>(LS_KEYS.activitiesList)
    const planned = await lsGet<unknown[]>(LS_KEYS.plannedList)
    let authedUserId: string | null = null
    try {
      const { data } = await getBrowserSupabase().auth.getUser()
      authedUserId = data.user?.id ?? null
    } catch {}
    setSnap({
      swSupported: 'serviceWorker' in navigator,
      swControllerUrl: navigator.serviceWorker?.controller?.scriptURL ?? null,
      swActiveState: reg?.active?.state ?? null,
      swHasWaiting: !!reg?.waiting,
      swHasInstalling: !!reg?.installing,
      lastPullAt: getLastPullAt(),
      activitiesCount: activities?.length ?? null,
      activitiesTitles: (activities ?? []).slice(0, 5).map(a => a.title),
      plannedCount: planned?.length ?? null,
    })
    // authedUserId isn't displayed to avoid putting a real user id on screen — the point of
    // fetching it here is only to confirm the auth check itself doesn't throw.
    void authedUserId
  }

  useEffect(() => {
    if (!enabled) return
    refresh()
    const id = setInterval(refresh, 3000)
    return () => clearInterval(id)
  }, [enabled])

  if (!enabled || !snap) return null

  const row = (label: string, value: string) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '2px 0', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
      <span style={{ opacity: 0.7 }}>{label}</span>
      <span style={{ textAlign: 'right', wordBreak: 'break-all' }}>{value}</span>
    </div>
  )

  return (
    <div style={{
      position: 'fixed', bottom: 8, left: 8, right: 8, zIndex: 99999,
      maxHeight: '45vh', overflowY: 'auto',
      background: 'rgba(10,10,10,0.92)', color: '#eee',
      fontFamily: 'monospace', fontSize: 11, lineHeight: 1.4,
      padding: 10, borderRadius: 8, border: '1px solid #444',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <strong>Sync debug</strong>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={testDigest}
            disabled={testing}
            style={{ background: '#26a', color: '#fff', border: 'none', borderRadius: 4, padding: '3px 8px', fontSize: 11 }}
          >
            {testing ? 'Test…' : 'Test digest'}
          </button>
          <button
            onClick={async () => { setPulling(true); await pullAll(); await refresh(); setPulling(false) }}
            disabled={pulling}
            style={{ background: '#2a6', color: '#fff', border: 'none', borderRadius: 4, padding: '3px 8px', fontSize: 11 }}
          >
            {pulling ? 'Aggiorno…' : 'Aggiorna ora'}
          </button>
        </div>
      </div>
      {digestTest && (
        <div style={{ marginBottom: 6, padding: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 4 }}>
          <div style={{ opacity: 0.7, marginBottom: 3 }}>Test diretto /api/activities?digest=1 ({new Date(digestTest.requestedAt).toLocaleTimeString('it-IT')}):</div>
          {row('Sessione presente', String(digestTest.sessionPresent))}
          {row('Sessione scade fra', digestTest.sessionExpiresInSec != null ? digestTest.sessionExpiresInSec + 's' : '(n/d)')}
          {row('HTTP status', String(digestTest.status) + (digestTest.ok ? ' OK' : ' ERRORE'))}
          {row('Header Date risposta', digestTest.dateHeader ?? '(assente)')}
          {row('Età risposta', digestTest.ageMs != null ? Math.round(digestTest.ageMs / 1000) + 's' : '(n/d)')}
          {row('Trattata come stale (SW)', String(digestTest.wouldBeTreatedAsStale))}
          {row('Voci nel digest', String(digestTest.itemCount ?? '(n/d)'))}
          {row('Contiene "Pian del Vescovo"', String(digestTest.hasTarget ?? '(n/d)'))}
          {digestTest.error && row('Errore', digestTest.error)}
        </div>
      )}
      {row('Service worker supportato', String(snap.swSupported))}
      {row('SW che controlla la pagina', snap.swControllerUrl ?? '(nessuno)')}
      {row('SW attivo — stato', snap.swActiveState ?? '(nessuno)')}
      {row('SW in attesa (waiting)', String(snap.swHasWaiting))}
      {row('SW in installazione', String(snap.swHasInstalling))}
      {row('Ultimo controllo aggiornamenti', snap.lastPullAt ? new Date(snap.lastPullAt).toLocaleTimeString('it-IT') + ' (' + Math.round((Date.now() - snap.lastPullAt) / 1000) + 's fa)' : '(mai)')}
      {row('Escursioni in locale', String(snap.activitiesCount ?? '(cache vuota)'))}
      {row('Percorsi pianificati in locale', String(snap.plannedCount ?? '(cache vuota)'))}
      <div style={{ marginTop: 6, opacity: 0.7 }}>Prime 5 escursioni in cache locale (ordine attuale):</div>
      {snap.activitiesTitles.length === 0 && <div>(nessuna)</div>}
      {snap.activitiesTitles.map((t, i) => <div key={i}>{i + 1}. {t}</div>)}
    </div>
  )
}
