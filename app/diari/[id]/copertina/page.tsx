'use client'
// Copertina del Diario — pagina dedicata (Fase 13 di docs/diario-a-libro-piano.md), separata da
// /pubblica. Prima "Personalizza copertina" (scaffale e drawer) apriva /pubblica, che è l'intera
// console di pubblicazione del libro (esportazione PDF, condivisione, statistiche, escursioni
// escluse…) — corretto per "ogni aspetto della copertina è modificabile lì", ma sproporzionato
// per chi vuole solo cambiare una foto o un titolo: l'utente ha chiesto esplicitamente una pagina
// a sé. Stessa fonte dati di /pubblica (nessuna duplicazione di logica di salvataggio): GET/PATCH
// /api/diaries/[id]/config, che legge/scrive le stesse colonne di `diaries`
// (title/subtitle/author/cover_url) — un cambiamento qui è quindi visibile ovunque (scaffale,
// drawer, Sommario, e la copertina stampabile di /pubblica) senza bisogno di sincronizzare nulla.
import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Navbar, { MOBILE_TOPBAR_SPACER } from '@/components/Navbar'
import { DiarioCoverThumb } from '@/components/diario/DiarioCoverThumb'
import { uploadDiaryCover } from '@/lib/diaryCoverUpload'
import { getBrowserSupabase } from '@/lib/supabaseBrowser'
import { normalizeDiaryConfig, DEFAULT_DIARY_CONFIG, type DiaryConfig } from '@/lib/diaryConfig'
import { ArrowLeft, ImageIcon, Loader2, Trash2 } from 'lucide-react'

const PREVIEW_W = 220

export default function DiarioCopertinaPage() {
  const params = useParams<{ id: string }>()
  const diaryId = params.id

  const [config, setConfig] = useState<DiaryConfig>(DEFAULT_DIARY_CONFIG)
  const [loaded, setLoaded] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    fetch(`/api/diaries/${encodeURIComponent(diaryId)}/config`)
      .then(r => r.ok ? r.json() : DEFAULT_DIARY_CONFIG)
      .then(dc => { setConfig(normalizeDiaryConfig(dc)); setLoaded(true) })
      .catch(() => setLoaded(true))
  }, [diaryId])

  // Salvataggio con debounce — stesso contratto "corpo sempre completo" di /pubblica: il body
  // porta l'intera DiaryConfig, non solo i campi toccati qui, così le impostazioni di
  // pubblicazione (statistiche, esclusioni…) non vengono mai perse da questa pagina più leggera.
  useEffect(() => {
    if (!loaded) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      fetch(`/api/diaries/${encodeURIComponent(diaryId)}/config`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(config),
      }).catch(() => { /* riprovato al prossimo cambiamento */ })
    }, 800)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [config, loaded, diaryId])

  async function handleUpload(file: File) {
    setUploading(true); setError(null)
    try {
      const supabase = getBrowserSupabase()
      await supabase.auth.getSession()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Non autenticato')
      const url = await uploadDiaryCover(user.id, file, diaryId)
      setConfig(c => ({ ...c, coverUrl: url }))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className={`min-h-screen bg-stone-100 ${MOBILE_TOPBAR_SPACER}`}>
      <Navbar />
      <div className="max-w-[720px] mx-auto px-4 py-6 sm:py-10">
        <Link
          href={`/diari/${encodeURIComponent(diaryId)}`}
          className="inline-flex items-center gap-1.5 text-stone-500 hover:text-stone-700 text-sm mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Torna al Diario
        </Link>

        <h1 className="font-display text-2xl font-bold text-stone-800 mb-1">Copertina del Diario</h1>
        <p className="text-stone-500 text-sm mb-8 max-w-md">
          Foto, titolo, sottotitolo e autore — usati sulla copertina stampabile e come immagine del
          Diario in ogni elenco. Senza una foto, resta il verde di default.
        </p>

        {!loaded ? (
          <div className="flex items-center justify-center py-24 text-stone-400 gap-3">
            <Loader2 className="w-6 h-6 animate-spin" /><span>Caricamento…</span>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row gap-8 items-start">
            <div className="shrink-0 mx-auto sm:mx-0" style={{ width: PREVIEW_W }}>
              <DiarioCoverThumb
                coverUrl={config.coverUrl}
                width={PREVIEW_W}
                title={config.title}
                subtitle={config.subtitle}
                author={config.author}
                className="rounded-lg shadow-lg"
              />

              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="w-full mt-3 flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-forest-600 hover:bg-forest-700 text-white text-sm font-medium transition-colors disabled:opacity-60"
              >
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
                Cambia foto
              </button>
              <input
                ref={fileRef} type="file" accept="image/*" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) { handleUpload(f); e.target.value = '' } }}
              />
              {config.coverUrl && (
                <button
                  type="button"
                  onClick={() => setConfig(c => ({ ...c, coverUrl: null }))}
                  className="w-full mt-2 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-stone-500 hover:text-red-600 hover:bg-red-50 text-xs transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Rimuovi foto (torna al verde di default)
                </button>
              )}
              {error && <p className="text-red-600 text-xs mt-2">{error}</p>}
            </div>

            <div className="flex-1 min-w-0 w-full space-y-4">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-widest text-stone-400 mb-1">Titolo</label>
                <input
                  value={config.title}
                  onChange={e => setConfig(c => ({ ...c, title: e.target.value }))}
                  className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-forest-400"
                  placeholder="DIARIO di VIAGGIO"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-widest text-stone-400 mb-1">Sottotitolo</label>
                <input
                  value={config.subtitle}
                  onChange={e => setConfig(c => ({ ...c, subtitle: e.target.value }))}
                  className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-forest-400"
                  placeholder="I miei percorsi"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-widest text-stone-400 mb-1">Autore</label>
                <input
                  value={config.author}
                  onChange={e => setConfig(c => ({ ...c, author: e.target.value }))}
                  className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-forest-400"
                  placeholder="Nome Cognome"
                />
              </div>
              <p className="text-[11px] text-stone-400 pt-2">
                Statistiche, escursioni escluse ed esportazione PDF restano su{' '}
                <Link href={`/diari/${encodeURIComponent(diaryId)}/pubblica`} className="underline hover:text-stone-600">
                  Pubblica il Diario
                </Link>.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
