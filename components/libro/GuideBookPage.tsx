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
// sezioni solo-testo senza AI (verificato/sapori/consigli), coerente col mockup ma con un
// difetto reale: senza una pagina raggiungibile non c'era dove mettere un "Approfondisci con
// Giulia" per generarle dal libro stesso, che è esattamente ciò che l'utente ha chiesto dopo aver
// visto il flusso. Ora tutte le sezioni canoniche sono sempre raggiungibili; le tre legate a un
// dato sorgente specifico (meteo, POI, flora) restano condizionate a quel dato — un widget di
// meteo senza coordinate non avrebbe comunque nulla da mostrare, a prescindere dal testo.
//
// Fase 40 — direzione "Taccuino Botanico" (docs/taccuino-botanico-piano.md): la pagina passa dal
// tema "pergamena" a "taccuino" (nuova palette salvia/terracotta), e la navigazione tra sezioni
// non è più per singola sotto-sezione (9 pagine/pillole) ma per GRUPPO (3 pagine/pillole:
// GUIDE_NAV_GROUPS in lib/guideSections.ts) — ogni pagina di gruppo mostra impilate le
// sotto-sezioni che gli appartengono, invece di una alla volta. Solo navigazione/UI: le
// sotto-sezioni restano quelle generate da app/api/guide/route.ts, invariate. "Prima di partire"
// (primo gruppo) ha in più, rispetto al semplice impilamento, un'anteprima statica della mappa
// (RouteThumb, non RouteMap3D imbarcata — quel componente è costruito solo per lo schermo intero,
// vedi discussione nel piano) con pulsante "espandi" che apre RouteMap3D a schermo intero.
import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { Loader2, Maximize2, Sparkles } from 'lucide-react'
import BookPage, { type BookPageSection } from './BookPage'
import { useGuidaBookData } from '@/app/diari/[id]/percorsi/[percorsoId]/useGuidaBookData'
import { buildGuideDisplaySections, renderGuideWidget, type DisplaySection } from '@/lib/guida/guideDisplaySections'
import { GUIDE_SECTIONS, GUIDE_NAV_GROUPS, type GuideNavGroupKey, type GuideSectionKey } from '@/lib/guideSections'
import { normalizeGuideNotices } from '@/lib/guideNotices'
import { FONT } from '@/lib/designTokens'
import { TACCUINO_INK, TACCUINO_PAPER, TACCUINO_ACCENT, TACCUINO_ACCENT_TINT } from '@/lib/taccuinoTokens'
import RouteThumb from '@/components/RouteThumb'
import GuideGenerationPanel from './GuideGenerationPanel'
import PercorsoToolsDrawer from './PercorsoToolsDrawer'
import MagazineBody from '@/components/editorial/MagazineBody'

// Stesso import dinamico (niente SSR) di app/guida/GuidaHub.tsx — MapLibre non è compatibile col
// rendering server.
const RouteMap3D = dynamic(() => import('@/components/RouteMap3D'), { ssr: false })

// Sfondo dei widget "a card" (Meteo) dentro il libro — card/bordo del duo botanico (Fase 40),
// non più i toni pergamena hardcoded: sull'estetica taccuino una card bianca stonerebbe.
const WEATHER_PANEL_CLASS = 'border-[#D9C9A8] bg-[#EBE0C8]'

const ALWAYS_PRESENT: GuideSectionKey[] = ['il_percorso', 'dati_sicurezza', 'verificato', 'sapori', 'consigli']

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
   *  costruire i link di indice/gruppo, senza che questo componente conosca i nomi dei
   *  parametri di route (decisi in Fase 3). */
  basePath: string
  /** URL del Sommario del Diario — destinazione del titolo in testata da quando la pagina di
   *  riepilogo del Percorso non esiste più (Fase 15): non c'è più un "indice" a livello di
   *  Percorso a cui tornare, solo quello del Diario. */
  diarioHref: string
  diarioTitle: string
  percorsoId: string
  /** Uno dei 3 gruppi di navigazione (GUIDE_NAV_GROUPS), non più una singola sotto-sezione. */
  groupKey: GuideNavGroupKey
}

const eyebrowStyle = {
  fontFamily: FONT.barlow, fontWeight: 700, textTransform: 'uppercase' as const,
  letterSpacing: '0.08em', fontSize: 10, color: TACCUINO_INK.handMuted,
}

/** Anteprima statica (non navigabile) del tracciato — RouteThumb disegna la sagoma reale della
 *  traccia, non un placeholder generico. Il pulsante "espandi" apre RouteMap3D a schermo intero
 *  (stesso componente/comportamento di sempre): niente 3D vero incorporato qui, RouteMap3D è
 *  costruito per lo schermo intero (root fisso sull'intero viewport), incorporarlo in un riquadro
 *  piccolo avrebbe richiesto un refactor rischioso del componente per un cambio di solo stile. */
function MapPreview({
  trackPoints, distanceMeters, elevationGain, onExpand,
}: {
  trackPoints: { lat?: number; lon?: number }[]
  distanceMeters: number
  elevationGain: number
  onExpand: () => void
}) {
  const polyline = useMemo(
    () => trackPoints.filter((p): p is { lat: number; lon: number } => p.lat != null && p.lon != null).map(p => [p.lat, p.lon] as [number, number]),
    [trackPoints],
  )
  if (polyline.length < 2) return null
  return (
    <div
      className="relative overflow-hidden rounded-2xl cursor-pointer"
      style={{ height: 190, background: 'linear-gradient(135deg, #4A5A3F, #6B7D58)' }}
      onClick={onExpand}
      role="button"
      aria-label="Espandi mappa 3D"
    >
      <div className="absolute inset-2">
        <RouteThumb polyline={polyline} color={TACCUINO_PAPER.light} strokeWidth={2.5} />
      </div>
      <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,.22), transparent 45%, rgba(0,0,0,.35))' }} />
      <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-semibold text-white" style={{ background: 'rgba(0,0,0,.5)' }}>
        3D · Satellite
      </div>
      <button
        type="button"
        onClick={e => { e.stopPropagation(); onExpand() }}
        aria-label="Espandi mappa 3D"
        className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full flex items-center justify-center"
        style={{ background: 'rgba(255,255,255,.92)' }}
      >
        <Maximize2 className="w-3.5 h-3.5" style={{ color: TACCUINO_INK.typed }} />
      </button>
      <div className="absolute bottom-2.5 left-2.5 right-2.5 flex gap-1.5 flex-wrap">
        <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold" style={{ background: 'rgba(255,255,255,.92)', color: TACCUINO_INK.typed }}>
          {(distanceMeters / 1000).toFixed(1)} km
        </span>
        <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold" style={{ background: 'rgba(255,255,255,.92)', color: TACCUINO_INK.typed }}>
          {Math.round(elevationGain)} m D+
        </span>
      </div>
    </div>
  )
}

export default function GuideBookPage({ basePath, diarioHref, diarioTitle, percorsoId, groupKey }: Props) {
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
      <div className="min-h-screen flex items-center justify-center" style={{ background: TACCUINO_PAPER.base }}>
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: TACCUINO_INK.handMuted }} />
      </div>
    )
  }
  if (bd.notFound || !bd.hike) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm" style={{ background: TACCUINO_PAPER.base, color: TACCUINO_INK.handMuted, fontFamily: FONT.body }}>
        Percorso non trovato.
      </div>
    )
  }

  const groupIdx = GUIDE_NAV_GROUPS.findIndex(g => g.key === groupKey)
  const currentGroup = groupIdx >= 0 ? GUIDE_NAV_GROUPS[groupIdx] : undefined

  // Solo i gruppi veri della Guida — "Strumenti" (Reportage, generazione in blocco, esporta
  // PDF/GPX, video 3D) non è una pillola qui in mezzo: vive nella barra inferiore di
  // BookPage.tsx (Fase 17), stesso posto su ogni pagina del libro invece che in mezzo ai gruppi.
  const pills: BookPageSection[] = GUIDE_NAV_GROUPS.map(g => ({
    key: g.key, label: g.label, href: `${basePath}/guida/${g.key}`,
  }))

  if (!currentGroup) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm" style={{ background: TACCUINO_PAPER.base, color: TACCUINO_INK.handMuted, fontFamily: FONT.body }}>
        Questa sezione non è ancora disponibile per questo percorso.
      </div>
    )
  }

  // Stesso stato che GuideReader.tsx tiene per conto proprio (guideNotices/guideSources, dal
  // percorso persistito) — qui ricavato al volo dallo stesso hike invece che duplicato in uno
  // state locale, perché non cambia mai durante la lettura di una singola pagina.
  const guideNotices = normalizeGuideNotices(bd.hike.cachedGuideNotices)
  const guideSources = bd.hike.cachedGuideSources ?? []

  const widgetProps = {
    hike: bd.hike, weather: bd.weather, onOpenMap3D: () => setShow3D(true), showGradient: bd.scores.showGradient, showAspect: bd.scores.showAspect,
    scores: bd.scores, dtmProfile: bd.dtmProfile, guideNotices, guideSources,
    safetyDetails: bd.safetyDetails, poiList: bd.poiList, highlightedPoiId: bd.highlightedPoiId, onPoiTap: bd.onPoiTap,
    isLinearRoute: bd.isLinearRoute, returnOptions: bd.returnOptions, endPoint: bd.endPoint, natura: bd.natura,
    weatherPanelClassName: WEATHER_PANEL_CLASS,
  }

  const genPanelCommon = {
    hike: bd.hike, percorsoId, hasAiAccess: bd.hasAiAccess, aiUnavailable: bd.aiUnavailable,
    trialExpired: bd.trialExpired, onHikeUpdate: bd.onHikeUpdate, enrichmentReady: bd.enrichmentReady,
  }

  /** Blocco generico per una sotto-sezione impilata (gruppi "Percorso" e "Luoghi e Natura") —
   *  stesso ordine di sempre (occhiello → titolo → testo AI o pannello di generazione → widget
   *  dati), solo un h2 più piccolo dell'h1 di prima: più sotto-sezioni condividono la pagina, il
   *  titolo di pagina vero (il nome del gruppo) resta quello nella testata di BookPage. */
  function renderStackedSection(s: DisplaySection, first: boolean) {
    const widget = renderGuideWidget(s.key, s.body, widgetProps)
    return (
      <div key={s.key} className={first ? '' : 'mt-7 pt-7 border-t'} style={first ? undefined : { borderColor: `${TACCUINO_PAPER.cardBorder}80` }}>
        <p className="mb-2" style={eyebrowStyle}>{s.subtitle}</p>
        <h2 style={{ fontFamily: FONT.display, fontWeight: 600, fontSize: 18, color: TACCUINO_INK.typed, margin: '0 0 12px' }}>
          {s.title}
        </h2>
        {s.body?.trim() && (
          <div style={{ fontFamily: FONT.lora, fontSize: 14.5, lineHeight: 1.7, color: TACCUINO_INK.typed, marginBottom: 16 }}>
            <MagazineBody body={s.body} />
          </div>
        )}
        {widget}
        {!s.body?.trim() && s.guideKey && (
          <GuideGenerationPanel {...genPanelCommon} sectionKey={s.guideKey} />
        )}
      </div>
    )
  }

  const prevGroup = groupIdx > 0 ? GUIDE_NAV_GROUPS[groupIdx - 1] : undefined
  const nextGroup = groupIdx < GUIDE_NAV_GROUPS.length - 1 ? GUIDE_NAV_GROUPS[groupIdx + 1] : undefined

  let body: React.ReactNode
  if (groupKey === 'prima_di_partire') {
    // Ordine fissato dalla guida (docs/taccuino-botanico-piano.md): mappa → meteo → consigli
    // pratici (testo statico, subtitle di GUIDE_SECTIONS) → "Consigli" AI, secondario e sotto,
    // mai a sostituire i consigli pratici. Non l'impilamento generico: qui prima_di_partire
    // contribuisce solo mappa/meteo/sottotitolo, mai il proprio testo AI (che non ha più uno
    // slot in questa pagina — resta comunque generabile da "Genera tutta la guida").
    const practicalSubtitle = GUIDE_SECTIONS.find(s => s.key === 'prima_di_partire')!.subtitle
    const weatherWidget = hasWeather ? renderGuideWidget('prima_di_partire', undefined, widgetProps) : null
    const consigliSection = displaySections.find(s => s.guideKey === 'consigli')
    body = (
      <div className="flex flex-col gap-4">
        {bd.hasGps && (
          <MapPreview
            trackPoints={bd.hike.trackPoints ?? []}
            distanceMeters={bd.hike.distanceMeters}
            elevationGain={bd.hike.elevationGain}
            onExpand={() => setShow3D(true)}
          />
        )}
        {weatherWidget}
        <div>
          <p className="mb-1" style={eyebrowStyle}>Consigli pratici</p>
          <p style={{ fontFamily: FONT.lora, fontSize: 14, lineHeight: 1.6, color: TACCUINO_INK.typed }}>
            {practicalSubtitle}
          </p>
        </div>
        {consigliSection && (
          <div className="rounded-2xl p-3.5" style={{ background: TACCUINO_PAPER.card, border: `1px solid ${TACCUINO_PAPER.cardBorder}` }}>
            <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
              <span
                className="inline-flex items-center gap-1 text-[10.5px] font-bold px-2 py-1 rounded-full"
                style={{ background: TACCUINO_ACCENT_TINT, color: TACCUINO_ACCENT[600] }}
              >
                <Sparkles className="w-2.5 h-2.5" /> Giulia · AI
              </span>
              <span style={eyebrowStyle}>{consigliSection.title}, un ulteriore approfondimento</span>
            </div>
            {consigliSection.body?.trim() ? (
              <div style={{ fontFamily: FONT.lora, fontSize: 13.5, lineHeight: 1.65, color: TACCUINO_INK.typed }}>
                <MagazineBody body={consigliSection.body} />
              </div>
            ) : (
              <GuideGenerationPanel {...genPanelCommon} sectionKey="consigli" />
            )}
          </div>
        )}
      </div>
    )
  } else {
    const memberSections = currentGroup.sections
      .map(k => present.find(s => s.guideKey === k))
      .filter((s): s is DisplaySection => !!s)
    body = memberSections.length > 0
      ? <>{memberSections.map((s, i) => renderStackedSection(s, i === 0))}</>
      : (
        <p className="text-sm" style={{ color: TACCUINO_INK.handMuted, fontFamily: FONT.body }}>
          Questa sezione non è ancora disponibile per questo percorso.
        </p>
      )
  }

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
        theme="taccuino"
        diarioTitle={diarioTitle}
        indexHref={diarioHref}
        onToolsClick={() => setToolsOpen(true)}
        sectionLabel={currentGroup.label}
        prevHref={prevGroup ? `${basePath}/guida/${prevGroup.key}` : undefined}
        nextHref={nextGroup ? `${basePath}/guida/${nextGroup.key}` : basePath}
        sections={pills}
        currentSectionKey={groupKey}
        pageLabel={`${groupIdx + 1} di ${GUIDE_NAV_GROUPS.length}`}
      >
        {body}
      </BookPage>
    </>
  )
}
