'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import FreeTrackMap, { type FreeTrackMapHandle } from '@/components/navigation/FreeTrackMap'
import FreeTrackSaveDialog from '@/components/navigation/FreeTrackSaveDialog'
import { FreeTrackSession, type FreeTrackStats } from '@/lib/navigation/freeTrackSession'
import { buildActivityFromTrack } from '@/lib/navigation/trackToActivity'
import { saveActivityWithEnrichment } from '@/lib/activitySave'
import { navigatorHomePath, openMainAppOrNavigate } from '@/lib/native/mainAppLinks'
import { haptics } from '@/lib/navigation/haptics'
import type { TcxActivity, TrackPoint } from '@/lib/tcxParser'
import { getNavigatorSlotStatus, type NavigatorSlotStatus } from '@/lib/navigatorSlot'
import { deletePlanned } from '@/lib/plannedStore'
import { deleteActivity, type HikeNote } from '@/lib/blobStore'
import { requestOrientationPermission, isOrientationSupported, needsOrientationPermissionGesture } from '@/lib/navigation/orientation'
import { prefetchTilesAroundPoint } from '@/lib/offline/packageManager'
import { retryFieldNotePhotos } from '@/lib/offline/retryFieldNotePhotos'
import { retryFieldNotePhotoIfOnline } from '@/lib/offline/retryFieldNotePhotoIfOnline'
import FieldNoteSheet from '@/components/navigation/FieldNoteSheet'
import NavigatorAppPromo from '@/components/navigation/NavigatorAppPromo'
import SosButton from '@/components/navigation/SosButton'
import NavBottomStrip from '@/components/navigation/NavBottomStrip'
import FreeTrackStatsSheet from '@/components/navigation/FreeTrackStatsSheet'
import { ArrowLeft, Locate, TriangleAlert, Trash2, NotebookPen } from 'lucide-react'

function formatClock(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`
}

/**
 * Records a GPS track with no planned route — the path a user lands on if
 * they open Navigator before ever planning a hike in the main DTrek app
 * (see docs/navigation-engine-analysis.md §5). Deliberately not a full
 * navigation screen: no map/route/off-route UI, just "start, see your
 * stats live, stop, save it to the Diario".
 */
export default function TracciaPage() {
  const router = useRouter()
  const homePath = navigatorHomePath('/upload?tab=activity')
  const openInMainApp = (path: string) => openMainAppOrNavigate(router, path)
  const sessionRef = useRef<FreeTrackSession | null>(null)
  // Stable id for this recording, purely local — used to namespace field-note photo uploads
  // (lib/fieldNotePhotos.ts) the same way a real hike id would; there is no planned/saved hike id
  // yet while recording is in progress, so this stands in for one.
  const trackSessionIdRef = useRef<string>('')
  const tilesPrefetchedRef = useRef(false)

  const [phase, setPhase] = useState<'idle' | 'recording' | 'paused' | 'saved'>('idle')
  const [stats, setStats] = useState<FreeTrackStats>({ distanceMeters: 0, durationSeconds: 0, elevationGain: 0, currentSpeedMs: null, pointCount: 0 })
  const [path, setPath] = useState<[number, number][]>([])
  const [position, setPosition] = useState<{ lat: number; lon: number } | null>(null)
  const [bearing, setBearing] = useState<number | null>(null)
  const [accuracyM, setAccuracyM] = useState<number | null>(null)
  const [gpsWarning, setGpsWarning] = useState<string | null>(null)
  const [pendingActivity, setPendingActivity] = useState<TcxActivity | null>(null)
  const [savedActivityId, setSavedActivityId] = useState<string | null>(null)
  const [savedOffline, setSavedOffline] = useState(false)
  const [starting, setStarting] = useState(false)
  // undefined = still checking; Navigator's own import/record actions are capped at
  // NAVIGATOR_SLOT_LIMIT at a time (lib/navigatorSlot.ts) — a route planned in the main app
  // doesn't count against this.
  const [slotStatus, setSlotStatus] = useState<NavigatorSlotStatus | undefined>(undefined)
  const [removingSlotId, setRemovingSlotId] = useState<string | null>(null)
  const [hikeNotes, setHikeNotes] = useState<HikeNote[]>([])
  const hikeNotesRef = useRef(hikeNotes)
  useEffect(() => { hikeNotesRef.current = hikeNotes }, [hikeNotes])
  const [showFieldNote, setShowFieldNote] = useState(false)
  const [fieldNoteAutoCamera, setFieldNoteAutoCamera] = useState(false)
  // Soluzione B (piano di restyling Navigator): stesso guscio del percorso pianificato — rotaia
  // destra con SOS/centra, striscia sottile in basso, pannello dettagli a schermo intero.
  const mapHandleRef = useRef<FreeTrackMapHandle | null>(null)
  const [mapFollowMode, setMapFollowMode] = useState(true)
  const [showStatsSheet, setShowStatsSheet] = useState(false)
  // Punti completi (non solo [lat,lon] come `path`) per il grafico altimetrico del pannello
  // dettagli — stesso ElevationProfileChart della navigazione pianificata.
  const [recordedPoints, setRecordedPoints] = useState<TrackPoint[]>([])

  useEffect(() => () => { sessionRef.current?.stop() }, [])

  useEffect(() => {
    getNavigatorSlotStatus().then(setSlotStatus).catch(() => setSlotStatus({ items: [], atLimit: false }))
  }, [])

  // Best-effort retry for any field-note photo that couldn't upload at capture time (offline —
  // see FieldNoteSheet.tsx's fallback) once the connection comes back, same as
  // ActiveNavigationView.tsx's planned-route navigator.
  useEffect(() => {
    const onOnline = () => {
      retryFieldNotePhotos(trackSessionIdRef.current, hikeNotesRef.current).then((changed) => {
        if (changed.length === 0) return
        setHikeNotes((prev) => prev.map((n) => changed.find((c) => c.id === n.id) ?? n))
      }).catch(() => {})
    }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [])

  // Same "only iOS Safari needs an explicit tap" contract as ActiveNavigationView.tsx — everywhere
  // else this silently enables the compass with no visible prompt.
  useEffect(() => {
    if (isOrientationSupported() && !needsOrientationPermissionGesture()) {
      requestOrientationPermission()
    }
  }, [])

  const handleRemoveSlotItem = async (item: { kind: 'planned' | 'activity'; id: string }) => {
    setRemovingSlotId(item.id)
    try {
      if (item.kind === 'planned') await deletePlanned(item.id)
      else await deleteActivity(item.id)
      setSlotStatus((prev) => prev && { items: prev.items.filter((i) => i.id !== item.id), atLimit: false })
    } finally {
      setRemovingSlotId(null)
    }
  }

  const handleStart = async () => {
    if (slotStatus?.atLimit) return // UI already hides the button in this case — defensive guard only
    setStarting(true)
    setGpsWarning(null)
    trackSessionIdRef.current = crypto.randomUUID()
    tilesPrefetchedRef.current = false
    setHikeNotes([])
    setRecordedPoints([])
    const session = new FreeTrackSession()
    session.on('stats', setStats)
    session.on('point', (p) => {
      if (p.lat != null && p.lon != null) setPath((prev) => [...prev, [p.lat!, p.lon!]])
      setRecordedPoints((prev) => [...prev, p])
    })
    // Live marker on the map even while paused (distance/duration freeze, position doesn't) —
    // same behavior as ActiveNavigationView.tsx's planned-route navigator.
    session.on('position', (p) => {
      setPosition({ lat: p.lat, lon: p.lon })
      setAccuracyM(p.accuracyM)
      // Best-effort, fire-once: cache the tiles around the starting point (while there's still
      // likely signal at the trailhead) so the map doesn't go blank later if the hiker loses
      // connectivity mid-recording — see FreeTrackMap.tsx, which otherwise has no offline tiles at
      // all for a route that (by definition here) wasn't planned/downloaded ahead of time.
      if (!tilesPrefetchedRef.current) {
        tilesPrefetchedRef.current = true
        prefetchTilesAroundPoint(p.lat, p.lon).catch(() => {})
      }
    })
    // Bearing now comes from the device compass when available (falls back to GPS-derived heading
    // only once the sensor has gone quiet) — see FreeTrackSession.start()'s doc comment.
    session.on('bearing', ({ bearingDeg }) => setBearing(bearingDeg))
    session.on('gpsLost', ({ permissionDenied }) => {
      setGpsWarning(permissionDenied ? 'Permesso di localizzazione negato — attivalo nelle impostazioni del telefono.' : 'Segnale GPS assente.')
      haptics.alert()
    })
    session.on('gpsRecovered', () => setGpsWarning(null))
    sessionRef.current = session
    await session.start('trekking')
    setStarting(false)
    setPhase('recording')
  }

  const handleSaveFieldNote = (note: HikeNote) => {
    setHikeNotes((prev) => [...prev, note])
    retryFieldNotePhotoIfOnline(trackSessionIdRef.current, note, [note], (changed) => {
      setHikeNotes((prev) => prev.map((n) => changed.find((c) => c.id === n.id) ?? n))
    })
  }

  const handlePauseResume = () => {
    if (!sessionRef.current) return
    if (phase === 'recording') {
      sessionRef.current.pause()
      setPhase('paused')
    } else if (phase === 'paused') {
      sessionRef.current.resume()
      setPhase('recording')
    }
  }

  const handleStop = () => {
    if (!sessionRef.current) return
    const points = sessionRef.current.stop()
    haptics.success()
    if (points.length >= 2) {
      try {
        setPendingActivity(buildActivityFromTrack(points))
        return
      } catch {
        // too little usable data (e.g. all points missing lat/lon) — fall through and just leave the screen
      }
    }
    router.push(homePath)
  }

  const handleSave = async (title: string) => {
    if (!pendingActivity) return
    const saved = await saveActivityWithEnrichment(pendingActivity, {
      title, sourceApp: 'navigator', hikeNotes,
      onSyncResult: (ok) => setSavedOffline(!ok),
    })
    setSavedActivityId(saved.id)
    setPendingActivity(null)
    setPhase('saved')
  }

  const handleDiscard = () => {
    setPendingActivity(null)
    router.push(homePath)
  }

  // Full-screen live map while recording/paused — same tile source, marker and follow behavior as
  // ActiveNavigationView.tsx's planned-route navigator (FreeTrackMap.tsx), so this doesn't read as
  // a stripped-down secondary screen. Kept as its own branch rather than folded into the shared
  // min-h-screen layout below since a full-screen fixed map needs to be the outermost element, the
  // same structural choice ActiveNavigationView.tsx makes.
  if (phase === 'recording' || phase === 'paused') {
    const bottomSummary = `${(stats.distanceMeters / 1000).toFixed(2)} km · ${formatClock(stats.durationSeconds)} · +${Math.round(stats.elevationGain)} m`
    return (
      <div className="fixed inset-0 z-[2000] bg-stone-900">
        <NavigatorAppPromo />
        <FreeTrackMap ref={mapHandleRef} path={path} position={position} bearingDeg={bearing} accuracyM={accuracyM} onFollowModeChange={setMapFollowMode} />

        {/* Soluzione B: stessa colonna in flusso del percorso pianificato — barra a testo nudo
            più l'eventuale avviso GPS sotto, niente offset fissi indipendenti. */}
        <div className="absolute left-3 right-3 z-10 flex flex-col items-center gap-2" style={{ top: 'calc(env(safe-area-inset-top, 0px) + 10px)' }}>
          <div className="w-full flex items-center gap-2">
            <button onClick={() => router.push(homePath)} className="w-9 h-9 rounded-full bg-black/45 backdrop-blur-sm text-white flex items-center justify-center shadow-sm shrink-0">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <h1
              className="flex-1 min-w-0 truncate text-white font-display font-bold text-[15px]"
              style={{ textShadow: '0 1px 3px rgba(0,0,0,0.75), 0 1px 8px rgba(0,0,0,0.5)' }}
            >
              Traccia libera
            </h1>
            <button
              onClick={() => { setFieldNoteAutoCamera(false); setShowFieldNote(true) }}
              className="relative w-9 h-9 rounded-full bg-black/45 backdrop-blur-sm text-white flex items-center justify-center shadow-sm shrink-0"
              aria-label="Aggiungi una nota o una foto"
              title="Nota o foto sul campo"
            >
              <NotebookPen className="w-4 h-4" />
              {hikeNotes.length > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-terra-500 text-[10px] font-bold flex items-center justify-center">{hikeNotes.length}</span>
              )}
            </button>
          </div>

          {gpsWarning && (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-sm shadow-lg max-w-full">
              <TriangleAlert className="w-4 h-4 shrink-0" /> {gpsWarning}
            </div>
          )}
        </div>

        {showFieldNote && (
          <FieldNoteSheet
            position={position}
            onSave={handleSaveFieldNote}
            onClose={() => { setShowFieldNote(false); setFieldNoteAutoCamera(false) }}
            autoOpenCamera={fieldNoteAutoCamera}
          />
        )}

        {/* Soluzione B: rotaia destra centrata verticalmente — SOS e "centra sulla mia
            posizione", stesso trattamento del percorso pianificato (niente rotaia layer a
            sinistra qui: senza un percorso pianificato non c'è nulla da accendere/spegnere). */}
        <div className="absolute right-3 z-10 top-1/2 -translate-y-1/2 flex flex-col items-end gap-2">
          <SosButton
            fix={position ? { lat: position.lat, lon: position.lon, accuracyM } : null}
            liveShareUrl={null}
            onTriggered={() => {}}
          />
          <button
            onClick={() => mapHandleRef.current?.recenter()}
            aria-label="Centra sulla mia posizione"
            className={`w-11 h-11 rounded-full shadow-lg flex items-center justify-center ${
              mapFollowMode ? 'bg-terra-500 text-white' : 'bg-white text-stone-700'
            }`}
          >
            <Locate className="w-5 h-5" />
          </button>
        </div>

        <NavBottomStrip
          summary={bottomSummary}
          timerRunning={phase === 'recording'}
          onTogglePlayPause={handlePauseResume}
          onStop={handleStop}
          onExpand={() => setShowStatsSheet(true)}
        />

        <FreeTrackStatsSheet
          open={showStatsSheet}
          onClose={() => setShowStatsSheet(false)}
          distanceMeters={stats.distanceMeters}
          durationSeconds={stats.durationSeconds}
          elevationGain={stats.elevationGain}
          currentSpeedMs={stats.currentSpeedMs}
          timerRunning={phase === 'recording'}
          onTogglePlayPause={handlePauseResume}
          trackPoints={recordedPoints}
          onOpenFoto={() => { setShowStatsSheet(false); setFieldNoteAutoCamera(true); setShowFieldNote(true) }}
          onOpenNota={() => { setShowStatsSheet(false); setFieldNoteAutoCamera(false); setShowFieldNote(true) }}
        />

        {pendingActivity && (
          <FreeTrackSaveDialog
            activity={pendingActivity}
            defaultTitle={`Traccia del ${new Date().toLocaleDateString('it-IT')}`}
            onSave={handleSave}
            onDiscard={handleDiscard}
          />
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col">
      <NavigatorAppPromo />
      <div className="bg-gradient-to-br from-sky-800 to-sky-900 px-5 pt-[calc(env(safe-area-inset-top)+20px)] pb-5 flex items-center gap-3">
        <button onClick={() => router.push(homePath)} className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/15 text-white hover:bg-white/25">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="font-display text-lg font-bold text-white">Traccia libera</h1>
      </div>

      {phase === 'saved' ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-12 gap-4">
          <p className="font-display text-xl font-semibold text-stone-800">Traccia salvata nel Diario</p>
          <p className="text-stone-500 text-sm max-w-xs">
            La trovi nell&apos;app DTrek principale — apri il Diario da lì per vederla, aggiungere altre foto o note.
          </p>
          {savedOffline && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 max-w-xs">
              Sei offline: la traccia è salvata sul telefono e si sincronizzerà da sola non appena torni online — non serve rifare nulla.
            </p>
          )}
          <div className="flex flex-col gap-2 w-full max-w-xs mt-2">
            {savedActivityId && (
              <button
                onClick={() => openInMainApp(`/resoconto/${encodeURIComponent(savedActivityId)}`)}
                className="w-full py-2.5 rounded-xl bg-sky-600 text-white font-semibold text-sm hover:bg-sky-700"
              >
                Apri nel Diario
              </button>
            )}
            <button onClick={() => router.push(homePath)} className="w-full py-2.5 rounded-xl border border-stone-300 text-stone-700 font-semibold text-sm hover:bg-stone-100">
              Torna ai percorsi
            </button>
          </div>
        </div>
      ) : slotStatus?.atLimit ? (
        // Navigator's own import/record slots (lib/navigatorSlot.ts) are full — a route planned in
        // the main app never triggers this, only something Navigator itself already let the user
        // add. Full-power planning (unlimited routes/recordings) stays in the main app.
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-12 gap-4">
          <p className="font-display text-xl font-semibold text-stone-800">Hai già un percorso in Navigator</p>
          <p className="text-stone-500 text-sm max-w-xs">
            Navigator tiene un solo percorso alla volta. Sovrascrivilo per registrarne uno nuovo, oppure usa l&apos;app DTrek principale per pianificarne quanti vuoi.
          </p>
          <div className="flex flex-col gap-2 w-full max-w-xs mt-2">
            {slotStatus.items.map((item) => (
              <button
                key={item.id}
                onClick={() => handleRemoveSlotItem(item)}
                disabled={removingSlotId === item.id}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 font-semibold text-sm hover:bg-red-100 disabled:opacity-60"
              >
                <Trash2 className="w-4 h-4" /> {removingSlotId === item.id ? 'Sovrascrittura…' : `Sovrascrivi "${item.title}"`}
              </button>
            ))}
            <button
              onClick={() => openInMainApp('/guida')}
              className="w-full py-2.5 rounded-xl bg-sky-600 text-white font-semibold text-sm hover:bg-sky-700"
            >
              Apri DTrek per pianificare
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-12 gap-4">
          <p className="font-display text-xl font-semibold text-stone-800">Nessun percorso pianificato a disposizione?</p>
          <p className="text-stone-500 text-sm max-w-xs">
            Puoi comunque tracciare la tua posizione: registra dove sei passato e, alla fine, la traccia viene salvata come nuova escursione nel Diario.
          </p>
          <button
            onClick={handleStart}
            disabled={starting || slotStatus === undefined}
            className="mt-2 px-8 py-3.5 rounded-full bg-forest-500 text-white font-bold text-base shadow-lg hover:bg-forest-600 disabled:opacity-60"
          >
            {starting ? 'Attivazione GPS…' : 'Avvia registrazione'}
          </button>
        </div>
      )}
    </div>
  )
}
