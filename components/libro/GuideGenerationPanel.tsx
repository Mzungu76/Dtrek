'use client'
// Pannello di generazione/rigenerazione della Guida per la pagina di riepilogo del Percorso
// (Fase 3, vedi docs/diario-a-libro-piano.md — "Decisione aperta"). Scelta fatta con l'utente:
// pannello nuovo e isolato, che chiama /api/guide direttamente con una UI propria (spinner fino al
// completamento) invece di riusare/estrarre la logica a streaming live di GuideReader.tsx
// (generateSections). Il server persiste già lui stesso cached_guide (mergeGuideSection lato
// server, vedi app/api/guide/route.ts) — qui basta rileggere il percorso a fine stream, non c'è
// merge da rifare lato client.
import { useState } from 'react'
import { BookOpen, KeyRound, Loader2 } from 'lucide-react'
import type { PlannedHike } from '@/lib/plannedStore'
import { getPlannedById } from '@/lib/plannedStore'
import { buildGuideDisplaySections } from '@/lib/guida/guideDisplaySections'
import { GUIDE_SECTIONS, type GuideSectionKey, type GuideTextLength, GUIDE_TEXT_LENGTHS, DEFAULT_TEXT_LENGTH } from '@/lib/guideSections'
import { streamFetchText, StreamFetchError } from '@/lib/streamFetchText'
import { extractGuideAiError, type GuideAiError } from '@/lib/guideAiError'
import CreditErrorModal from '@/components/guida/CreditErrorModal'

interface Props {
  hike: PlannedHike
  percorsoId: string
  hasAiAccess: boolean | null
  aiUnavailable: boolean
  trialExpired: boolean
  onHikeUpdate: (patch: Partial<PlannedHike>) => void
}

export default function GuideGenerationPanel({ hike, percorsoId, hasAiAccess, aiUnavailable, trialExpired, onHikeUpdate }: Props) {
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [creditError, setCreditError] = useState<GuideAiError | null>(null)
  const [length, setLength] = useState<GuideTextLength>(DEFAULT_TEXT_LENGTH)

  const displaySections = buildGuideDisplaySections(hike.cachedGuide ?? '')
  const missingKeys = displaySections
    .filter(s => s.guideKey && !s.body?.trim())
    .map(s => s.guideKey as GuideSectionKey)

  const run = async (sections: GuideSectionKey[]) => {
    if (generating || sections.length === 0) return
    setGenerating(true)
    setError(null)
    try {
      const acc = await streamFetchText('/api/guide', {
        hikeId: percorsoId,
        sections,
        sectionLengths: Object.fromEntries(sections.map(k => [k, length])),
        hikeFallback: {
          title: hike.title, plannedDate: hike.plannedDate, userNotes: hike.userNotes, tags: hike.tags,
          distanceMeters: hike.distanceMeters, elevationGain: hike.elevationGain, elevationLoss: hike.elevationLoss,
          altitudeMax: hike.altitudeMax, altitudeMin: hike.altitudeMin, estimatedTimeSeconds: hike.estimatedTimeSeconds,
          routeMode: hike.routeMode, assessment: hike.assessment, cachedPois: hike.cachedPois,
          cachedPoiWiki: hike.cachedPoiWiki, trackPoints: hike.trackPoints,
        },
      })
      const { aiError } = extractGuideAiError(acc)
      if (aiError) { setCreditError(aiError); return }
      const fresh = await getPlannedById(percorsoId)
      if (fresh) onHikeUpdate(fresh)
    } catch (e) {
      if (e instanceof StreamFetchError) {
        setError((e.body as { message?: string })?.message ?? 'Errore durante la generazione.')
      } else {
        setError('Errore di rete. Riprova.')
      }
    } finally {
      setGenerating(false)
    }
  }

  if (hasAiAccess === false && aiUnavailable) {
    return (
      <PanelShell>
        <p className="text-[13px] text-stone-500 leading-relaxed">
          Non riusciamo a verificare la tua chiave AI in questo momento — riprova tra poco.
        </p>
      </PanelShell>
    )
  }

  if (hasAiAccess === false) {
    return (
      <PanelShell icon={<KeyRound className="w-5 h-5 text-terra-500" />}>
        <p className="text-[13px] text-stone-500 leading-relaxed">
          {trialExpired ? 'Il periodo di prova gratuito è terminato — ' : 'Al momento non hai accesso alla generazione AI — '}
          <a href="/prezzi" className="text-terra-600 font-medium underline underline-offset-2">sblocca Dtrek</a> per far scrivere a Giulia la guida di questo percorso.
        </p>
      </PanelShell>
    )
  }

  return (
    <PanelShell icon={<BookOpen className="w-5 h-5 text-terra-500" />}>
      {creditError && <CreditErrorModal message={creditError.message} onClose={() => setCreditError(null)} />}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {GUIDE_TEXT_LENGTHS.map(l => (
          <button
            key={l.key}
            type="button"
            disabled={generating}
            onClick={() => setLength(l.key)}
            className={`px-3 py-1.5 rounded-full text-[12px] font-semibold transition-colors ${
              length === l.key ? 'bg-terra-600 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
            }`}
          >
            {l.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {missingKeys.length > 0 && (
          <button
            type="button"
            disabled={generating}
            onClick={() => run(missingKeys)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-terra-600 text-white text-[13px] font-semibold disabled:opacity-60"
          >
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookOpen className="w-4 h-4" />}
            Genera le sezioni mancanti ({missingKeys.length})
          </button>
        )}
        <button
          type="button"
          disabled={generating}
          onClick={() => run(GUIDE_SECTIONS.map(s => s.key))}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-stone-100 text-stone-700 text-[13px] font-semibold disabled:opacity-60 hover:bg-stone-200"
        >
          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Rigenera tutta la guida
        </button>
      </div>
      {generating && <p className="text-stone-400 text-[12.5px] mt-2">Giulia sta scrivendo…</p>}
      {error && <p className="text-red-600 text-[12.5px] mt-2">{error}</p>}
    </PanelShell>
  )
}

function PanelShell({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-stone-200 px-5 py-4">
      <div className="flex items-start gap-3">
        {icon && <div className="w-9 h-9 rounded-full bg-terra-50 flex items-center justify-center shrink-0">{icon}</div>}
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  )
}
