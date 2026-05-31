'use client'
import { useEffect, useRef, useState } from 'react'
import Navbar from '@/components/Navbar'
import { getProfile, saveProfile } from '@/lib/userProfile'
import { User, Camera, Check, Trash2 } from 'lucide-react'

export default function ProfiloPage() {
  const [faceUrl,  setFaceUrl]  = useState<string | null>(null)
  const [name,     setName]     = useState('')
  const [saved,    setSaved]    = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const p = getProfile()
    setFaceUrl(p.hikerFaceDataUrl ?? null)
    setName(p.displayName ?? '')
  }, [])

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const url = ev.target?.result as string
      // Square-crop via canvas
      const img = new Image()
      img.onload = () => {
        const size = Math.min(img.width, img.height)
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = 256
        const ctx = canvas.getContext('2d')!
        ctx.beginPath()
        ctx.arc(128, 128, 128, 0, Math.PI * 2)
        ctx.clip()
        ctx.drawImage(img,
          (img.width - size) / 2, (img.height - size) / 2, size, size,
          0, 0, 256, 256)
        const cropped = canvas.toDataURL('image/jpeg', 0.85)
        setFaceUrl(cropped)
        setSaved(false)
      }
      img.src = url
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  function handleSave() {
    saveProfile({ hikerFaceDataUrl: faceUrl ?? undefined, displayName: name || undefined })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function handleRemoveFace() {
    setFaceUrl(null)
    setSaved(false)
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <Navbar />
      <div className="max-w-lg mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold text-stone-900 mb-1">Profilo</h1>
        <p className="text-stone-400 text-sm mb-8">
          La tua faccia appare sull'avatar dell'escursionista nei video 3D.
        </p>

        {/* Face upload */}
        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6 mb-4">
          <p className="text-sm font-semibold text-stone-700 mb-4">Foto del volto (avatar escursionista)</p>
          <div className="flex items-center gap-6">
            <div className="relative shrink-0">
              <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-amber-100 bg-stone-100 flex items-center justify-center">
                {faceUrl
                  ? <img src={faceUrl} alt="Volto" className="w-full h-full object-cover" />
                  : <User className="w-10 h-10 text-stone-300" />
                }
              </div>
              <button
                onClick={() => inputRef.current?.click()}
                className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-amber-500 hover:bg-amber-600 flex items-center justify-center text-white shadow-md transition-colors"
              >
                <Camera className="w-4 h-4" />
              </button>
              <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
            </div>

            <div className="flex-1">
              <p className="text-sm text-stone-600 leading-relaxed">
                Carica una foto frontale del tuo volto. Verrà ritagliata circolare e
                applicata sull'escursionista nei video 3D della mappa.
              </p>
              {faceUrl && (
                <button
                  onClick={handleRemoveFace}
                  className="mt-3 flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Rimuovi foto
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Display name */}
        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6 mb-6">
          <label className="block text-sm font-semibold text-stone-700 mb-3">
            Nome da visualizzare nei video
          </label>
          <input
            type="text"
            value={name}
            onChange={e => { setName(e.target.value); setSaved(false) }}
            placeholder="es. Marco 🏔️"
            className="w-full px-4 py-2.5 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 text-stone-800"
          />
        </div>

        <button
          onClick={handleSave}
          className={`w-full py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${
            saved
              ? 'bg-green-500 text-white'
              : 'bg-amber-500 hover:bg-amber-600 text-white shadow-md'
          }`}
        >
          {saved ? <><Check className="w-4 h-4" /> Salvato!</> : 'Salva profilo'}
        </button>
      </div>
    </div>
  )
}
