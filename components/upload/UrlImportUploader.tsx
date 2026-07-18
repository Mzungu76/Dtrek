'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Link2, Loader2, AlertCircle, CheckCircle, Mountain, Clock, TrendingUp, Route,
} from 'lucide-react'
import { savePlanned, type PlannedHike } from '@/lib/plannedStore'
import { downsamplePolyline } from '@/lib/downsamplePolyline'
import { fetchPoisNearTrack } from '@/lib/poisProxy'
import { fetchWikiForNamedPois } from '@/lib/wikipedia'
import { computeCtsForHike } from '@/lib/computeCtsForHike'
import { computeSafetyForHike } from '@/lib/computeSafetyForHike'
import { formatDuration } from '@/lib/tcxParser'
import { defaultPendingExpiresAt } from './sharedHelpers'

type Status = 'idle' | 'resolving' | 'resolved' | 'notfound' | 'saving' | 'success' | 'error'

interface ResolvedTrack {
  title: string
  source: 'gpx' | 'kml' | 'geojson' | 'osm'
  trackPoints: PlannedHike['trackPoints']
  distanceMeters: number
  elevationGain: number
  elevationLoss: number
  altitudeMax: number
  altitudeMin: number
  estimatedTimeSeconds: number
  hasElevation: boolean
  osmId?: number
}

const REASON_MESSAGES: Record<string, string> = {
  blocked_host: 'Questo sito non offre link diretti alla traccia (mappa solo interattiva). Prova con "Cerca con l\'AI", oppure scarica tu il file GPX da quel sito e caricalo dalla scheda "File GPX".',
  gpx_download_failed: 'Ho trovato un link alla traccia ma non sono riuscito a scaricarla — potrebbe non essere più valido. Prova con "Cerca con l\'AI".',
  not_found: 'Non ho trovato una traccia scaricabile per questo link, né un percorso corrispondente su OpenStreetMap. Prova con "Cerca con l\'AI" o "Cerca senza AI".',
  invalid_url: 'Questo non sembra un indirizzo web valido.',
}

export default function UrlImportUploader({ onBack }: { onBack: () => void }) {
  const router = useRouter()
  const [status, setStatus] = useState<Status>('idle')
  const [url, setUrl] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [resolved, setResolved] = useState<ResolvedTrack | null>(null)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')

  async function handleResolve() {
    const trimmed = url.trim()
    if (!trimmed) return
    setStatus('resolving')
    setErrorMsg('')
    try {
      const res = await fetch('/api/route-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed }),
      })
      const data = await res.json()
      if (!data.ok) {
        setErrorMsg(REASON_MESSAGES[data.reason] ?? 'Import non riuscito, riprova.')
        setStatus('notfound')
        return
      }
      setResolved(data)
      setTitle(data.title || '')
      setStatus('resolved')
    } catch {
      setErrorMsg('Errore di rete, riprova.')
      setStatus('notfound')
    }
  }

  async function handleSave() {
    if (!resolved) return
    setStatus('saving')
    try {
      const pendingExpiresAt = await defaultPendingExpiresAt()
      const hike: PlannedHike = {
        id: 'urlimport_' + Date.now().toString(36),
        title: title.trim() || resolved.title || 'Percorso importato',
        plannedDate: date || undefined,
        createdAt: new Date().toISOString(),
        distanceMeters: resolved.distanceMeters,
        elevationGain: resolved.elevationGain,
        elevationLoss: resolved.elevationLoss,
        altitudeMax: resolved.altitudeMax,
        altitudeMin: resolved.altitudeMin,
        estimatedTimeSeconds: resolved.estimatedTimeSeconds,
        osmId: resolved.osmId,
        trackPoints: resolved.trackPoints?.length ? resolved.trackPoints : undefined,
        routePolyline: resolved.trackPoints?.length ? downsamplePolyline(resolved.trackPoints) : undefined,
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

      setStatus('success')
      setTimeout(() => router.push(`/guida/${encodeURIComponent(hike.id)}`), 1200)
    } catch (e) {
      setErrorMsg(`Errore nel salvataggio: ${e instanceof Error ? e.message : String(e)}`)
      setStatus('resolved')
    }
  }

  const header = (
    <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-700 transition-colors mb-4">
      <ArrowLeft className="w-4 h-4" /> Indietro
    </button>
  )

  if (status === 'idle' || status === 'notfound' || status === 'resolving') return (
    <div>
      {header}
      <div className="bg-white rounded-2xl border border-stone-200 p-5 space-y-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center shrink-0">
            <Link2 className="w-4.5 h-4.5" />
          </div>
          <div>
            <h3 className="font-display text-base font-semibold text-stone-800">Importa da un link</h3>
            <p className="text-xs text-stone-400">Incolla l&apos;indirizzo della pagina dove hai trovato il percorso — anche un link diretto a un file GPX, KML, KMZ o GeoJSON</p>
          </div>
        </div>
        <input
          value={url}
          onChange={e => setUrl(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleResolve() }}
          placeholder="https://…"
          disabled={status === 'resolving'}
          className="w-full border border-stone-300 rounded-xl px-3 py-2 text-sm text-stone-800 bg-stone-50 outline-none focus:border-sky-400 focus:bg-white"
        />
        {status === 'notfound' && errorMsg && (
          <div className="flex items-start gap-2 px-3.5 py-3 rounded-xl bg-amber-50 border border-amber-100 text-xs text-amber-800">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <p>{errorMsg}</p>
          </div>
        )}
        <button
          onClick={handleResolve}
          disabled={status === 'resolving' || !url.trim()}
          className="w-full flex items-center justify-center gap-2 py-3 bg-sky-600 hover:bg-sky-700 disabled:opacity-40 text-white rounded-xl font-semibold transition-colors"
        >
          {status === 'resolving' ? <><Loader2 className="w-4 h-4 animate-spin" /> Ricerca traccia…</> : 'Importa'}
        </button>
      </div>
    </div>
  )

  if (status === 'success') return (
    <div>
      {header}
      <div className="drop-zone rounded-2xl p-12 text-center border-sky-400 bg-sky-50">
        <CheckCircle className="w-12 h-12 text-sky-500 mx-auto mb-3" />
        <p className="text-sky-700 font-semibold text-lg">Percorso importato!</p>
        <p className="text-stone-400 text-xs mt-1">Redirect alla valutazione…</p>
      </div>
    </div>
  )

  if (!resolved) return null

  const estimated = !resolved.hasElevation

  return (
    <div>
      {header}
      <div className="space-y-4">
        <div className="bg-sky-50 border border-sky-200 rounded-2xl p-5">
          <p className="text-xs font-semibold text-sky-600 uppercase tracking-wider mb-3">
            {resolved.source === 'gpx' ? 'Traccia GPX trovata'
              : resolved.source === 'kml' ? 'Traccia KML/KMZ trovata'
              : resolved.source === 'geojson' ? 'Traccia GeoJSON trovata'
              : 'Percorso trovato su OpenStreetMap'}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { icon: <Route className="w-4 h-4 text-sky-600" />, label: 'Distanza', val: `${estimated ? '~' : ''}${(resolved.distanceMeters / 1000).toFixed(2)} km` },
              { icon: <TrendingUp className="w-4 h-4 text-sky-600" />, label: 'Dislivello +', val: `${estimated ? '~' : ''}${Math.round(resolved.elevationGain)} m` },
              { icon: <Mountain className="w-4 h-4 text-sky-600" />, label: 'Quota max', val: resolved.altitudeMax ? `${Math.round(resolved.altitudeMax)} m` : '—' },
              { icon: <Clock className="w-4 h-4 text-sky-600" />, label: 'Tempo stimato', val: formatDuration(resolved.estimatedTimeSeconds) },
            ].map(s => (
              <div key={s.label} className="bg-white rounded-xl border border-sky-100 p-3 flex items-center gap-2">
                {s.icon}
                <div>
                  <p className="text-[10px] text-stone-400">{s.label}</p>
                  <p className="text-sm font-semibold text-stone-800">{s.val}</p>
                </div>
              </div>
            ))}
          </div>
          {!resolved.trackPoints?.length && (
            <p className="text-xs text-sky-700 mt-3">Trovata solo la geometria del percorso, senza quota — la guida verrà comunque generata, senza profilo altimetrico.</p>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-stone-200 p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-600 mb-1">Nome del percorso</label>
            <input value={title} onChange={e => setTitle(e.target.value)}
              className="w-full border border-stone-300 rounded-xl px-3 py-2 text-sm text-stone-800 bg-stone-50 outline-none focus:border-sky-400 focus:bg-white" />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-600 mb-1">Data pianificata <span className="font-normal text-stone-400">(opzionale)</span></label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="border border-stone-300 rounded-xl px-3 py-2 text-sm text-stone-700 bg-stone-50 outline-none focus:border-sky-400 focus:bg-white" />
          </div>
        </div>

        {errorMsg && status === 'resolved' && <p className="text-red-500 text-sm">{errorMsg}</p>}

        <div className="flex gap-3">
          <button
            onClick={handleSave}
            disabled={status === 'saving' as Status}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white rounded-xl font-semibold transition-colors"
          >
            {status === 'saving' ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5" />}
            Salva e valuta
          </button>
          <button
            onClick={() => { setStatus('idle'); setResolved(null); setUrl(''); setTitle(''); setDate('') }}
            className="px-5 py-3 bg-white border border-stone-200 hover:border-stone-300 text-stone-600 rounded-xl font-medium transition-colors"
          >
            Annulla
          </button>
        </div>
      </div>
    </div>
  )
}
