'use client'
import { useState, useCallback, useRef, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Navbar from '@/components/Navbar'
import { parseTcx, type TcxActivity } from '@/lib/tcxParser'
import { parseGpxActivity } from '@/lib/gpxActivityParser'
import { saveActivityWithEnrichment } from '@/lib/activitySave'
import { parseGpx } from '@/lib/gpxParser'
import { classifyMarkers } from '@/lib/difficultyMarkers'
import { savePlanned, getAllPlanned, getPlannedById, updatePlannedMeta, type PlannedHike, type PlannedHikeMeta } from '@/lib/plannedStore'
import { getAllActivities, getActivityById, type ActivityMeta } from '@/lib/blobStore'
import { plannedFromActivity } from '@/lib/plannedFromActivity'
import { fetchPoisNearTrack } from '@/lib/poisProxy'
import { fetchWikiForNamedPois } from '@/lib/wikipedia'
import { formatDuration } from '@/lib/tcxParser'
import { computeCtsForHike } from '@/lib/computeCtsForHike'
import { computeSafetyForHike } from '@/lib/computeSafetyForHike'
import { Upload, FileText, CheckCircle, AlertCircle, Mountain, MapPin, Clock, TrendingUp, Route, Link2, Link2Off, Info, PencilLine, History, Loader2 } from 'lucide-react'

async function defaultPendingExpiresAt(): Promise<string> {
  const days = await fetch('/api/user-settings')
    .then(r => r.json())
    .then(d => d.guidePendingDays ?? 30)
    .catch(() => 30)
  return new Date(Date.now() + days * 86400000).toISOString()
}

type ActivityStatus = 'idle' | 'parsing' | 'parsed' | 'analyzing' | 'saving' | 'success' | 'error'
type GpxStatus = 'idle' | 'parsed' | 'saving' | 'success' | 'error'

// ── Activity uploader (TCX / GPX / FIT) ───────────────────────────────────────

function ActivityUploader() {
  const router   = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging,         setDragging]         = useState(false)
  const [status,           setStatus]           = useState<ActivityStatus>('idle')
  const [fileName,         setFileName]         = useState('')
  const [errorMsg,         setErrorMsg]         = useState('')
  const [parsedActivity,   setParsedActivity]   = useState<TcxActivity | null>(null)
  const [titleVal,         setTitleVal]         = useState('')
  const [plannedHikes,     setPlannedHikes]     = useState<PlannedHikeMeta[]>([])
  const [selectedPlanned,  setSelectedPlanned]  = useState<PlannedHikeMeta | null>(null)
  const [linkMode,         setLinkMode]         = useState<'none' | 'link'>('none')

  const processFile = useCallback(async (file: File) => {
    const ext = file.name.toLowerCase().split('.').pop() ?? ''
    if (!['tcx', 'gpx', 'fit'].includes(ext)) {
      setStatus('error'); setErrorMsg('Formato non supportato. Usa file .tcx, .gpx o .fit'); return
    }
    setFileName(file.name); setStatus('parsing')
    try {
      let activity: TcxActivity
      if (ext === 'tcx') {
        activity = parseTcx(await file.text())
      } else if (ext === 'gpx') {
        activity = parseGpxActivity(await file.text())
      } else {
        // FIT: send binary to server
        const res = await fetch('/api/parse-fit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: await file.arrayBuffer(),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Errore nel parsing FIT' }))
          throw new Error(err.error ?? 'Errore nel parsing FIT')
        }
        activity = await res.json()
      }
      setParsedActivity(activity)
      setTitleVal(activity.notes ?? '')
      setStatus('parsed')
      getAllPlanned().then(setPlannedHikes).catch(() => {})
    } catch (e) {
      console.error(e); setStatus('error')
      setErrorMsg(e instanceof Error ? e.message : 'Errore nel caricamento del file.')
    }
  }, [])

  const handleSave = async () => {
    if (!parsedActivity) return
    try {
      // ── Resolve linked planned hike track points ──────────────────
      let linkedPlannedTrackPoints: import('@/lib/tcxParser').TrackPoint[] | undefined
      let linkedPlannedNotes: import('@/lib/blobStore').HikeNote[] | undefined
      if (selectedPlanned) {
        try {
          const full = await getPlannedById(selectedPlanned.id)
          const validPts = (full?.trackPoints ?? []).filter(p => p.lat && p.lon)
          if (validPts.length >= 2) linkedPlannedTrackPoints = validPts
          if (full?.hikeNotes?.length) linkedPlannedNotes = full.hikeNotes
        } catch {}
      }

      setStatus('analyzing')
      setStatus('saving')
      const saved = await saveActivityWithEnrichment(parsedActivity, {
        title: titleVal,
        fileName,
        linkedPlannedId: selectedPlanned?.id,
        linkedPlannedTrackPoints,
        hikeNotes: linkedPlannedNotes,
        deleteLinkedPlanned: !!selectedPlanned,
      })
      setStatus('success')
      setTimeout(() => router.push(`/resoconto/${encodeURIComponent(saved.id)}`), 1200)
    } catch (e) {
      console.error(e); setStatus('error')
      setErrorMsg(`Errore nel salvataggio: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const reset = () => {
    setStatus('idle'); setParsedActivity(null); setTitleVal('')
    setSelectedPlanned(null); setLinkMode('none'); setErrorMsg('')
  }

  // ── Drop zone ──────────────────────────────────────────────────────────────

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
        <input ref={inputRef} type="file" accept=".tcx,.gpx,.fit" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f) }} />
        {status === 'idle' && (<>
          <Upload className="w-12 h-12 text-stone-300 mx-auto mb-4" />
          <p className="text-stone-500 font-medium">Drag & Drop del file qui</p>
          <p className="text-stone-400 text-sm mt-1">
            <span className="font-mono text-stone-600">.tcx</span>
            {' · '}
            <span className="font-mono text-stone-600">.gpx</span>
            {' · '}
            <span className="font-mono text-stone-600">.fit</span>
            {' · oppure clicca per sfogliare'}
          </p>
        </>)}
        {status === 'error' && (
          <div className="flex flex-col items-center gap-3">
            <AlertCircle className="w-12 h-12 text-red-400" />
            <p className="text-red-600 font-semibold">Errore nel caricamento</p>
            <p className="text-red-400 text-sm max-w-xs">{errorMsg}</p>
            <button className="mt-2 px-4 py-2 text-sm bg-white border border-red-200 rounded-lg text-red-500 hover:bg-red-50"
              onClick={e => { e.stopPropagation(); reset() }}>Riprova</button>
          </div>
        )}
      </div>

      {/* Format guide */}
      <div className="mt-4 bg-white rounded-xl border border-stone-200 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Info className="w-4 h-4 text-stone-400 shrink-0" />
          <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide">Formati supportati</p>
        </div>
        <div className="space-y-2">
          {[
            { ext: 'TCX', color: 'text-forest-700 bg-forest-50 border-forest-200', note: 'Garmin, Wahoo, Coros · Dati completi: tracciato GPS, frequenza cardiaca, calorie, velocità' },
            { ext: 'FIT', color: 'text-terra-700 bg-terra-50 border-terra-200', note: 'Garmin (formato nativo) · Dati completi come TCX, spesso più preciso' },
            { ext: 'GPX', color: 'text-sky-700 bg-sky-50 border-sky-200', note: 'Standard universale · Solo tracciato GPS e altimetria — senza FC né calorie' },
          ].map(({ ext, color, note }) => (
            <div key={ext} className="flex items-start gap-2.5">
              <span className={`shrink-0 font-mono text-[11px] font-bold px-1.5 py-0.5 rounded border ${color}`}>{ext}</span>
              <p className="text-xs text-stone-500 leading-relaxed">{note}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )

  if (status === 'parsing') return (
    <div className="drop-zone rounded-2xl p-12 text-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-4 border-forest-200 border-t-forest-600 rounded-full animate-spin" />
        <p className="text-stone-600 font-medium">Analisi in corso…</p>
        <p className="text-stone-400 text-sm font-mono">{fileName}</p>
      </div>
    </div>
  )

  if (status === 'analyzing') return (
    <div className="drop-zone rounded-2xl p-12 text-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-4 border-forest-200 border-t-forest-600 rounded-full animate-spin" />
        <p className="text-stone-600 font-medium">Analisi percorso…</p>
        <p className="text-stone-400 text-xs">Calcolo Comfort TrailScore</p>
      </div>
    </div>
  )

  if (status === 'saving') return (
    <div className="drop-zone rounded-2xl p-12 text-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-4 border-forest-200 border-t-forest-600 rounded-full animate-spin" />
        <p className="text-stone-600 font-medium">Salvataggio…</p>
      </div>
    </div>
  )

  if (status === 'success') return (
    <div className="drop-zone rounded-2xl p-12 text-center border-forest-400 bg-forest-50">
      <CheckCircle className="w-12 h-12 text-forest-500 mx-auto mb-3" />
      <p className="text-forest-700 font-semibold text-lg">Escursione salvata!</p>
      <p className="text-stone-400 text-xs mt-1">Redirect al dettaglio…</p>
    </div>
  )

  // status === 'parsed' — conferma + associazione
  if (!parsedActivity) return null
  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="bg-forest-50 border border-forest-200 rounded-2xl p-5">
        <p className="text-xs font-semibold text-forest-600 uppercase tracking-wider mb-3">{fileName}</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { icon: <Route className="w-4 h-4 text-forest-600" />,     label: 'Distanza',    val: `${(parsedActivity.distanceMeters/1000).toFixed(2)} km` },
            { icon: <TrendingUp className="w-4 h-4 text-forest-600" />, label: 'Dislivello +',val: `${Math.round(parsedActivity.elevationGain)} m` },
            { icon: <Mountain className="w-4 h-4 text-forest-600" />,   label: 'Quota max',   val: `${Math.round(parsedActivity.altitudeMax)} m` },
            { icon: <Clock className="w-4 h-4 text-forest-600" />,      label: 'Durata',      val: formatDuration(parsedActivity.totalTimeSeconds) },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl border border-forest-100 p-3 flex items-center gap-2">
              {s.icon}
              <div>
                <p className="text-[10px] text-stone-400">{s.label}</p>
                <p className="text-sm font-semibold text-stone-800">{s.val}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Titolo */}
      <div className="bg-white rounded-2xl border border-stone-200 p-5">
        <label className="block text-sm font-medium text-stone-600 mb-1">Nome dell&#39;escursione</label>
        <input
          value={titleVal}
          onChange={e => setTitleVal(e.target.value)}
          className="w-full border border-stone-300 rounded-xl px-3 py-2 text-sm text-stone-800 bg-stone-50 outline-none focus:border-forest-400 focus:bg-white"
        />
      </div>

      {/* Associazione percorso pianificato */}
      <div className="bg-white rounded-2xl border border-stone-200 p-5">
        <p className="text-sm font-semibold text-stone-700 mb-3">Era un percorso pianificato?</p>
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => { setLinkMode('none'); setSelectedPlanned(null) }}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-medium border transition-all
              ${linkMode === 'none'
                ? 'bg-stone-800 text-white border-stone-800'
                : 'bg-white text-stone-600 border-stone-200 hover:border-stone-400'}`}
          >
            <Link2Off className="w-4 h-4" /> No, nuova escursione
          </button>
          <button
            onClick={() => setLinkMode('link')}
            disabled={plannedHikes.length === 0}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-medium border transition-all
              ${linkMode === 'link'
                ? 'bg-sky-600 text-white border-sky-600'
                : 'bg-white text-sky-700 border-sky-300 hover:border-sky-500 disabled:opacity-40'}`}
          >
            <Link2 className="w-4 h-4" /> Sì, collega pianificazione
          </button>
        </div>

        {linkMode === 'link' && (
          <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
            {plannedHikes.length === 0 && (
              <p className="text-sm text-stone-400 italic text-center py-4">Nessun percorso pianificato trovato</p>
            )}
            {plannedHikes.map(h => (
              <button
                key={h.id}
                onClick={() => { setSelectedPlanned(h); setTitleVal(h.title) }}
                className={`w-full text-left px-3 py-2.5 rounded-xl border text-sm transition-all
                  ${selectedPlanned?.id === h.id
                    ? 'border-sky-400 bg-sky-50 shadow-sm'
                    : 'border-stone-200 bg-stone-50 hover:border-sky-300'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-stone-800 truncate">{h.title}</span>
                  {h.plannedDate && (
                    <span className="text-[10px] text-stone-400 shrink-0">
                      {new Date(h.plannedDate).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })}
                    </span>
                  )}
                </div>
                <div className="flex gap-3 text-[10px] text-stone-400 mt-0.5">
                  <span>{(h.distanceMeters/1000).toFixed(1)} km</span>
                  <span>{Math.round(h.elevationGain)} m D+</span>
                </div>
              </button>
            ))}
          </div>
        )}

        {selectedPlanned && (
          <p className="mt-3 text-xs text-sky-700 bg-sky-50 rounded-lg px-3 py-2">
            Il percorso pianificato <strong>«{selectedPlanned.title}»</strong> verrà eliminato dalla lista programma dopo il salvataggio.
          </p>
        )}
      </div>

      <div className="flex gap-3">
        <button
          onClick={handleSave}
          disabled={linkMode === 'link' && !selectedPlanned}
          className="flex-1 flex items-center justify-center gap-2 py-3 bg-forest-600 hover:bg-forest-700 text-white rounded-xl font-semibold transition-colors disabled:opacity-40"
        >
          <CheckCircle className="w-5 h-5" /> Salva escursione
        </button>
        <button onClick={reset}
          className="px-5 py-3 bg-white border border-stone-200 hover:border-stone-300 text-stone-600 rounded-xl font-medium transition-colors">
          Annulla
        </button>
      </div>
    </div>
  )
}

// ── GPX tab ───────────────────────────────────────────────────────────────────

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

function GpxUploader() {
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
      const pendingDays = await fetch('/api/user-settings')
        .then(r => r.json())
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

// ── Manuale (senza file) ──────────────────────────────────────────────────────

function ManualPlanUploader() {
  const router = useRouter()
  const [title,     setTitle]     = useState('')
  const [distanceKm, setDistanceKm] = useState('')
  const [elevGain,  setElevGain]  = useState('')
  const [durationH, setDurationH] = useState('')
  const [durationM, setDurationM] = useState('')
  const [date,      setDate]      = useState('')
  const [saving,    setSaving]    = useState(false)
  const [errorMsg,  setErrorMsg]  = useState('')

  const valid = title.trim().length > 0 && parseFloat(distanceKm) > 0

  const handleSave = async () => {
    if (!valid) return
    setSaving(true); setErrorMsg('')
    try {
      const pendingExpiresAt = await defaultPendingExpiresAt()
      const hike: PlannedHike = {
        id: 'manual_' + Date.now().toString(36),
        title: title.trim(),
        plannedDate: date || undefined,
        createdAt: new Date().toISOString(),
        distanceMeters: parseFloat(distanceKm) * 1000,
        elevationGain: parseFloat(elevGain) || 0,
        elevationLoss: 0,
        altitudeMax: 0,
        altitudeMin: 0,
        estimatedTimeSeconds: (parseInt(durationH) || 0) * 3600 + (parseInt(durationM) || 0) * 60,
        pendingExpiresAt,
      }
      await savePlanned(hike)
      router.push(`/guida/${encodeURIComponent(hike.id)}`)
    } catch (e) {
      setErrorMsg(`Errore nel salvataggio: ${e instanceof Error ? e.message : String(e)}`)
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-stone-200 p-5 space-y-4">
      <div>
        <label className="block text-sm font-medium text-stone-600 mb-1">Nome del percorso</label>
        <input value={title} onChange={e => setTitle(e.target.value)}
          placeholder="es. Anello del Monte Amiata"
          className="w-full border border-stone-300 rounded-xl px-3 py-2 text-sm text-stone-800 bg-stone-50 outline-none focus:border-sky-400 focus:bg-white" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-stone-600 mb-1">Distanza (km)</label>
          <input value={distanceKm} onChange={e => setDistanceKm(e.target.value)} type="number" min="0" step="0.1"
            className="w-full border border-stone-300 rounded-xl px-3 py-2 text-sm text-stone-800 bg-stone-50 outline-none focus:border-sky-400 focus:bg-white" />
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-600 mb-1">Dislivello + (m)</label>
          <input value={elevGain} onChange={e => setElevGain(e.target.value)} type="number" min="0"
            className="w-full border border-stone-300 rounded-xl px-3 py-2 text-sm text-stone-800 bg-stone-50 outline-none focus:border-sky-400 focus:bg-white" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-stone-600 mb-1">Durata stimata</label>
          <div className="flex gap-2">
            <input value={durationH} onChange={e => setDurationH(e.target.value)} type="number" min="0" placeholder="h"
              className="w-full border border-stone-300 rounded-xl px-3 py-2 text-sm text-stone-800 bg-stone-50 outline-none focus:border-sky-400 focus:bg-white" />
            <input value={durationM} onChange={e => setDurationM(e.target.value)} type="number" min="0" max="59" placeholder="min"
              className="w-full border border-stone-300 rounded-xl px-3 py-2 text-sm text-stone-800 bg-stone-50 outline-none focus:border-sky-400 focus:bg-white" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-600 mb-1">
            Data <span className="font-normal text-stone-400">(opzionale)</span>
          </label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="w-full border border-stone-300 rounded-xl px-3 py-2 text-sm text-stone-700 bg-stone-50 outline-none focus:border-sky-400 focus:bg-white" />
        </div>
      </div>
      {errorMsg && <p className="text-red-500 text-sm">{errorMsg}</p>}
      <button onClick={handleSave} disabled={!valid || saving}
        className="w-full flex items-center justify-center gap-2 py-3 bg-sky-600 hover:bg-sky-700 disabled:opacity-40 text-white rounded-xl font-semibold transition-colors">
        {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5" />} Crea guida
      </button>
      <p className="text-xs text-stone-400">
        Senza traccia GPS la guida non avrà mappa o profilo altimetrico, ma verrà comunque generata.
      </p>
    </div>
  )
}

// ── Da diario esistente (clona un'attività conclusa) ──────────────────────────

function FromActivityUploader() {
  const router = useRouter()
  const [activities, setActivities] = useState<ActivityMeta[] | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [saving,      setSaving]     = useState(false)
  const [errorMsg,    setErrorMsg]   = useState('')

  useEffect(() => { getAllActivities().then(setActivities).catch(() => setActivities([])) }, [])

  const handleSave = async () => {
    if (!selectedId) return
    setSaving(true); setErrorMsg('')
    try {
      const activity = await getActivityById(selectedId)
      if (!activity) throw new Error('Attività non trovata')
      const pendingExpiresAt = await defaultPendingExpiresAt()
      const hike = plannedFromActivity(activity, pendingExpiresAt)
      await savePlanned(hike)
      router.push(`/guida/${encodeURIComponent(hike.id)}`)
    } catch (e) {
      setErrorMsg(`Errore nel salvataggio: ${e instanceof Error ? e.message : String(e)}`)
      setSaving(false)
    }
  }

  if (activities === null) return (
    <div className="flex items-center justify-center py-12 text-stone-400 gap-2">
      <Loader2 className="w-5 h-5 animate-spin" /> Caricamento resoconti…
    </div>
  )

  if (activities.length === 0) return (
    <p className="text-sm text-stone-400 text-center py-12">
      Non hai ancora resoconti conclusi da cui ripartire.
    </p>
  )

  return (
    <div className="space-y-3">
      <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
        {activities.map(a => (
          <button
            key={a.id}
            onClick={() => setSelectedId(a.id)}
            className={`w-full text-left px-3 py-2.5 rounded-xl border text-sm transition-all
              ${selectedId === a.id ? 'border-sky-400 bg-sky-50 shadow-sm' : 'border-stone-200 bg-white hover:border-sky-300'}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-stone-800 truncate">{a.title ?? 'Escursione'}</span>
              <span className="text-[10px] text-stone-400 shrink-0">
                {new Date(a.startTime).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })}
              </span>
            </div>
            <div className="flex gap-3 text-[10px] text-stone-400 mt-0.5">
              <span>{(a.distanceMeters / 1000).toFixed(1)} km</span>
              <span>{Math.round(a.elevationGain)} m D+</span>
            </div>
          </button>
        ))}
      </div>
      {errorMsg && <p className="text-red-500 text-sm">{errorMsg}</p>}
      <button onClick={handleSave} disabled={!selectedId || saving}
        className="w-full flex items-center justify-center gap-2 py-3 bg-sky-600 hover:bg-sky-700 disabled:opacity-40 text-white rounded-xl font-semibold transition-colors">
        {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5" />} Rifai questo percorso
      </button>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function UploadPage() {
  return (
    <Suspense fallback={null}>
      <UploadPageInner />
    </Suspense>
  )
}

function UploadPageInner() {
  const searchParams = useSearchParams()
  const [tab, setTab] = useState<'activity' | 'gpx'>(
    searchParams.get('tab') === 'gpx' ? 'gpx' : 'activity',
  )
  const [gpxSource, setGpxSource] = useState<'file' | 'manual' | 'from-activity'>('file')

  return (
    <div className="min-h-screen bg-stone-50 pb-20 md:pb-0">
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 py-8 sm:py-12 fade-up">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-forest-50 border border-forest-200 mb-4">
            <Mountain className="w-8 h-8 text-forest-600" />
          </div>
          <h1 className="font-display text-3xl font-semibold text-stone-800 mb-2">
            {tab === 'activity' ? 'Carica un resoconto' : 'Importa un percorso per la Guida'}
          </h1>
          <p className="text-stone-500 text-sm">
            {tab === 'activity'
              ? 'Un\'escursione già conclusa, dal tuo GPS o orologio sportivo'
              : 'Un percorso trovato altrove, da trasformare in guida turistica'
            }
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex bg-stone-100 rounded-xl p-1 mb-6">
          <button
            onClick={() => setTab('gpx')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all
              ${tab === 'gpx' ? 'bg-white text-sky-700 shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}
          >
            <MapPin className="w-4 h-4" /> Per la Guida
          </button>
          <button
            onClick={() => setTab('activity')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all
              ${tab === 'activity' ? 'bg-white text-forest-700 shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}
          >
            <Upload className="w-4 h-4" /> Per il Resoconto
          </button>
        </div>

        {tab === 'gpx' && (
          <div className="flex bg-stone-100 rounded-xl p-1 mb-6 text-xs">
            <button
              onClick={() => setGpxSource('file')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg font-medium transition-all
                ${gpxSource === 'file' ? 'bg-white text-sky-700 shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}
            >
              <MapPin className="w-3.5 h-3.5" /> File GPX
            </button>
            <button
              onClick={() => setGpxSource('manual')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg font-medium transition-all
                ${gpxSource === 'manual' ? 'bg-white text-sky-700 shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}
            >
              <PencilLine className="w-3.5 h-3.5" /> Manuale
            </button>
            <button
              onClick={() => setGpxSource('from-activity')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg font-medium transition-all
                ${gpxSource === 'from-activity' ? 'bg-white text-sky-700 shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}
            >
              <History className="w-3.5 h-3.5" /> Da diario esistente
            </button>
          </div>
        )}

        {tab === 'activity' && <ActivityUploader />}
        {tab === 'gpx' && gpxSource === 'file' && <GpxUploader />}
        {tab === 'gpx' && gpxSource === 'manual' && <ManualPlanUploader />}
        {tab === 'gpx' && gpxSource === 'from-activity' && <FromActivityUploader />}
      </main>
    </div>
  )
}
