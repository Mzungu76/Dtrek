// Estratto meccanicamente da components/guida/GuideReader.tsx (righe ~278-291, ~741-848): stessa
// costruzione dell'elenco piatto di sezioni e stesso dispatcher di widget, solo con argomenti
// espliciti al posto della closure del componente — così può essere chiamato sia dal lettore
// continuo (GuideReader) sia dalle nuove pagine "a libro" (components/libro/GuideBookPage.tsx),
// con la garanzia che il widget mostrato per ciascuna sezione è calcolato dalla stessa funzione
// nei due punti, non da due implementazioni che possono divergere nel tempo.
import type { ReactNode } from 'react'
import type { PlannedHike } from '@/lib/plannedStore'
import { GUIDE_SECTIONS, type GuideSectionKey } from '@/lib/guideSections'
import { parseGuideSections } from '@/lib/guideParse'
import { SECTION_STYLE, LEGACY_STYLE } from '@/components/guida/sectionStyle'
import { parseNoticeSource, type GuideNotice } from '@/lib/guideNotices'
import type { GuideSource } from '@/lib/guideSources'
import type { ReturnOption } from '@/lib/routeBuilder/returnOptions'
import type { TrailDtmProfile } from '@/lib/dtm/trailDtmProfile'
import WeatherWidget from '@/components/WeatherWidget'
import RouteMapSection from '@/components/RouteMapSection'
import DatiSicurezzaTabs from '@/components/guida/widgets/DatiSicurezzaTabs'
import PoiListWidget from '@/components/guida/widgets/PoiListWidget'
import NaturaWidget from '@/components/guida/widgets/NaturaWidget'
import { AlertTriangle, Link2, Info } from 'lucide-react'
import type { ScoresBundle, SafetyDetailsBundle, PoiListBundle, NaturaBundle } from '@/components/guida/GuideReader'

// Stesso stile del riquadro avviso per gravità di GuideReader.tsx — vedi lib/guideNotices.ts.
const NOTICE_SEVERITY_STYLE: Record<GuideNotice['severity'], { box: string; icon: string; text: string; link: string }> = {
  danger:  { box: 'border-red-200 bg-red-50',       icon: 'text-red-600',    text: 'text-red-900',    link: 'bg-red-100 hover:bg-red-200 text-red-800' },
  warning: { box: 'border-amber-200 bg-amber-50',   icon: 'text-amber-600',  text: 'text-amber-900',  link: 'bg-amber-100 hover:bg-amber-200 text-amber-800' },
  info:    { box: 'border-sky-200 bg-sky-50',       icon: 'text-sky-600',    text: 'text-sky-900',    link: 'bg-sky-100 hover:bg-sky-200 text-sky-800' },
}

export interface DisplaySection {
  key: GuideSectionKey | `legacy-${number}`
  guideKey: GuideSectionKey | null
  title: string
  subtitle?: string
  body?: string
  icon: ReactNode
  color: string
}

/** Costruisce l'elenco piatto delle sezioni della Guida (le 9 fisse di GUIDE_SECTIONS, sempre
 *  presenti nell'ordine canonico, testo AI dove esiste + eventuali sezioni "legacy" non
 *  riconosciute in coda) — pura funzione del markdown, nessuno stato React. */
export function buildGuideDisplaySections(guideText: string): DisplaySection[] {
  const parsedSections = guideText ? parseGuideSections(guideText) : []
  const byKey = new Map(parsedSections.filter(s => s.key).map(s => [s.key as GuideSectionKey, s]))
  const fixed: DisplaySection[] = GUIDE_SECTIONS.map(def => {
    const parsed = byKey.get(def.key)
    const style = SECTION_STYLE[def.key]
    return { key: def.key, guideKey: def.key, title: def.title, subtitle: def.subtitle, body: parsed?.body, icon: style.icon, color: style.color }
  })
  const legacy: DisplaySection[] = parsedSections
    .filter(s => !s.key)
    .map((s, i) => ({ key: `legacy-${i}` as const, guideKey: null, title: s.title, body: s.body, icon: LEGACY_STYLE.icon, color: LEGACY_STYLE.color }))
  return [...fixed, ...legacy]
}

export interface RenderGuideWidgetProps {
  hike: Pick<PlannedHike, 'id' | 'plannedDate' | 'altitudeMax' | 'elevationGain' | 'trackPoints'>
  weather?: { lat: number; lon: number; mode: 'planned' | 'forecast' }
  onOpenMap3D?: () => void
  showGradient?: boolean
  showAspect?: boolean
  scores?: ScoresBundle
  dtmProfile?: TrailDtmProfile
  /** Stato guideNotices/guideSources del chiamante — sovrascrive scores?.guideNotices dentro
   *  "dati_sicurezza" esattamente come faceva GuideReader ({ ...scores, guideNotices }). */
  guideNotices: GuideNotice[]
  guideSources: GuideSource[]
  safetyDetails?: SafetyDetailsBundle
  poiList?: PoiListBundle
  highlightedPoiId?: number | null
  onPoiTap?: (poiId: number) => void
  isLinearRoute: boolean
  returnOptions?: ReturnOption[] | null
  endPoint?: { lat: number; lon: number } | null
  natura?: NaturaBundle
  /** Sovrascrive lo sfondo bianco del widget Meteo — vedi WeatherWidget.tsx's `panelClassName`.
   *  Assente per il lettore classico (GuideReader), che resta invariato. */
  weatherPanelClassName?: string
}

/** Sceglie il widget dati per una sezione fissa della Guida — stesso dispatcher di
 *  GuideReader.tsx's renderWidget, con le variabili di chiusura passate come argomenti espliciti.
 *  Le sezioni senza widget dedicato (comfort/sapori/consigli) e quelle legacy restano testo AI
 *  puro: `default: return null`. */
export function renderGuideWidget(key: DisplaySection['key'], body: string | undefined, props: RenderGuideWidgetProps): ReactNode {
  const { hike, weather, onOpenMap3D, showGradient, showAspect, scores, dtmProfile, guideNotices, guideSources,
    safetyDetails, poiList, highlightedPoiId, onPoiTap, isLinearRoute, returnOptions, endPoint, natura,
    weatherPanelClassName } = props
  switch (key) {
    case 'prima_di_partire':
      return weather
        ? <WeatherWidget mode={weather.mode} lat={weather.lat} lon={weather.lon} date={hike.plannedDate} altitudeMax={hike.altitudeMax} elevationGain={hike.elevationGain} days={7} panelClassName={weatherPanelClassName} />
        : null
    case 'il_percorso':
      return (
        <RouteMapSection
          trackPoints={hike.trackPoints}
          showPois={false}
          onOpenMap3D={onOpenMap3D}
          showGradient={showGradient}
          showAspect={showAspect}
          showAspectToggle={scores?.showAspectToggle}
          onToggleAspect={scores?.onToggleAspect}
          dtmProfile={dtmProfile}
          planned
        />
      )
    case 'dati_sicurezza':
      return <DatiSicurezzaTabs scores={scores ? { ...scores, guideNotices } : scores} safetyDetails={safetyDetails} />
    case 'luoghi':
      return poiList
        ? (
          <PoiListWidget
            {...poiList}
            hikeId={hike.id}
            highlightedPoiId={highlightedPoiId}
            onItemTap={poi => onPoiTap?.(poi.id)}
            trackPoints={hike.trackPoints}
            onOpenMap3D={onOpenMap3D}
            returnOptions={isLinearRoute ? returnOptions : undefined}
            returnOptionsOrigin={endPoint ?? undefined}
          />
        )
        : null
    case 'natura':
      return natura ? <NaturaWidget {...natura} /> : null
    case 'verificato': {
      // Stesso taglio di GuideReader.tsx: il disclaimer compare ogni volta che la sezione ha un
      // testo (la ricerca è stata davvero eseguita), non solo quando ci sono avvisi/fonti.
      if (!body?.trim()) return null
      return (
        <div className="space-y-3">
          {guideNotices.length > 0 && (
            <div className="space-y-2">
              {guideNotices.map((notice, i) => {
                const { text, url } = parseNoticeSource(notice.text)
                const style = NOTICE_SEVERITY_STYLE[notice.severity]
                return (
                  <div key={i} className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 ${style.box}`}>
                    <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${style.icon}`} />
                    <div className="min-w-0">
                      <p className={`text-[13px] leading-relaxed ${style.text}`}>{text}</p>
                      {url && (
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`mt-1.5 inline-flex items-center gap-1.5 max-w-full px-2.5 py-1 rounded-full transition-colors text-[11px] ${style.link}`}
                          title={url}
                        >
                          <Link2 className={`w-3 h-3 shrink-0 ${style.icon}`} />
                          <span className="truncate">Vai alla fonte</span>
                        </a>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          {guideSources.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {guideSources.map((s, i) => (
                <a
                  key={i}
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 max-w-full px-3 py-1.5 rounded-full bg-stone-100 hover:bg-stone-200 transition-colors text-[11px] text-stone-600"
                  title={s.url}
                >
                  <Link2 className="w-3 h-3 shrink-0 text-stone-400" />
                  <span className="truncate">{s.title}</span>
                </a>
              ))}
            </div>
          )}
          <div className="flex items-start gap-2 rounded-xl bg-stone-50 border border-stone-100 px-3.5 py-2.5">
            <Info className="w-3.5 h-3.5 shrink-0 text-stone-400 mt-0.5" />
            <p className="text-[11px] text-stone-400 leading-relaxed">
              Verifica condotta da un&apos;intelligenza artificiale tramite ricerche automatiche sul web: può contenere errori o non cogliere tutte le criticità reali. Non sostituisce la prudenza sul campo — controlla sempre le condizioni aggiornate prima di partire.
            </p>
          </div>
        </div>
      )
    }
    default:
      return null
  }
}
