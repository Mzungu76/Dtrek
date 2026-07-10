'use client'
import { useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { parseGpx } from '@/lib/gpxParser'
import { formatDuration } from '@/lib/tcxParser'
import { classifyMarkers } from '@/lib/difficultyMarkers'
import { savePlanned, type PlannedHike } from '@/lib/plannedStore'
import { fetchPoisNearTrack } from '@/lib/poisProxy'
import { fetchWikiForNamedPois } from '@/lib/wikipedia'
import { computeCtsForHike } from '@/lib/computeCtsForHike'
import { computeSafetyForHike } from '@/lib/computeSafetyForHike'
import { getUserSettingsCached } from '@/lib/sync/userSettingsStore'
import { MapPin, FileText, CheckCircle, AlertCircle, Mountain, Clock, TrendingUp, Route } from 'lucide-react'

type GpxStatus = 'idle' | 'parsed' | 'saving' | 'success' | 'error'

interface ParsedGpxData {
  id:                   string
  title:                string
  distanceMeters:       number
  elevationGain:        number
  elevationLoss:        number
  altitudeMax:          number
  altitudeMin:          number
  estimatedTimeSeconds: number
  trackPoints:          import('@/lib/tcxParser').TrackPoint[]
  difficultyMarkerCandidates: import('@/lib/difficultyMarkers').DifficultyMarkerCandidate[]
}

// ── GPX tab ───────────────────────────────────────────────────────────────────

export default function GpxUploader() {
  const router   = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging,  setDragging]  = useState(false)
  const [status,    setStatus]    = useState<GpxStatus>('idle')
  const [fileName,  setFileName]  = useState('')
  const [errorMsg,  setErrorMsg]  = useState('')
  const [parsed,    setParsed]    = useState<ParsedGpxData | null>(null)
  const [title,     setTitle]     = useState('')
  const [date,      setDate]      = useState('')

  const processFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.gpx')) {
      setStatus('error'); setErrorMsg('Seleziona un file con estensione .gpx'); return
    }
    setFileName(file.name); setStatus('parsing' as GpxStatus)
    try {
      const text  = await file.text()
      const gpx   = parseGpx(text)
      setParsed({ ...gpx })
      setTitle(gpx.title)
      setStatus('parsed')
    } catch (e) {
      console.error(e); setStatus('error')
      setErrorMsg(e instanceof Error ? e.message : 'Errore nella lettura del file GPX')
    }
  }, [])

  const handleSave = async () => {
    if (!parsed) return
    setStatus('saving')
    try {
      const pendingDays = await getUserSettingsCached()
        .then(d => d.guidePendingDays ?? 30)
        .catch(() => 30)

      const hike: PlannedHike = {
        ...parsed,
        title:        title.trim() || parsed.title,
        plannedDate:  date || undefined,
        fileName:     fileName,
        createdAt:    new Date().toISOString(),
        difficultyMarkers: classifyMarkers(parsed.difficultyMarkerCandidates ?? []),
        pendingExpiresAt: new Date(Date.now() + pendingDays * 86400000).toISOString(),
      }

      // Prefetch POIs during save so the detail page shows them immediately.
      // Uses a 7s timeout — if Wikidata is unavailable, saves normally without POIs.
      const gps = (parsed.trackPoints ?? [])
        .filter(p => p.lat && p.lon)
        .map(p => [p.lat!, p.lon!] as [number, number])
      if (gps.length >= 2) {
        try {
          const deadline = new Promise<null>(r => setTimeout(() => r(null), 7000))
          const pois = await Promise.race([fetchPoisNearTrack(gps, 300), deadline])
          if (pois?.length) {
            hike.cachedPois = pois
            const poiWiki = await Promise.race([fetchWikiForNamedPois(pois), deadline])
            if (poiWiki?.length) hike.cachedPoiWiki = poiWiki
          }
        } catch {} // non-blocking — save proceeds regardless
      }

      await savePlanned(hike)

      // Every score gets computed once, right here at import, then persisted — not gated on
      // POIs being found (computeCtsForHike degrades gracefully with an empty POI list) and not
      // deferred to whenever/if the user happens to open the hike. Fire-and-forget: the user is
      // already being routed to the detail page below, these just land in the background.
      computeCtsForHike(hike).catch(() => {})
      computeSafetyForHike(hike).catch(() => {})

      setStatus('success')
      setTimeout(() => router.push(`/guida/${encodeURIComponent(parsed.id)}`), 1200)
    } catch (e) {
      console.error(e); setStatus('error')
      setErrorMsg(`Errore nel salvataggio: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  if (status === 'idle' || status === 'error') return (
    <div>
      <div
        className={`drop-zone rounded-2xl p-12 text-center cursor-pointer select-none transition-all
          ${dragging ? 'active scale-[1.01]' : ''}
          ${status === 'error' ? 'border-red-300 bg-red-50' : ''}`}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) processFile(f) }}
        onClick={() => inputRef.current?.click()}
      >
        <input ref={inputRef} type="file" accept=".gpx" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f) }} />

        {status === 'idle' && (<>
          <MapPin className="w-12 h-12 text-stone-300 mx-auto mb-4" />
          <p className="text-stone-500 font-medium">Drag & Drop del file GPX qui</p>
          <p className="text-stone-400 text-sm mt-1">oppure clicca per sfogliare</p>
        </>)}

        {status === 'error' && (
          <div className="flex flex-col items-center gap-3">
            <AlertCircle className="w-12 h-12 text-red-400" />
            <p className="text-red-600 font-semibold">Errore nel caricamento</p>
            <p className="text-red-400 text-sm max-w-xs">{errorMsg}</p>
            <button className="mt-2 px-4 py-2 text-sm bg-white border border-red-200 rounded-lg text-red-500 hover:bg-red-50"
              onClick={e => { e.stopPropagation(); setStatus('idle'); setErrorMsg('') }}>
              Riprova
            </button>
          </div>
        )}
      </div>
      <div className="mt-6 bg-white rounded-xl border border-stone-200 p-5">
        <div className="flex items-start gap-3">
          <FileText className="w-5 h-5 text-sky-500 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-stone-700 text-sm mb-1">Come funziona</p>
            <ul className="text-stone-500 text-sm space-y-0.5 list-disc list-inside">
              <li>Carica un file GPX del percorso che vuoi fare</li>
              <li>Analisi automatica: distanza, dislivello, quota</li>
              <li>Valutazione personalizzata rispetto al tuo storico</li>
              <li>Visibile nel calendario come escursione pianificata</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )

  if (status === 'parsing' as GpxStatus) return (
    <div className="drop-zone rounded-2xl p-12 text-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-4 border-sky-200 border-t-sky-600 rounded-full animate-spin" />
        <p className="text-stone-600 font-medium">Analisi file GPX…</p>
        <p className="text-stone-400 text-sm font-mono">{fileName}</p>
      </div>
    </div>
  )

  if (status === 'saving') return (
    <div className="drop-zone rounded-2xl p-12 text-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-4 border-sky-200 border-t-sky-600 rounded-full animate-spin" />
        <p className="text-stone-600 font-medium">Salvataggio e valutazione…</p>
      </div>
    </div>
  )

  if (status === 'success') return (
    <div className="drop-zone rounded-2xl p-12 text-center border-sky-400 bg-sky-50">
      <CheckCircle className="w-12 h-12 text-sky-500 mx-auto mb-3" />
      <p className="text-sky-700 font-semibold text-lg">Escursione salvata!</p>
      <p className="text-stone-400 text-xs mt-1">Redirect alla valutazione…</p>
    </div>
  )

  // status === 'parsed' — show quick stats + edit form
  if (!parsed) return null
  return (
    <div className="space-y-4">
      {/* Quick stats */}
      <div className="bg-sky-50 border border-sky-200 rounded-2xl p-5">
        <p className="text-xs font-semibold text-sky-600 uppercase tracking-wider mb-3">{fileName}</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { icon: <Route className="w-4 h-4 text-sky-600" />,     label: 'Distanza',     val: `${(parsed.distanceMeters/1000).toFixed(2)} km` },
            { icon: <TrendingUp className="w-4 h-4 text-sky-600" />, label: 'Dislivello +', val: `${Math.round(parsed.elevationGain)} m` },
            { icon: <Mountain className="w-4 h-4 text-sky-600" />,   label: 'Quota max',    val: `${Math.round(parsed.altitudeMax)} m` },
            { icon: <Clock className="w-4 h-4 text-sky-600" />,      label: 'Tempo stimato',val: formatDuration(parsed.estimatedTimeSeconds) },
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
      </div>

      {/* Edit metadata */}
      <div className="bg-white rounded-2xl border border-stone-200 p-5 space-y-4">
        <div>
          <label className="block text-sm font-medium text-stone-600 mb-1">Nome dell&#39;escursione</label>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="w-full border border-stone-300 rounded-xl px-3 py-2 text-sm text-stone-800 bg-stone-50 outline-none focus:border-sky-400 focus:bg-white"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-600 mb-1">
            Data pianificata <span className="font-normal text-stone-400">(opzionale)</span>
          </label>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="border border-stone-300 rounded-xl px-3 py-2 text-sm text-stone-700 bg-stone-50 outline-none focus:border-sky-400 focus:bg-white"
          />
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={handleSave}
          className="flex-1 flex items-center justify-center gap-2 py-3 bg-sky-600 hover:bg-sky-700 text-white rounded-xl font-semibold transition-colors"
        >
          <CheckCircle className="w-5 h-5" /> Salva e valuta
        </button>
        <button
          onClick={() => { setStatus('idle'); setParsed(null); setTitle(''); setDate('') }}
          className="px-5 py-3 bg-white border border-stone-200 hover:border-stone-300 text-stone-600 rounded-xl font-medium transition-colors"
        >
          Annulla
        </button>
      </div>
    </div>
  )
}
