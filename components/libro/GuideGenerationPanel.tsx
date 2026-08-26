'use client'
// Pannello di generazione/rigenerazione della Guida per la pagina di riepilogo del Percorso
// (Fase 3, vedi docs/diario-a-libro-piano.md — "Decisione aperta"). Scelta fatta con l'utente:
// pannello nuovo e isolato, che chiama /api/guide direttamente con una UI propria (spinner fino al
// completamento) invece di riusare/estrarre la logica a streaming live di GuideReader.tsx
// (generateSections). Il server persiste già lui stesso cached_guide (mergeGuideSection lato
// server, vedi app/api/guide/route.ts) — qui basta rileggere il percorso a fine stream, non c'è
// merge da rifare lato client.
import { useState } from 'react'
import { BookOpen, KeyRound, Loader2, Sparkles } from 'lucide-react'
import type { PlannedHike } from '@/lib/plannedStore'
import { getPlannedById } from '@/lib/plannedStore'
import { buildGuideDisplaySections } from '@/lib/guida/guideDisplaySections'
import {
  GUIDE_SECTIONS, type GuideSectionKey, type GuideTextLength, type SectionLengthMap,
  GUIDE_TEXT_LENGTHS, DEFAULT_TEXT_LENGTH,
} from '@/lib/guideSections'
import { streamFetchText, StreamFetchError } from '@/lib/streamFetchText'
import { extractGuideAiError, type GuideAiError } from '@/lib/guideAiError'
import CreditErrorModal from '@/components/guida/CreditErrorModal'
import { ApprofondisciTrigger } from '@/components/editorial/SectionCard'

interface Props {
  hike: PlannedHike
  percorsoId: string
  hasAiAccess: boolean | null
  aiUnavailable: boolean
  trialExpired: boolean
  onHikeUpdate: (patch: Partial<PlannedHike>) => void
  /** Con `sectionKey` il pannello mostra solo il trigger "Approfondisci con Giulia" per QUESTA
   *  sezione — usato dentro components/libro/GuideBookPage.tsx per riportare l'azione dentro la
   *  pagina del libro invece di lasciarla solo sul riepilogo del Percorso (preferenza esplicita
   *  dell'utente dopo aver visto il libro a schermo). Senza `sectionKey` resta il pannello bulk
   *  della pagina di riepilogo (sezioni mancanti / rigenera tutta la guida). */
  sectionKey?: GuideSectionKey
  /** Solo con `sectionKey` — stesso gate di GuideReader.tsx (`showApprofondisciHint`): nessun
   *  invito ad approfondire finché i dati del percorso non sono assestati. Default `true` per non
   *  richiederlo a ogni chiamante che non lo passa (solo GuideBookPage lo passa oggi). */
  enrichmentReady?: boolean
}

export default function GuideGenerationPanel({
  hike, percorsoId, hasAiAccess, aiUnavailable, trialExpired, onHikeUpdate, sectionKey, enrichmentReady = true,
}: Props) {
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [creditError, setCreditError] = useState<GuideAiError | null>(null)
  const [length, setLength] = useState<GuideTextLength>(DEFAULT_TEXT_LENGTH)

  const displaySections = buildGuideDisplaySections(hike.cachedGuide ?? '')
  const missingKeys = displaySections
    .filter(s => s.guideKey && !s.body?.trim())
    .map(s => s.guideKey as GuideSectionKey)

  const run = async (sections: GuideSectionKey[], overrides?: Partial<SectionLengthMap>) => {
    if (generating || sections.length === 0) return
    setGenerating(true)
    setError(null)
    try {
      const acc = await streamFetchText('/api/guide', {
        hikeId: percorsoId,
        sections,
        sectionLengths: Object.fromEntries(sections.map(k => [k, overrides?.[k] ?? length])),
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

  // ── Trigger inline in una pagina del libro (GuideBookPage) — una sola sezione ──────────────
  if (sectionKey) {
    // Stesso gate di GuideReader.tsx (showApprofondisciHint): niente invito finché i dati non
    // sono pronti o senza accesso AI — la pagina di riepilogo comunica già quei due stati in modo
    // prominente, ripeterli qui su ogni sezione sarebbe solo rumore.
    if (!enrichmentReady || hasAiAccess !== true) return null
    const lengthOptions = sectionKey !== 'verificato'
      ? GUIDE_TEXT_LENGTHS.map(l => ({ key: l.key, label: l.label, description: l.description }))
      : undefined
    return (
      <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-stone-100 text-[11.5px] text-stone-400">
        {creditError && <CreditErrorModal message={creditError.message} onClose={() => setCreditError(null)} />}
        {generating ? (
          <span className="flex items-center gap-1.5">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Giulia sta approfondendo questa sezione…
          </span>
        ) : (
          <>
            <Sparkles className="w-3.5 h-3.5 shrink-0" />
            <span>Testo non ancora generato —</span>
            <ApprofondisciTrigger
              onApprofondisci={len => run([sectionKey], len ? { [sectionKey]: len } as Partial<SectionLengthMap> : undefined)}
              lengthOptions={lengthOptions}
            />
          </>
        )}
        {error && <span className="text-red-600 basis-full">{error}</span>}
      </div>
    )
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
