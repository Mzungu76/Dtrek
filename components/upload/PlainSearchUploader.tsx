'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Search, Loader2, MapPin, CheckCircle, AlertCircle, Mountain, Clock, TrendingUp } from 'lucide-react'
import { savePlanned, type PlannedHike } from '@/lib/plannedStore'
import { downsamplePolyline } from '@/lib/downsamplePolyline'
import { fetchPoisNearTrack } from '@/lib/poisProxy'
import { fetchWikiForNamedPois } from '@/lib/wikipedia'
import { computeCtsForHike } from '@/lib/computeCtsForHike'
import { computeSafetyForHike } from '@/lib/computeSafetyForHike'
import { formatDuration } from '@/lib/tcxParser'
import { defaultPendingExpiresAt } from './sharedHelpers'

interface Candidate {
  id: number
  name: string
  hasName: boolean
  ref?: string
  network?: string
}

interface ResolvedTrack {
  trackPoints: PlannedHike['trackPoints']
  distanceMeters: number
  elevationGain: number
  elevationLoss: number
  altitudeMax: number
  altitudeMin: number
  estimatedTimeSeconds: number
  hasElevation: boolean
}

type View = 'search' | 'results' | 'confirm'

const NETWORK_LABEL: Record<string, string> = { iwn: 'Internazionale', nwn: 'Nazionale', rwn: 'Regionale', lwn: 'Locale' }

export default function PlainSearchUploader({ onBack }: { onBack: () => void }) {
  const router = useRouter()
  const [view, setView] = useState<View>('search')
  const [name, setName] = useState('')
  const [area, setArea] = useState('')
  const [searching, setSearching] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [candidates, setCandidates] = useState<Candidate[]>([])

  const [selected, setSelected] = useState<Candidate | null>(null)
  const [resolving, setResolving] = useState(false)
  const [resolved, setResolved] = useState<ResolvedTrack | null>(null)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSearch() {
    const trimmed = name.trim()
    if (!trimmed || searching) return
    setSearching(true)
    setErrorMsg('')
    try {
      const res = await fetch('/api/route-search-plain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed, area: area.trim() || undefined }),
      })
      const data = await res.json()
      if (!res.ok) {
        setErrorMsg(data.message || 'Ricerca non riuscita, riprova.')
        return
      }
      setCandidates(data.candidates ?? [])
      setView('results')
    } catch {
      setErrorMsg('Errore di rete, riprova.')
    } finally {
      setSearching(false)
    }
  }

  async function chooseCandidate(c: Candidate) {
    setSelected(c)
    setTitle(c.name)
    setDate('')
    setResolved(null)
    setView('confirm')
    setResolving(true)
    try {
      const res = await fetch('/api/route-search/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ osmId: c.id }),
      })
      const data = await res.json()
      if (data.ok) setResolved(data)
      else setErrorMsg('Non sono riuscito a recuperare la traccia reale di questo percorso.')
    } catch {
      setErrorMsg('Errore di rete, riprova.')
    }
    setResolving(false)
  }

  async function handleImport() {
    if (!selected) return
    setSaving(true)
    try {
      const pendingExpiresAt = await defaultPendingExpiresAt()
      const hike: PlannedHike = {
        id: 'plainsearch_' + Date.now().toString(36),
        title: title.trim() || selected.name,
        plannedDate: date || undefined,
        createdAt: new Date().toISOString(),
        distanceMeters: resolved?.distanceMeters ?? 0,
        elevationGain: resolved?.elevationGain ?? 0,
        elevationLoss: resolved?.elevationLoss ?? 0,
        altitudeMax: resolved?.altitudeMax ?? 0,
        altitudeMin: resolved?.altitudeMin ?? 0,
        estimatedTimeSeconds: resolved?.estimatedTimeSeconds ?? 0,
        osmId: selected.id,
        trackPoints: resolved?.trackPoints?.length ? resolved.trackPoints : undefined,
        routePolyline: resolved?.trackPoints?.length ? downsamplePolyline(resolved.trackPoints) : undefined,
        pendingExpiresAt,
      }

      if (hike.trackPoints?.length) {
        const gps = hike.trackPoints.filter(p => p.lat && p.lon).map(p => [p.lat!, p.lon!] as [number, number])
        if (gps.length >= 2) {
          try {
            const deadline = new Promise<null>(r => setTimeout(() => r(null), 7000))
            const pois = await Promise.race([fetchPoisNearTrack(gps, 300), deadline])
            if (pois?.length) {
              hike.cachedPois = pois
              const poiWiki = await Promise.race([fetchWikiForNamedPois(pois), deadline])
              if (poiWiki?.length) hike.cachedPoiWiki = poiWiki
            }
          } catch {}
        }
      }

      await savePlanned(hike)
      computeCtsForHike(hike).catch(() => {})
      computeSafetyForHike(hike).catch(() => {})
      router.push(`/guida/${encodeURIComponent(hike.id)}`)
    } catch (e) {
      setErrorMsg(`Errore nel salvataggio: ${e instanceof Error ? e.message : String(e)}`)
      setSaving(false)
    }
  }

  const backButton = (label: string, onClick: () => void) => (
    <button onClick={onClick} className="flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-700 transition-colors">
      <ArrowLeft className="w-4 h-4" /> {label}
    </button>
  )

  // ── Search ────────────────────────────────────────────────────────────────

  if (view === 'search') return (
    <div className="space-y-4">
      {backButton('Indietro', onBack)}
      <div className="bg-white rounded-2xl border border-stone-200 p-5 space-y-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-stone-100 text-stone-600 flex items-center justify-center shrink-0">
            <Search className="w-4.5 h-4.5" />
          </div>
          <div>
            <h3 className="font-display text-base font-semibold text-stone-800">Cerca senza AI</h3>
            <p className="text-xs text-stone-400">Ricerca diretta su OpenStreetMap, per nome esatto o quasi esatto</p>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-600 mb-1">Nome del percorso</label>
          <input value={name} onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSearch() }}
            placeholder="Es. Cascata del Picchio"
            className="w-full border border-stone-300 rounded-xl px-3 py-2 text-sm text-stone-800 bg-stone-50 outline-none focus:border-stone-400 focus:bg-white" />
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-600 mb-1">Zona / comune <span className="font-normal text-stone-400">(opzionale, restringe la ricerca)</span></label>
          <input value={area} onChange={e => setArea(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSearch() }}
            placeholder="Es. Soriano nel Cimino"
            className="w-full border border-stone-300 rounded-xl px-3 py-2 text-sm text-stone-800 bg-stone-50 outline-none focus:border-stone-400 focus:bg-white" />
        </div>
        {errorMsg && <p className="text-red-500 text-xs">{errorMsg}</p>}
        <button onClick={handleSearch} disabled={searching || !name.trim()}
          className="w-full flex items-center justify-center gap-2 py-3 bg-stone-700 hover:bg-stone-800 disabled:opacity-40 text-white rounded-xl font-semibold transition-colors">
          {searching ? <><Loader2 className="w-4 h-4 animate-spin" /> Cerco su OpenStreetMap…</> : 'Cerca'}
        </button>
      </div>
    </div>
  )

  // ── Results ───────────────────────────────────────────────────────────────

  if (view === 'results') return (
    <div className="space-y-3">
      {backButton('Nuova ricerca', () => setView('search'))}
      {candidates.length === 0 && (
        <div className="flex items-start gap-2 px-3.5 py-3 rounded-xl bg-amber-50 border border-amber-100 text-sm text-amber-800">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <p>Nessun percorso trovato con questo nome su OpenStreetMap — prova un nome più semplice o senza zona, oppure usa &quot;Cerca con l&apos;AI&quot;.</p>
        </div>
      )}
      {candidates.map(c => (
        <button key={c.id} onClick={() => chooseCandidate(c)}
          className="w-full text-left bg-white rounded-2xl border border-stone-200 p-4 flex items-center justify-between gap-3 hover:border-stone-300 transition-colors">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-forest-50 text-forest-600 flex items-center justify-center shrink-0">
              <MapPin className="w-4.5 h-4.5" />
            </div>
            <div className="min-w-0">
              <p className="font-medium text-stone-800 truncate">{c.name}</p>
              <p className="text-xs text-stone-400">
                {c.ref ? `Rif. ${c.ref}` : 'Nessun riferimento'}
                {c.network && ` · Rete ${NETWORK_LABEL[c.network] ?? c.network}`}
              </p>
            </div>
          </div>
          <span className="shrink-0 px-3 py-1.5 rounded-full bg-stone-100 text-stone-700 text-xs font-semibold uppercase tracking-wide">
            Importa
          </span>
        </button>
      ))}
    </div>
  )

  // ── Confirm ───────────────────────────────────────────────────────────────

  if (view === 'confirm' && selected) {
    const distanceKm = resolved?.distanceMeters ? resolved.distanceMeters / 1000 : null
    const estimated = !resolved?.hasElevation

    return (
      <div className="space-y-4">
        {backButton('Torna ai risultati', () => setView('results'))}

        <div className="bg-white rounded-2xl border border-stone-200 p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-600 mb-1">Nome del percorso</label>
            <input value={title} onChange={e => setTitle(e.target.value)}
              className="w-full border border-stone-300 rounded-xl px-3 py-2 text-sm text-stone-800 bg-stone-50 outline-none focus:border-stone-400 focus:bg-white" />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-600 mb-1">Data <span className="font-normal text-stone-400">(opzionale)</span></label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="border border-stone-300 rounded-xl px-3 py-2 text-sm text-stone-700 bg-stone-50 outline-none focus:border-stone-400 focus:bg-white" />
          </div>

          {resolving ? (
            <div className="flex items-center gap-2 text-stone-400 text-sm py-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Recupero traccia e quota reali…
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { icon: <MapPin className="w-4 h-4" />, label: 'Distanza', val: distanceKm != null ? `${estimated ? '~' : ''}${distanceKm.toFixed(1)} km` : '—' },
                { icon: <TrendingUp className="w-4 h-4" />, label: 'Dislivello +', val: resolved?.elevationGain != null ? `${estimated ? '~' : ''}${Math.round(resolved.elevationGain)} m` : '—' },
                { icon: <Mountain className="w-4 h-4" />, label: 'Quota max', val: resolved?.altitudeMax ? `${Math.round(resolved.altitudeMax)} m` : '—' },
                { icon: <Clock className="w-4 h-4" />, label: 'Tempo stimato', val: resolved?.estimatedTimeSeconds ? formatDuration(resolved.estimatedTimeSeconds) : '—' },
              ].map(s => (
                <div key={s.label} className="bg-stone-50 rounded-xl border border-stone-150 p-3">
                  <p className="text-[10px] text-stone-400">{s.label}</p>
                  <p className="text-sm font-semibold text-stone-800">{s.val}</p>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-start gap-2 px-3.5 py-3 rounded-xl bg-sky-50 border border-sky-100 text-xs text-sky-800">
            <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <p>
              {resolved?.trackPoints?.length
                ? 'Come un import GPX: mappa, profilo altimetrico e punti di interesse verranno elaborati automaticamente dopo l\'import.'
                : 'Percorso senza traccia GPS reale: la guida verrà comunque generata, ma senza mappa né profilo altimetrico.'}
            </p>
          </div>
        </div>

        {errorMsg && <p className="text-red-500 text-sm">{errorMsg}</p>}

        <button onClick={handleImport} disabled={saving || resolving}
          className="w-full flex items-center justify-center gap-2 py-3 bg-stone-700 hover:bg-stone-800 disabled:opacity-40 text-white rounded-xl font-semibold transition-colors">
          {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5" />}
          Importa e apri la guida
        </button>
      </div>
    )
  }

  return null
}
