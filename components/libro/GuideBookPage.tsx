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
// Gate di presenza (quali sezioni diventano pagine): rivisto dopo il primo giro di verifica a
// schermo con l'utente — la versione originale (vedi git history) faceva sparire del tutto le
// sezioni solo-testo senza AI (verificato/comfort/sapori/consigli), coerente col mockup ma con un
// difetto reale: senza una pagina raggiungibile non c'era dove mettere un "Approfondisci con
// Giulia" per generarle dal libro stesso, che è esattamente ciò che l'utente ha chiesto dopo aver
// visto il flusso. Ora tutte le 9 sezioni canoniche sono sempre raggiungibili; le tre legate a un
// dato sorgente specifico (meteo, POI, flora) restano condizionate a quel dato — un widget di
// meteo senza coordinate non avrebbe comunque nulla da mostrare, a prescindere dal testo.
import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import BookPage, { type BookPageSection } from './BookPage'
import { useGuidaBookData } from '@/app/diari/[id]/percorsi/[percorsoId]/useGuidaBookData'
import { buildGuideDisplaySections, renderGuideWidget, type DisplaySection } from '@/lib/guida/guideDisplaySections'
import type { GuideSectionKey } from '@/lib/guideSections'
import { normalizeGuideNotices } from '@/lib/guideNotices'
import { FONT } from '@/lib/designTokens'
import { Loader2, Wrench } from 'lucide-react'
import GuideGenerationPanel from './GuideGenerationPanel'
import PercorsoToolsDrawer from './PercorsoToolsDrawer'
import MagazineBody from '@/components/editorial/MagazineBody'

// Stesso import dinamico (niente SSR) di app/guida/GuidaHub.tsx — MapLibre non è compatibile col
// rendering server.
const RouteMap3D = dynamic(() => import('@/components/RouteMap3D'), { ssr: false })

// Sfondo dei widget "a card bianca" (Meteo) dentro il libro — un tono più scuro della pergamena
// stessa (#fbf6e8), non bianco: sull'estetica calda della pagina una card bianca stonava (feedback
// dell'utente dopo la prima verifica a schermo). Stessi toni di BookPage.tsx (PAPER_HAIRLINE/
// PILL_BG), qui non riesportati da lì perché usati solo in questo file.
const WEATHER_PANEL_CLASS = 'border-[#e4d9bd] bg-[#f1e9d2]'

const ALWAYS_PRESENT: GuideSectionKey[] = ['il_percorso', 'dati_sicurezza', 'verificato', 'comfort', 'sapori', 'consigli']

function isSectionPresent(s: DisplaySection, hasWeather: boolean, hasLuoghi: boolean, hasNatura: boolean): boolean {
  if (!s.guideKey) return false
  if (ALWAYS_PRESENT.includes(s.guideKey)) return true
  if (s.guideKey === 'prima_di_partire') return hasWeather
  if (s.guideKey === 'luoghi') return hasLuoghi
  if (s.guideKey === 'natura') return hasNatura
  return false
}

interface Props {
  /** Base path del Percorso nel Diario (es. `/diari/{id}/percorsi/{percorsoId}`) — usata per
   *  costruire i link di indice/sezione, senza che questo componente conosca i nomi dei
   *  parametri di route (decisi in Fase 3). */
  basePath: string
  /** URL del Sommario del Diario — destinazione del titolo in testata da quando la pagina di
   *  riepilogo del Percorso non esiste più (Fase 15): non c'è più un "indice" a livello di
   *  Percorso a cui tornare, solo quello del Diario. */
  diarioHref: string
  diarioTitle: string
  percorsoId: string
  sectionKey: GuideSectionKey
}

export default function GuideBookPage({ basePath, diarioHref, diarioTitle, percorsoId, sectionKey }: Props) {
  const bd = useGuidaBookData(percorsoId)
  const [toolsOpen, setToolsOpen] = useState(false)
  const [show3D, setShow3D] = useState(false)

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

  const sections: BookPageSection[] = [
    ...present.map(s => ({
      key: s.guideKey as string,
      label: s.title,
      href: `${basePath}/guida/${s.guideKey}`,
    })),
    // Non è una sezione della Guida — apre il drawer degli strumenti del Percorso (Fase 15):
    // Reportage, generazione in blocco, esporta PDF/GPX, video 3D. Vive qui (e non nell'indice del
    // Diario, che ora porta dritto qui dentro) perché altrimenti, usciti dall'indice, non ci
    // sarebbe più un modo per raggiungerli da nessuna pagina della Guida.
    { key: 'strumenti', label: 'Strumenti', onClick: () => setToolsOpen(true), icon: <Wrench className="w-3 h-3" /> },
  ]

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
    hike: bd.hike, weather: bd.weather, onOpenMap3D: () => setShow3D(true), showGradient: bd.scores.showGradient, showAspect: bd.scores.showAspect,
    scores: bd.scores, dtmProfile: bd.dtmProfile, guideNotices, guideSources,
    safetyDetails: bd.safetyDetails, poiList: bd.poiList, highlightedPoiId: bd.highlightedPoiId, onPoiTap: bd.onPoiTap,
    isLinearRoute: bd.isLinearRoute, returnOptions: bd.returnOptions, endPoint: bd.endPoint, natura: bd.natura,
    weatherPanelClassName: WEATHER_PANEL_CLASS,
  })

  return (
    <>
      <PercorsoToolsDrawer
        open={toolsOpen}
        onClose={() => setToolsOpen(false)}
        basePath={basePath}
        percorsoId={percorsoId}
        hike={bd.hike}
        hasAiAccess={bd.hasAiAccess}
        aiUnavailable={bd.aiUnavailable}
        trialExpired={bd.trialExpired}
        onHikeUpdate={bd.onHikeUpdate}
        hasGps={bd.hasGps}
        onOpen3D={() => setShow3D(true)}
      />
      {show3D && bd.hasGps && (
        <RouteMap3D
          trackPoints={bd.hike.trackPoints ?? []} title={bd.hike.title} onClose={() => setShow3D(false)}
          plannedDate={bd.hike.plannedDate} pois={bd.pois} dtmProfile={bd.dtmProfile}
          distanceMeters={bd.hike.distanceMeters} elevationGain={bd.hike.elevationGain}
        />
      )}
      <BookPage
        diarioTitle={diarioTitle}
        indexHref={diarioHref}
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
          <div style={{ fontFamily: FONT.lora, fontSize: 14.5, lineHeight: 1.7, color: '#4a4530', marginBottom: 16 }}>
            <MagazineBody body={current.body} />
          </div>
        )}
        {widget}
        {!current.body?.trim() && (
          <GuideGenerationPanel
            hike={bd.hike}
            percorsoId={percorsoId}
            hasAiAccess={bd.hasAiAccess}
            aiUnavailable={bd.aiUnavailable}
            trialExpired={bd.trialExpired}
            onHikeUpdate={bd.onHikeUpdate}
            sectionKey={sectionKey}
            enrichmentReady={bd.enrichmentReady}
          />
        )}
      </BookPage>
    </>
  )
}
