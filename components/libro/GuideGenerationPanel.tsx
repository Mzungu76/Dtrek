'use client'
// Pannello di generazione/rigenerazione della Guida — nato per la pagina di riepilogo del
// Percorso (Fase 3), oggi montato solo dentro components/libro/PercorsoToolsDrawer.tsx (Fase 15,
// quella pagina è stata eliminata). Scelta fatta con l'utente all'origine:
// pannello nuovo e isolato, che chiama /api/guide direttamente con una UI propria (spinner fino al
// completamento) invece di riusare/estrarre la logica a streaming live di GuideReader.tsx
// (generateSections). Il server persiste già lui stesso cached_guide (mergeGuideSection lato
// server, vedi app/api/guide/route.ts) — qui basta rileggere il percorso a fine stream, non c'è
// merge da rifare lato client.
import { useState } from 'react'
import { BookOpen, Loader2, Sparkles } from 'lucide-react'
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
   *  (sezioni mancanti / rigenera tutta la guida), montato oggi solo dentro
   *  components/libro/PercorsoToolsDrawer.tsx. */
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

  // ── Pannello bulk — solo dentro PercorsoToolsDrawer.tsx, stile piatto coerente con le altre
  // righe di quel drawer (ToolButton) invece della card bianca con icona a cerchio di prima
  // (pensata per il riepilogo del Percorso in stile "app moderna", ora rimosso — l'utente l'ha
  // trovata "non conforme al layout attuale" una volta vista nel drawer pergamena). Nessun
  // riquadro/bordo proprio: il drawer fornisce già il proprio titolo di sezione sopra.
  if (hasAiAccess === false && aiUnavailable) {
    return (
      <p className="text-[12.5px] leading-relaxed" style={{ color: '#8a7f52' }}>
        Non riusciamo a verificare la tua chiave AI in questo momento — riprova tra poco.
      </p>
    )
  }

  if (hasAiAccess === false) {
    return (
      <p className="text-[12.5px] leading-relaxed" style={{ color: '#8a7f52' }}>
        {trialExpired ? 'Il periodo di prova gratuito è terminato — ' : 'Al momento non hai accesso alla generazione AI — '}
        <a href="/prezzi" className="font-semibold underline underline-offset-2" style={{ color: '#c05a17' }}>sblocca Dtrek</a> per far scrivere a Giulia la guida di questo percorso.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {creditError && <CreditErrorModal message={creditError.message} onClose={() => setCreditError(null)} />}
      <div className="flex flex-wrap gap-1.5">
        {GUIDE_TEXT_LENGTHS.map(l => (
          <button
            key={l.key}
            type="button"
            disabled={generating}
            onClick={() => setLength(l.key)}
            className="px-2.5 py-1 rounded-full text-[10px] font-bold transition-colors"
            style={length === l.key ? { background: '#c05a17', color: '#fff' } : { background: '#f1e9d2', color: '#8a7f52' }}
          >
            {l.label}
          </button>
        ))}
      </div>
      {missingKeys.length > 0 && (
        <button
          type="button"
          disabled={generating}
          onClick={() => run(missingKeys)}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors disabled:opacity-40"
          style={{ background: '#c05a17', color: '#fff', fontSize: 13.5, fontWeight: 600 }}
        >
          {generating ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : <BookOpen className="w-4 h-4 shrink-0" />}
          Genera le sezioni mancanti ({missingKeys.length})
        </button>
      )}
      <button
        type="button"
        disabled={generating}
        onClick={() => run(GUIDE_SECTIONS.map(s => s.key))}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors disabled:opacity-40"
        style={{ background: '#f1e9d2', color: '#3f3a22', fontSize: 13.5, fontWeight: 600 }}
      >
        {generating && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
        Rigenera tutta la guida
      </button>
      {generating && <p className="text-[11.5px]" style={{ color: '#8a7f52' }}>Giulia sta scrivendo…</p>}
      {error && <p className="text-[11.5px]" style={{ color: '#b3413a' }}>{error}</p>}
    </div>
  )
}
