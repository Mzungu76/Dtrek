'use client'
import React, { useCallback, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, UploadCloud, CheckCircle2, Loader2, X } from 'lucide-react'

type Status = 'idle' | 'uploading' | 'done' | 'error'

export default function TransizionePage() {
  const { id }   = useParams() as { id: string }
  const hikeId   = decodeURIComponent(id)
  const router   = useRouter()

  const [status,  setStatus]  = useState<Status>('idle')
  const [dragging, setDragging] = useState(false)
  const [errMsg,  setErrMsg]  = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)

  async function handleFile(file: File) {
    const allowed = ['.gpx', '.fit', '.tcx']
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase()
    if (!allowed.includes(ext)) {
      setErrMsg(`Formato non supportato: ${ext}. Usa GPX, FIT o TCX.`)
      return
    }
    setFileName(file.name)
    setStatus('uploading')
    setErrMsg(null)

    try {
      const body = new FormData()
      body.append('file', file)
      body.append('plannedId', hikeId)

      const res = await fetch('/api/activity', { method: 'POST', body })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? `HTTP ${res.status}`)
      }
      const data = await res.json()
      setStatus('done')
      const actId = data.id ?? data.activityId
      setTimeout(() => router.push(actId ? `/resoconto/${encodeURIComponent(actId)}` : '/diario'), 800)
    } catch (e) {
      setStatus('error')
      setErrMsg(e instanceof Error ? e.message : 'Errore durante il caricamento')
    }
  }

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hikeId])

  async function markDone() {
    setStatus('uploading')
    try {
      const res = await fetch(`/api/activity/${encodeURIComponent(hikeId)}/resoconto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plannedId: hikeId }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json().catch(() => ({}))
      setStatus('done')
      const actId = data.id ?? data.activityId
      setTimeout(() => router.push(actId ? `/resoconto/${encodeURIComponent(actId)}` : '/diario'), 800)
    } catch {
      setStatus('done')
      setTimeout(() => router.push('/diario'), 800)
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(10,20,15,.70)' }}
        onClick={() => router.back()}
      />

      {/* Bottom sheet */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 rounded-t-[24px] overflow-hidden"
        style={{ background: 'white', maxWidth: '480px', margin: '0 auto' }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-stone-200" />
        </div>

        {/* Header */}
        <div className="px-5 pt-2 pb-4 flex items-start justify-between">
          <div>
            <p className="text-[10px] font-bold tracking-[2px] uppercase mb-0.5" style={{ color: '#4a9e5c' }}>
              Pianificazione → Diario
            </p>
            <h2 style={{ fontFamily: "'Lora', serif", fontSize: '20px', fontWeight: 700, color: '#1a3320', margin: 0 }}>
              Segna come fatta
            </h2>
          </div>
          <button
            onClick={() => router.back()}
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: '#F0F7F1' }}
          >
            <X className="w-4 h-4" style={{ color: '#2d5c38' }} />
          </button>
        </div>

        {/* Content */}
        <div className="px-5 pb-8 space-y-3">

          {/* Upload GPS (primary) */}
          {status === 'idle' && (
            <>
              <div
                className="relative rounded-[14px] border-2 transition-colors"
                style={{
                  borderColor: dragging ? '#4a9e5c' : '#d1e8d4',
                  borderStyle: 'dashed',
                  background: dragging ? '#EAF5EC' : '#F0F7F1',
                  padding: '20px 16px',
                }}
                onDragOver={e => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
              >
                <input
                  type="file"
                  accept=".gpx,.fit,.tcx"
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  onChange={onInputChange}
                />
                <div className="flex flex-col items-center text-center gap-2">
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center"
                    style={{ background: '#2d5c38' }}
                  >
                    <UploadCloud className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm" style={{ color: '#1a3320' }}>
                      Carica traccia GPS
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: '#8a7f6e' }}>
                      Trascina o seleziona un file .gpx · .fit · .tcx
                    </p>
                  </div>
                </div>
              </div>

              {errMsg && (
                <p className="text-xs text-red-600 px-1">{errMsg}</p>
              )}

              {/* Divider */}
              <div className="flex items-center gap-3 py-1">
                <div className="flex-1 h-px bg-stone-200" />
                <span className="text-[10px] text-stone-400 font-medium uppercase tracking-wider">oppure</span>
                <div className="flex-1 h-px bg-stone-200" />
              </div>

              {/* Mark done without GPS (secondary) */}
              <button
                onClick={markDone}
                className="w-full py-3 rounded-[14px] text-sm font-semibold transition-colors"
                style={{
                  background: 'transparent',
                  border: '1.5px solid #2d5c38',
                  color: '#2d5c38',
                }}
              >
                Segna come fatta senza traccia GPS
              </button>

              <p className="text-[10px] text-center" style={{ color: '#a9a18e' }}>
                Il diario verrà aggiornato automaticamente
              </p>
            </>
          )}

          {/* Uploading */}
          {status === 'uploading' && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#2d5c38' }} />
              <div className="text-center">
                <p className="font-semibold text-sm" style={{ color: '#1a3320' }}>
                  {fileName ? `Caricamento di ${fileName}…` : 'Elaborazione…'}
                </p>
                <p className="text-xs mt-0.5" style={{ color: '#8a7f6e' }}>ci vorranno alcuni secondi</p>
              </div>
            </div>
          )}

          {/* Done */}
          {(status === 'done') && (
            <div className="flex flex-col items-center gap-3 py-8">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center"
                style={{ background: '#F0F7F1' }}
              >
                <CheckCircle2 className="w-7 h-7" style={{ color: '#4a9e5c' }} />
              </div>
              <div className="text-center">
                <p className="font-semibold text-sm" style={{ color: '#1a3320' }}>Escursione completata!</p>
                <p className="text-xs mt-0.5" style={{ color: '#8a7f6e' }}>Reindirizzamento al resoconto…</p>
              </div>
            </div>
          )}

          {/* Error */}
          {status === 'error' && (
            <div className="space-y-3">
              <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                {errMsg ?? 'Errore durante il caricamento'}
              </p>
              <button
                onClick={() => setStatus('idle')}
                className="w-full py-3 rounded-[14px] text-sm font-semibold"
                style={{ background: '#F0F7F1', color: '#2d5c38' }}
              >
                Riprova
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
