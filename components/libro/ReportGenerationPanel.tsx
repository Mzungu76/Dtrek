'use client'
// Pannello di generazione/rigenerazione del Reportage (Fase 3, vedi docs/diario-a-libro-piano.md
// — stessa decisione di GuideGenerationPanel.tsx: pannello nuovo e isolato, spinner fino al
// completamento, nessuna anteprima live carattere-per-carattere). A differenza della Guida,
// /api/resoconto genera l'intero testo in un colpo solo (nessuna sezione singola) — qui
// replichiamo solo la chiamata di ReportReader.tsx (generateReport), non la sua UI. Montato sia
// inline in ReportBookPage.tsx (quando il Reportage non ha ancora contenuto, stesso principio del
// pannello per-sezione di GuideGenerationPanel dentro GuideBookPage.tsx) sia dentro
// ReportageToolsDrawer.tsx (rigenerazione in qualsiasi momento, stesso ruolo del pannello "in
// blocco" di GuideGenerationPanel dentro PercorsoToolsDrawer.tsx).
import { useState } from 'react'
import { PenLine, Loader2 } from 'lucide-react'
import type { RoutePhoto } from '@/lib/activityPhotos'
import type { HikeReport } from '@/lib/reportStore'
import { cacheReport } from '@/lib/sync/hikeReportStore'
import { streamFetchText, StreamFetchError } from '@/lib/streamFetchText'

type ResocontoLength = 'breve' | 'media' | 'lunga'
const LENGTHS: { key: ResocontoLength; label: string }[] = [
  { key: 'breve', label: 'Breve' },
  { key: 'media', label: 'Media' },
  { key: 'lunga', label: 'Lunga' },
]

interface Props {
  activityId: string
  activityTitle: string
  hasContent: boolean
  photos: RoutePhoto[]
  onGenerated: (content: string) => void
}

export default function ReportGenerationPanel({ activityId, activityTitle, hasContent, photos, onGenerated }: Props) {
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [length, setLength] = useState<ResocontoLength>('media')

  const handleGenerate = async () => {
    if (generating) return
    setGenerating(true)
    setError(null)
    const photoMeta = photos.map(p => ({ caption: p.caption, lat: p.lat, lon: p.lon, progress: p.progress, hasExifGps: p.hasExifGps, url: p.url }))
    try {
      const full = await streamFetchText('/api/resoconto', { activityId, length, photos: photoMeta })
      const now = new Date().toISOString()
      const generated: HikeReport = {
        id: `report-${activityId}`,
        activity_id: activityId,
        title: activityTitle || 'Escursione',
        content: full,
        photos: photoMeta.map(({ caption, lat, lon, progress }) => ({ caption, lat, lon, progress })),
        authored_by: 'ai',
        sections: null,
        created_at: now,
        updated_at: now,
      }
      await cacheReport(activityId, generated)
      onGenerated(full)
    } catch (e) {
      if (e instanceof StreamFetchError) {
        setError(e.status === 402
          ? 'Aggiungi la tua chiave API Claude nelle impostazioni per usare questa funzione.'
          : (e.body as { message?: string })?.message ?? 'Errore durante la generazione.')
      } else {
        setError('Errore di rete. Riprova.')
      }
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-stone-200 px-5 py-4">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-full bg-forest-50 flex items-center justify-center shrink-0">
          <PenLine className="w-4.5 h-4.5 text-forest-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            {LENGTHS.map(l => (
              <button
                key={l.key}
                type="button"
                disabled={generating}
                onClick={() => setLength(l.key)}
                className={`px-3 py-1.5 rounded-full text-[12px] font-semibold transition-colors ${
                  length === l.key ? 'bg-forest-600 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={generating}
            onClick={handleGenerate}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-forest-600 text-white text-[13px] font-semibold disabled:opacity-60"
          >
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <PenLine className="w-4 h-4" />}
            {hasContent ? 'Rigenera il resoconto' : 'Genera il resoconto'}
          </button>
          {generating && <p className="text-stone-400 text-[12.5px] mt-2">Sto scrivendo il resoconto…</p>}
          {error && <p className="text-red-600 text-[12.5px] mt-2">{error}</p>}
        </div>
      </div>
    </div>
  )
}
