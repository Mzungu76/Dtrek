'use client'
import { useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
import { parseTcx } from '@/lib/tcxParser'
import { saveActivity } from '@/lib/blobStore'
import { Upload, FileText, CheckCircle, AlertCircle, Mountain } from 'lucide-react'

type Status = 'idle' | 'parsing' | 'saving' | 'success' | 'error'

export default function UploadPage() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [status, setStatus] = useState<Status>('idle')
  const [fileName, setFileName] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  const processFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.tcx')) {
      setStatus('error')
      setErrorMsg('Seleziona un file con estensione .tcx')
      return
    }
    setFileName(file.name)
    setStatus('parsing')
    try {
      const text = await file.text()
      const activity = parseTcx(text)
      setStatus('saving')
      await saveActivity({ ...activity, fileName: file.name })
      setStatus('success')
      setTimeout(() => router.push(`/escursione/${encodeURIComponent(activity.id)}`), 1200)
    } catch (e) {
      console.error(e)
      setStatus('error')
      setErrorMsg('Errore nel caricamento. Verificate che il file TCX sia valido e che Vercel Blob sia configurato.')
    }
  }, [router])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }, [processFile])

  const statusLabels: Record<Status, string> = {
    idle:    '',
    parsing: 'Analisi file TCX…',
    saving:  'Salvataggio su Vercel Blob…',
    success: 'Escursione salvata!',
    error:   '',
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 py-12 fade-up">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-forest-50 border border-forest-200 mb-4">
            <Mountain className="w-8 h-8 text-forest-600" />
          </div>
          <h1 className="font-display text-3xl font-semibold text-stone-800 mb-2">
            Carica una nuova escursione
          </h1>
          <p className="text-stone-500 text-sm">
            Trascina il tuo file <span className="font-mono font-medium text-stone-700">.tcx</span> oppure clicca per selezionarlo
          </p>
        </div>

        <div
          className={`drop-zone rounded-2xl p-12 text-center cursor-pointer select-none transition-all
            ${dragging ? 'active scale-[1.01]' : ''}
            ${status === 'success' ? 'border-forest-400 bg-forest-50' : ''}
            ${status === 'error'   ? 'border-red-300 bg-red-50'     : ''}`}
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => !['parsing','saving','success'].includes(status) && inputRef.current?.click()}
        >
          <input ref={inputRef} type="file" accept=".tcx" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f) }} />

          {status === 'idle' && (
            <>
              <Upload className="w-12 h-12 text-stone-300 mx-auto mb-4" />
              <p className="text-stone-500 font-medium">Drag & Drop del file TCX qui</p>
              <p className="text-stone-400 text-sm mt-1">oppure clicca per sfogliare</p>
            </>
          )}

          {(status === 'parsing' || status === 'saving') && (
            <div className="flex flex-col items-center gap-3">
              <div className="w-10 h-10 border-4 border-forest-200 border-t-forest-600 rounded-full animate-spin" />
              <p className="text-stone-600 font-medium">{statusLabels[status]}</p>
              <p className="text-stone-400 text-sm font-mono">{fileName}</p>
            </div>
          )}

          {status === 'success' && (
            <div className="flex flex-col items-center gap-3">
              <CheckCircle className="w-12 h-12 text-forest-500" />
              <p className="text-forest-700 font-semibold text-lg">Escursione salvata su Blob!</p>
              <p className="text-stone-400 text-sm font-mono">{fileName}</p>
              <p className="text-stone-400 text-xs">Redirect al dettaglio…</p>
            </div>
          )}

          {status === 'error' && (
            <div className="flex flex-col items-center gap-3">
              <AlertCircle className="w-12 h-12 text-red-400" />
              <p className="text-red-600 font-semibold">Errore nel caricamento</p>
              <p className="text-red-400 text-sm max-w-xs">{errorMsg}</p>
              <button
                className="mt-2 px-4 py-2 text-sm bg-white border border-red-200 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
                onClick={e => { e.stopPropagation(); setStatus('idle'); setErrorMsg('') }}
              >
                Riprova
              </button>
            </div>
          )}
        </div>

        <div className="mt-8 bg-white rounded-xl border border-stone-200 p-5">
          <div className="flex items-start gap-3">
            <FileText className="w-5 h-5 text-terra-500 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-stone-700 text-sm mb-1">Archiviazione su Vercel Blob</p>
              <ul className="text-stone-500 text-sm space-y-0.5 list-disc list-inside">
                <li>Il file viene analizzato nel browser</li>
                <li>I dati vengono salvati permanentemente su Vercel Blob</li>
                <li>Accessibili da qualsiasi dispositivo</li>
                <li>Tracciato GPS, FC, velocità, altimetria completi</li>
              </ul>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
