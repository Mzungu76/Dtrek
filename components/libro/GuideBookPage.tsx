'use client'
// Una sezione della Guida come pagina del libro — vedi /root/.claude/plans/logical-munching-kahan.md,
// Fase 2. Monta una sola sezione alla volta (mount/unmount reale, non display:none): scelta
// deliberata per mappa (RouteMapSection/PoiListWidget) e grafici, che misurano il proprio
// contenitore al mount e restituiscono un box 0×0 se nascosti via CSS invece che smontati.
//
// Riusa la stessa estrazione di Fase 0 (buildGuideDisplaySections/renderGuideWidget) usata da
// GuideReader.tsx — stesso identico widget per la stessa sezione, letto qui e nel lettore
// continuo di /guida/[id] dalla stessa funzione, non da due copie che possono divergere.
//
// Gate di presenza (quali sezioni diventano pagine): stesso principio validato nel mockup — una
// pagina esiste solo se ha davvero qualcosa da mostrare, non un placeholder vuoto in attesa di
// generazione. Le tre sezioni con widget sempre attivo quando il dato sorgente esiste (mappa,
// dati e sicurezza, meteo) restano presenti anche senza testo AI; le sezioni solo-testo
// (verificato/comfort/sapori/consigli) richiedono che Giulia abbia già scritto qualcosa.
import { useMemo } from 'react'
import BookPage, { type BookPageSection } from './BookPage'
import { useGuidaBookData } from '@/app/diari/[id]/percorsi/[percorsoId]/useGuidaBookData'
import { buildGuideDisplaySections, renderGuideWidget, type DisplaySection } from '@/lib/guida/guideDisplaySections'
import type { GuideSectionKey } from '@/lib/guideSections'
import { normalizeGuideNotices } from '@/lib/guideNotices'
import { FONT } from '@/lib/designTokens'
import { Loader2 } from 'lucide-react'

const ALWAYS_PRESENT: GuideSectionKey[] = ['il_percorso', 'dati_sicurezza']

function isSectionPresent(s: DisplaySection, hasWeather: boolean, hasLuoghi: boolean, hasNatura: boolean): boolean {
  if (!s.guideKey) return false
  if (ALWAYS_PRESENT.includes(s.guideKey)) return true
  if (s.guideKey === 'prima_di_partire') return hasWeather
  if (s.guideKey === 'luoghi') return hasLuoghi
  if (s.guideKey === 'natura') return hasNatura
  // verificato / comfort / sapori / consigli — solo testo, nessun widget: la pagina esiste solo se
  // Giulia ha già scritto qualcosa per quella sezione.
  return !!s.body?.trim()
}

interface Props {
  /** Base path del Percorso nel Diario (es. `/diari/{id}/percorsi/{percorsoId}`) — usata per
   *  costruire i link di indice/sezione, senza che questo componente conosca i nomi dei
   *  parametri di route (decisi in Fase 3). */
  basePath: string
  diarioTitle: string
  percorsoId: string
  sectionKey: GuideSectionKey
  onOpenMap3D?: () => void
}

export default function GuideBookPage({ basePath, diarioTitle, percorsoId, sectionKey, onOpenMap3D }: Props) {
  const bd = useGuidaBookData(percorsoId)

  const displaySections = useMemo(
    () => buildGuideDisplaySections(bd.hike?.cachedGuide ?? ''),
    [bd.hike?.cachedGuide],
  )

  const hasWeather = !!bd.weather
  const hasLuoghi = bd.poiList.pois.length > 0 || bd.poiList.poiWikiEntries.length > 0
  const hasNatura = bd.natura.hasGps && (!!bd.natura.flora?.available)

  const present = useMemo(
    () => displaySections.filter(s => isSectionPresent(s, hasWeather, hasLuoghi, hasNatura)),
    [displaySections, hasWeather, hasLuoghi, hasNatura],
  )

  if (bd.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#fbf6e8' }}>
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#a9915f' }} />
      </div>
    )
  }
  if (bd.notFound || !bd.hike) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm" style={{ background: '#fbf6e8', color: '#6b6142', fontFamily: FONT.body }}>
        Percorso non trovato.
      </div>
    )
  }

  const idx = present.findIndex(s => s.guideKey === sectionKey)
  const current = idx >= 0 ? present[idx] : undefined

  const sections: BookPageSection[] = present.map(s => ({
    key: s.guideKey as string,
    label: s.title,
    href: `${basePath}/guida/${s.guideKey}`,
  }))

  if (!current) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm" style={{ background: '#fbf6e8', color: '#6b6142', fontFamily: FONT.body }}>
        Questa sezione non è ancora disponibile per questo percorso.
      </div>
    )
  }

  // Stesso stato che GuideReader.tsx tiene per conto proprio (guideNotices/guideSources, dal
  // percorso persistito) — qui ricavato al volo dallo stesso hike invece che duplicato in uno
  // state locale, perché non cambia mai durante la lettura di una singola pagina.
  const guideNotices = normalizeGuideNotices(bd.hike.cachedGuideNotices)
  const guideSources = bd.hike.cachedGuideSources ?? []

  const widget = renderGuideWidget(current.key, current.body, {
    hike: bd.hike, weather: bd.weather, onOpenMap3D, showGradient: bd.scores.showGradient, showAspect: bd.scores.showAspect,
    scores: bd.scores, dtmProfile: bd.dtmProfile, guideNotices, guideSources,
    safetyDetails: bd.safetyDetails, poiList: bd.poiList, highlightedPoiId: bd.highlightedPoiId, onPoiTap: bd.onPoiTap,
    isLinearRoute: bd.isLinearRoute, returnOptions: bd.returnOptions, endPoint: bd.endPoint, natura: bd.natura,
  })

  return (
    <BookPage
      diarioTitle={diarioTitle}
      indexHref={basePath}
      sectionLabel={current.title}
      prevHref={idx > 0 ? `${basePath}/guida/${present[idx - 1].guideKey}` : undefined}
      nextHref={idx < present.length - 1 ? `${basePath}/guida/${present[idx + 1].guideKey}` : basePath}
      sections={sections}
      currentSectionKey={sectionKey}
      pageLabel={`${idx + 1} di ${present.length}`}
    >
      <p
        className="mb-2"
        style={{ fontFamily: FONT.barlow, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 10, color: '#8a7f52' }}
      >
        {current.subtitle}
      </p>
      <h1 style={{ fontFamily: FONT.display, fontWeight: 600, fontSize: 22, color: '#3f3a22', margin: '0 0 14px' }}>
        {current.title}
      </h1>
      {current.body?.trim() && (
        <p style={{ fontFamily: FONT.lora, fontSize: 14.5, lineHeight: 1.7, color: '#4a4530', whiteSpace: 'pre-wrap', margin: '0 0 16px' }}>
          {current.body}
        </p>
      )}
      {widget}
    </BookPage>
  )
}
