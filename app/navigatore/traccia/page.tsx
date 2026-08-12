'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import RouteThumb from '@/components/RouteThumb'
import FreeTrackSaveDialog from '@/components/navigation/FreeTrackSaveDialog'
import { FreeTrackSession, type FreeTrackStats } from '@/lib/navigation/freeTrackSession'
import { buildActivityFromTrack } from '@/lib/navigation/trackToActivity'
import { saveActivityWithEnrichment } from '@/lib/activitySave'
import { openMainApp } from '@/lib/native/mainAppLinks'
import { haptics } from '@/lib/navigation/haptics'
import type { TcxActivity } from '@/lib/tcxParser'
import { ArrowLeft, Pause, Play, Square, TriangleAlert } from 'lucide-react'

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
  const sessionRef = useRef<FreeTrackSession | null>(null)

  const [phase, setPhase] = useState<'idle' | 'recording' | 'paused' | 'saved'>('idle')
  const [stats, setStats] = useState<FreeTrackStats>({ distanceMeters: 0, durationSeconds: 0, elevationGain: 0, currentSpeedMs: null, pointCount: 0 })
  const [path, setPath] = useState<[number, number][]>([])
  const [gpsWarning, setGpsWarning] = useState<string | null>(null)
  const [pendingActivity, setPendingActivity] = useState<TcxActivity | null>(null)
  const [savedActivityId, setSavedActivityId] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)

  useEffect(() => () => { sessionRef.current?.stop() }, [])

  const handleStart = async () => {
    setStarting(true)
    setGpsWarning(null)
    const session = new FreeTrackSession()
    session.on('stats', setStats)
    session.on('point', (p) => { if (p.lat != null && p.lon != null) setPath((prev) => [...prev, [p.lat!, p.lon!]]) })
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
    router.push('/navigatore')
  }

  const handleSave = async (title: string) => {
    if (!pendingActivity) return
    const saved = await saveActivityWithEnrichment(pendingActivity, { title })
    setSavedActivityId(saved.id)
    setPendingActivity(null)
    setPhase('saved')
  }

  const handleDiscard = () => {
    setPendingActivity(null)
    router.push('/navigatore')
  }

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col">
      <div className="bg-gradient-to-br from-sky-800 to-sky-900 px-5 pt-[calc(env(safe-area-inset-top)+20px)] pb-5 flex items-center gap-3">
        <button onClick={() => router.push('/navigatore')} className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/15 text-white hover:bg-white/25">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="font-display text-lg font-bold text-white">Registra un percorso</h1>
      </div>

      {phase === 'saved' ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-12 gap-4">
          <p className="font-display text-xl font-semibold text-stone-800">Traccia salvata nel Diario</p>
          <p className="text-stone-500 text-sm max-w-xs">
            La trovi nell&apos;app DTrek principale — apri il Diario da lì per vederla, aggiungere foto o note.
          </p>
          <div className="flex flex-col gap-2 w-full max-w-xs mt-2">
            {savedActivityId && (
              <button
                onClick={() => openMainApp(`/resoconto/${encodeURIComponent(savedActivityId)}`)}
                className="w-full py-2.5 rounded-xl bg-sky-600 text-white font-semibold text-sm hover:bg-sky-700"
              >
                Apri nel Diario
              </button>
            )}
            <button onClick={() => router.push('/navigatore')} className="w-full py-2.5 rounded-xl border border-stone-300 text-stone-700 font-semibold text-sm hover:bg-stone-100">
              Torna ai percorsi
            </button>
          </div>
        </div>
      ) : phase === 'idle' ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-12 gap-4">
          <p className="font-display text-xl font-semibold text-stone-800">Nessun percorso pianificato a disposizione?</p>
          <p className="text-stone-500 text-sm max-w-xs">
            Puoi comunque tracciare la tua posizione: registra dove sei passato e, alla fine, la traccia viene salvata come nuova escursione nel Diario.
          </p>
          <button
            onClick={handleStart}
            disabled={starting}
            className="mt-2 px-8 py-3.5 rounded-full bg-forest-500 text-white font-bold text-base shadow-lg hover:bg-forest-600 disabled:opacity-60"
          >
            {starting ? 'Attivazione GPS…' : 'Avvia registrazione'}
          </button>
        </div>
      ) : (
        <div className="flex-1 flex flex-col px-5 py-6 gap-5">
          {gpsWarning && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
              <TriangleAlert className="w-4 h-4 shrink-0" /> {gpsWarning}
            </div>
          )}

          <div className="relative h-[220px] rounded-2xl bg-white border border-stone-200 overflow-hidden">
            {path.length > 1 ? (
              <div className="absolute inset-4">
                <RouteThumb polyline={path} color="#0284c7" strokeWidth={3} />
              </div>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-stone-400 text-sm">In attesa del GPS…</div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-4 rounded-2xl bg-white border border-stone-200 text-center">
              <div className="text-2xl font-bold font-mono text-stone-900">{(stats.distanceMeters / 1000).toFixed(2)} km</div>
              <div className="text-xs text-stone-500">Distanza</div>
            </div>
            <div className="p-4 rounded-2xl bg-white border border-stone-200 text-center">
              <div className="text-2xl font-bold font-mono text-stone-900">{formatClock(stats.durationSeconds)}</div>
              <div className="text-xs text-stone-500">Durata</div>
            </div>
            <div className="p-4 rounded-2xl bg-white border border-stone-200 text-center">
              <div className="text-2xl font-bold font-mono text-stone-900">+{Math.round(stats.elevationGain)} m</div>
              <div className="text-xs text-stone-500">Dislivello</div>
            </div>
            <div className="p-4 rounded-2xl bg-white border border-stone-200 text-center">
              <div className="text-2xl font-bold font-mono text-stone-900">{stats.currentSpeedMs != null ? (stats.currentSpeedMs * 3.6).toFixed(1) : '—'} km/h</div>
              <div className="text-xs text-stone-500">Velocità</div>
            </div>
          </div>

          <div className="mt-auto flex items-center gap-3">
            <button
              onClick={handlePauseResume}
              className="flex-1 py-3.5 rounded-full border border-stone-300 text-stone-700 font-semibold flex items-center justify-center gap-2 hover:bg-stone-100"
            >
              {phase === 'recording' ? <><Pause className="w-4 h-4" /> Pausa</> : <><Play className="w-4 h-4" /> Riprendi</>}
            </button>
            <button
              onClick={handleStop}
              className="flex-1 py-3.5 rounded-full bg-red-600 text-white font-semibold flex items-center justify-center gap-2 hover:bg-red-700"
            >
              <Square className="w-4 h-4" /> Termina
            </button>
          </div>
        </div>
      )}

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
