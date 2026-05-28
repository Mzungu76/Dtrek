'use client'
import { useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
import { parseTcx, type TcxActivity } from '@/lib/tcxParser'
import { saveActivity } from '@/lib/blobStore'
import { parseGpx } from '@/lib/gpxParser'
import { savePlanned, deletePlanned, getAllPlanned, type PlannedHike, type PlannedHikeMeta } from '@/lib/plannedStore'
import { formatDuration } from '@/lib/tcxParser'
import { Upload, FileText, CheckCircle, AlertCircle, Mountain, MapPin, Clock, TrendingUp, Route, Link2, Link2Off } from 'lucide-react'

type TcxStatus = 'idle' | 'parsing' | 'parsed' | 'saving' | 'success' | 'error'
type GpxStatus = 'idle' | 'parsed' | 'saving' | 'success' | 'error'

// ── TCX tab ───────────────────────────────────────────────────────────────────

function TcxUploader() {
  const router   = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging,         setDragging]         = useState(false)
  const [status,           setStatus]           = useState<TcxStatus>('idle')
  const [fileName,         setFileName]         = useState('')
  const [errorMsg,         setErrorMsg]         = useState('')
  const [parsedActivity,   setParsedActivity]   = useState<TcxActivity | null>(null)
  const [titleVal,         setTitleVal]         = useState('')
  const [plannedHikes,     setPlannedHikes]     = useState<PlannedHikeMeta[]>([])
  const [selectedPlanned,  setSelectedPlanned]  = useState<PlannedHikeMeta | null>(null)
  const [linkMode,         setLinkMode]         = useState<'none' | 'link'>('none')

  const processFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.tcx')) {
      setStatus('error'); setErrorMsg('Seleziona un file con estensione .tcx'); return
    }
    setFileName(file.name); setStatus('parsing')
    try {
      const text     = await file.text()
      const activity = parseTcx(text)
      setParsedActivity(activity)
      setTitleVal(activity.notes ?? '')
      setStatus('parsed')
      // Carica i percorsi pianificati per eventuale associazione
      getAllPlanned().then(setPlannedHikes).catch(() => {})
    } catch (e) {
      console.error(e); setStatus('error')
      setErrorMsg('Errore nel caricamento. Verificate che il file TCX sia valido.')
    }
  }, [])

  const handleSave = async () => {
    if (!parsedActivity) return
    setStatus('saving')
    try {
      await saveActivity({
        ...parsedActivity,
        title:             titleVal.trim() || undefined,
        fileName,
        linkedPlannedId:   selectedPlanned?.id,
        linkedBeautyScore: selectedPlanned?.cachedBeautyScore,
      })
      // Elimina il percorso pianificato se associato
      if (selectedPlanned) {
        await deletePlanned(selectedPlanned.id).catch(() => {})
      }
      setStatus('success')
      setTimeout(() => router.push(`/escursione/${encodeURIComponent(parsedActivity.id)}`), 1200)
    } catch (e) {
      console.error(e); setStatus('error')
      setErrorMsg('Errore nel salvataggio. Verificate che Vercel Blob sia configurato.')
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
        <input ref={inputRef} type="file" accept=".tcx" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f) }} />
        {status === 'idle' && (<>
          <Upload className="w-12 h-12 text-stone-300 mx-auto mb-4" />
          <p className="text-stone-500 font-medium">Drag & Drop del file TCX qui</p>
          <p className="text-stone-400 text-sm mt-1">oppure clicca per sfogliare</p>
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
      <div className="mt-6 bg-white rounded-xl border border-stone-200 p-5">
        <div className="flex items-start gap-3">
          <FileText className="w-5 h-5 text-terra-500 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-stone-700 text-sm mb-1">Archiviazione su Vercel Blob</p>
            <ul className="text-stone-500 text-sm space-y-0.5 list-disc list-inside">
              <li>Il file viene analizzato nel browser</li>
              <li>I dati vengono salvati permanentemente su Vercel Blob</li>
              <li>Tracciato GPS, FC, velocità, altimetria completi</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )

  if (status === 'parsing') return (
    <div className="drop-zone rounded-2xl p-12 text-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-4 border-forest-200 border-t-forest-600 rounded-full animate-spin" />
        <p className="text-stone-600 font-medium">Analisi file TCX…</p>
        <p className="text-stone-400 text-sm font-mono">{fileName}</p>
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
                onClick={() => setSelectedPlanned(h)}
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
                  {h.cachedBeautyScore && (
                    <span style={{ color: h.cachedBeautyScore.color }} className="font-semibold">
                      ✦ {h.cachedBeautyScore.overall.toFixed(1)}
                    </span>
                  )}
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
      const hike: PlannedHike = {
        ...parsed,
        title:        title.trim() || parsed.title,
        plannedDate:  date || undefined,
        fileName:     fileName,
        createdAt:    new Date().toISOString(),
      }
      await savePlanned(hike)
      setStatus('success')
      setTimeout(() => router.push(`/programma/${encodeURIComponent(parsed.id)}`), 1200)
    } catch (e) {
      console.error(e); setStatus('error')
      setErrorMsg('Errore nel salvataggio. Verificate che Vercel Blob sia configurato.')
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

// ── Main page ─────────────────────────────────────────────────────────────────

export default function UploadPage() {
  const [tab, setTab] = useState<'tcx' | 'gpx'>('tcx')

  return (
    <div className="min-h-screen bg-stone-50 pb-20 md:pb-0">
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 py-8 sm:py-12 fade-up">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-forest-50 border border-forest-200 mb-4">
            <Mountain className="w-8 h-8 text-forest-600" />
          </div>
          <h1 className="font-display text-3xl font-semibold text-stone-800 mb-2">
            {tab === 'tcx' ? 'Carica una nuova escursione' : 'Pianifica un\'escursione'}
          </h1>
          <p className="text-stone-500 text-sm">
            {tab === 'tcx'
              ? <>Trascina il tuo file <span className="font-mono font-medium text-stone-700">.tcx</span> oppure clicca per selezionarlo</>
              : <>Trascina il tuo file <span className="font-mono font-medium text-stone-700">.gpx</span> del percorso futuro</>
            }
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex bg-stone-100 rounded-xl p-1 mb-6">
          <button
            onClick={() => setTab('tcx')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all
              ${tab === 'tcx' ? 'bg-white text-forest-700 shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}
          >
            <Upload className="w-4 h-4" /> Registrata (TCX)
          </button>
          <button
            onClick={() => setTab('gpx')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all
              ${tab === 'gpx' ? 'bg-white text-sky-700 shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}
          >
            <MapPin className="w-4 h-4" /> Pianificata (GPX)
          </button>
        </div>

        {tab === 'tcx' ? <TcxUploader /> : <GpxUploader />}
      </main>
    </div>
  )
}
