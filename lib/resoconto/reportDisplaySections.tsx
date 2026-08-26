// Estratto meccanicamente da components/resoconto/ReportReader.tsx (righe ~339-347, ~564-741):
// stessa costruzione dell'elenco piatto di sezioni (capitoli narrativi a titolo libero + le 5
// sezioni "dati" fisse) e stesso dispatcher di widget per queste ultime, solo con argomenti
// espliciti al posto della closure del componente — vedi lib/guida/guideDisplaySections.tsx per
// lo stesso trattamento lato Guida. A differenza di Guida, i capitoli narrativi non hanno chiave
// stabile (titoli liberi scritti da Giulia o dall'utente): buildReportDisplaySections li espone
// con un indice progressivo (narrativeIndex), non una chiave semantica.
import type { ReactNode } from 'react'
import type { StoredActivity } from '@/lib/blobStore'
import type { RoutePhoto } from '@/lib/activityPhotos'
import type { PoiItem } from '@/lib/overpass'
import type { WikiPage } from '@/lib/wikipedia'
import type { TrackPoint } from '@/lib/tcxParser'
import { formatDuration, msToKmh, formatPace } from '@/lib/tcxParser'
import { ctsLabel } from '@/lib/trailScore'
import { computeDEP, depLabel } from '@/lib/stats'
import { parseSections } from '@/lib/reportStore'
import { ComfortTrailScoreWidget } from '@/components/ComfortTrailScoreWidget'
import { TrailScoreGaugeBadge } from '@/components/TrailScoreGaugeBadge'
import { RatingGaugeBadge } from '@/components/resoconto/RatingGaugeBadge'
import Kicker from '@/components/ui/Kicker'
import StatCard from '@/components/StatCard'
import HRChart from '@/components/HRChart'
import SpeedChart from '@/components/SpeedChart'
import RouteMapSection from '@/components/RouteMapSection'
import WeatherWidget from '@/components/WeatherWidget'
import PoiListWidget from '@/components/guida/widgets/PoiListWidget'
import NaturaWidget from '@/components/guida/widgets/NaturaWidget'
import RouteTimeline from '@/app/components/RouteTimeline'
import ActivityPhotoManager from '@/app/components/ActivityPhotoManager'
import { PhotoGallery } from '@/app/resoconto/[id]/PhotoGallery'
import { PrintPhotoGrid } from '@/app/resoconto/[id]/PrintPhotoGrid'
import PhotoMapSection from '@/components/resoconto/PhotoMapSection'
import { REPORT_SECTION_STYLE, REPORT_SECTION_TITLE, narrativeStyleFor, type ReportFixedSectionKey } from '@/components/resoconto/sectionStyle'
import { Loader2, Layers, RefreshCw, Heart, Zap, Flame } from 'lucide-react'
import type { DataSectionBundle, NaturaBundle } from '@/components/resoconto/ReportReader'

export interface DisplaySection {
  key: string
  title: string
  icon: ReactNode
  color: string
  narrativeIndex?: number
}

/** Costruisce l'elenco piatto delle sezioni del Resoconto: i capitoli narrativi (titoli liberi,
 *  parsati dal markdown) seguiti dalle 5 sezioni dati fisse, sempre presenti indipendentemente dal
 *  racconto — stesso principio di buildGuideDisplaySections. Pura funzione del markdown, nessuno
 *  stato React. */
export function buildReportDisplaySections(content: string): DisplaySection[] {
  const sections = parseSections(content)
  const narrative: DisplaySection[] = sections.map((s, i) => ({
    key: `narrative-${i}`, title: s.title, narrativeIndex: i, ...narrativeStyleFor(i),
  }))
  const fixed: DisplaySection[] = (Object.keys(REPORT_SECTION_STYLE) as ReportFixedSectionKey[]).map(k => ({
    key: k, title: REPORT_SECTION_TITLE[k], ...REPORT_SECTION_STYLE[k],
  }))
  return [...narrative, ...fixed]
}

export interface RenderReportFixedWidgetProps {
  activity: StoredActivity
  data: DataSectionBundle
  natura: NaturaBundle
  hasGps: boolean
  gpsPoints: TrackPoint[]
  dateISO: string
  onOpenMap3D: () => void
  pois: PoiItem[]
  poiWikiEntries: { poi: PoiItem; wiki: WikiPage }[]
  highlightedPoiId: number | null
  onPoiTap: (poiId: number) => void
  photos: RoutePhoto[]
  onPhotoTap: (photoId: string) => void
  onPhotosChange: (photos: RoutePhoto[]) => void
}

/** Sceglie il widget per una delle 5 sezioni dati fisse del Resoconto — stesso dispatcher di
 *  ReportReader.tsx's renderFixedWidget, con le variabili di chiusura passate come argomenti
 *  espliciti. */
export function renderReportFixedWidget(key: ReportFixedSectionKey, props: RenderReportFixedWidgetProps): ReactNode {
  const { activity, data, natura, hasGps, gpsPoints, dateISO, onOpenMap3D, pois, poiWikiEntries,
    highlightedPoiId, onPoiTap, photos, onPhotoTap, onPhotosChange } = props
  switch (key) {
    case 'dati_punteggi': {
      const hasHR  = (activity.avgHeartRate ?? 0) > 0
      const hasCal = (activity.calories ?? 0) > 0
      const hasNetSpeed = (activity.netSpeedMs ?? 0) > 0 && (activity.pauseTimeSeconds ?? 0) > 0
      const hasIev = (activity.iev ?? 0) > 0
      const dep = computeDEP(activity.distanceMeters, activity.elevationGain)
      const ts = data.ctsResult?.ts ?? activity.trailScore
      const scoreLabel = ts != null ? (data.ctsResult ?? ctsLabel(ts)).label : undefined
      const rated = (activity.userRating ?? 0) > 0
      return (
        <div className="space-y-5">
          {/* UX-AUDIT.md P-M7 — un voto scelto dall'utente (opinione) e un Trail Score calcolato
              dall'app (oggettivo) avevano lo stesso trattamento visivo (due card scure identiche
              impilate), confermato confuso da screenshot. Qui una card chiara sola — quando
              entrambi i dati esistono, due colonne di pari peso ma con etichette esplicite
              ("La tua opinione" / "Il dato oggettivo") a dire subito da dove viene ciascun
              numero, invece di lasciarlo intuire dalla sola forma dell'anello. */}
          {(rated || ts != null) && (
            <div className="rounded-2xl bg-white border border-stone-100 px-5 py-6">
              <Kicker className="text-center mb-3">Punteggio complessivo</Kicker>
              <div className={`grid gap-4 ${rated && ts != null ? 'grid-cols-2 divide-x divide-dashed divide-stone-200' : 'grid-cols-1'}`}>
                {rated && (
                  <div className="flex flex-col items-center text-center">
                    <RatingGaugeBadge value={activity.userRating!} size={72} showLabel={false} dark={false} />
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-400 mt-2.5">La tua opinione</p>
                    <p className="text-[12.5px] font-bold text-stone-800 mt-0.5">Voto {activity.userRating}/10</p>
                  </div>
                )}
                {ts != null && (
                  <div className="flex flex-col items-center text-center">
                    <TrailScoreGaugeBadge total={Math.round(ts)} safety={null} showLabel={false} size={72} dark={false} />
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-400 mt-2.5">Il dato oggettivo</p>
                    {scoreLabel && <p className="text-[12.5px] font-bold text-stone-800 mt-0.5">Trail Score · {scoreLabel}</p>}
                  </div>
                )}
              </div>
              {activity.userRatingNote && (
                <p className="text-stone-500 text-[12.5px] italic leading-relaxed text-center mt-4 pt-4 border-t border-stone-100">
                  “{activity.userRatingNote}”
                </p>
              )}
            </div>
          )}
          {ts != null ? (
            <ComfortTrailScoreWidget result={data.ctsResult} cached={activity.trailScore} beautyScore={activity.linkedBeautyScore} />
          ) : (
            <div className="flex items-center justify-between gap-4 rounded-2xl bg-stone-50 border border-stone-200 px-5 py-4">
              <p className="text-sm text-stone-500">Il punteggio non è ancora stato calcolato.</p>
              <button onClick={data.onComputeCts} disabled={data.ctsComputing} className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl bg-forest-500 hover:bg-forest-400 disabled:opacity-50 text-white text-sm font-medium transition-colors">
                {data.ctsComputing ? <><Loader2 className="w-4 h-4 animate-spin" /> Calcolo…</> : <><RefreshCw className="w-4 h-4" /> Calcola CTS</>}
              </button>
            </div>
          )}

          {hasGps && data.dtmProfile?.source === 'dtm' && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {activity.trackPoints.some(p => p.altitudeMeters !== undefined) && (
                <button onClick={data.onToggleGradient} className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs border transition-colors ${data.showGradient ? 'bg-forest-500 text-white border-forest-500' : 'bg-stone-50 border-stone-200 text-stone-500'}`}>
                  <Layers className="w-3 h-3" /> Pendenza
                </button>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {hasHR && <StatCard label="FC Media" value={`${activity.avgHeartRate} bpm`} sub={`Max ${activity.maxHeartRate} bpm`} color="red" icon={<Heart className="w-3.5 h-3.5" />} />}
            <StatCard label="Vel. Media" value={`${msToKmh(activity.avgSpeedMs)} km/h`} sub={`Max ${msToKmh(activity.maxSpeedMs)} km/h`} color="blue" icon={<Zap className="w-3.5 h-3.5" />} />
            {hasNetSpeed && <StatCard label="Vel. Crociera" value={`${msToKmh(activity.netSpeedMs!)} km/h`} sub={`Pause ${formatDuration(activity.pauseTimeSeconds!)}`} color="blue" />}
            {hasCal && <StatCard label="Calorie" value={`${activity.calories} kcal`} color="terra" icon={<Flame className="w-3.5 h-3.5" />} />}
            <StatCard label="DEP" value={`${dep.toFixed(1)} km`} sub={depLabel(dep)} color="stone" />
            {hasIev && <StatCard label="Efficienza verticale" value={`${activity.iev!.toFixed(0)} m/min`} color="forest" />}
          </div>

          <dl className="rounded-2xl bg-stone-50 border border-stone-200 p-4 grid grid-cols-2 gap-x-3 gap-y-1.5">
            {[
              ['Passo medio', formatPace(activity.distanceMeters, activity.totalTimeSeconds)],
              ['Quota partenza', `${activity.trackPoints[0]?.altitudeMeters?.toFixed(1) ?? '--'} m`],
              ['Quota minima', `${activity.altitudeMin.toFixed(1)} m`],
              ['Quota massima', `${activity.altitudeMax.toFixed(1)} m`],
              ['Trackpoint', activity.trackPoints.length.toLocaleString('it')],
              ['Sport', activity.sport],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between border-b border-stone-100 py-1">
                <dt className="text-stone-400 text-xs">{k}</dt>
                <dd className="font-mono text-xs font-medium text-stone-800">{v}</dd>
              </div>
            ))}
          </dl>

          {hasGps && dateISO && <WeatherWidget mode="historical" lat={gpsPoints[Math.floor(gpsPoints.length / 2)].lat!} lon={gpsPoints[Math.floor(gpsPoints.length / 2)].lon!} date={dateISO} />}

          {data.similarActivities.length > 0 && (
            <div>
              <p className="text-sm font-semibold mb-2 text-stone-800">Percorsi simili</p>
              <div className="rounded-2xl bg-stone-50 border border-stone-200 overflow-hidden">
                <table className="w-full text-xs">
                  <tbody>
                    {data.similarActivities.slice(0, 5).map(({ activity: a, startDistanceM }) => (
                      <tr key={a.id} className="border-t border-stone-100 first:border-t-0 hover:bg-stone-100 cursor-pointer" onClick={() => data.onOpenSimilar(a.id)}>
                        <td className="px-3 py-2 text-stone-800">{new Date(a.startTime).toLocaleDateString('it-IT')}</td>
                        <td className="px-3 py-2 text-stone-800">{(a.distanceMeters / 1000).toFixed(1)} km</td>
                        <td className="px-3 py-2 text-stone-400">{startDistanceM < 50 ? 'stesso punto' : `${startDistanceM.toFixed(0)} m`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )
    }
    case 'andamento':
      return (
        <div className="space-y-5">
          {hasGps && activity.trackPoints.length ? (
            <RouteMapSection
              trackPoints={activity.trackPoints}
              showPois={false}
              onOpenMap3D={onOpenMap3D}
              showGradient={data.showGradient}
              showAspect={data.showAspect}
              showAspectToggle={data.dtmProfile?.source === 'dtm'}
              onToggleAspect={data.onToggleAspect}
              dtmProfile={data.dtmProfile}
            />
          ) : (
            <p className="text-sm italic text-center py-8 text-stone-400">Profilo altimetrico non disponibile senza un tracciato GPS.</p>
          )}
          {activity.trackPoints.some(p => (p.heartRateBpm ?? 0) > 0) && (
            <HRChart trackPoints={activity.trackPoints} avgHR={activity.avgHeartRate} maxHR={activity.maxHeartRate} />
          )}
          <SpeedChart trackPoints={activity.trackPoints} avgSpeedMs={activity.avgSpeedMs} />
          {photos.length > 0 && <RouteTimeline trackPoints={activity.trackPoints} photos={photos} />}
        </div>
      )
    case 'natura':
      return <NaturaWidget {...natura} />
    case 'poi':
      return (
        <PoiListWidget
          hikeId={activity.id}
          pois={pois}
          poiWikiEntries={poiWikiEntries}
          hasGps={hasGps}
          centerLat={gpsPoints[Math.floor(gpsPoints.length / 2)]?.lat}
          centerLon={gpsPoints[Math.floor(gpsPoints.length / 2)]?.lon}
          onWikiLoaded={() => {}}
          highlightedPoiId={highlightedPoiId}
          onItemTap={poi => onPoiTap(poi.id)}
          trackPoints={activity.trackPoints}
          onOpenMap3D={onOpenMap3D}
        />
      )
    case 'galleria_foto':
      return (
        <div className="space-y-6">
          {hasGps && (
            <PhotoMapSection trackPoints={activity.trackPoints} photos={photos} onPhotoTap={onPhotoTap} onOpenMap3D={onOpenMap3D} />
          )}
          {photos.length > 0 && (
            <>
              <PhotoGallery photos={photos} onPhotoClick={photo => onPhotoTap(photo.id)} />
              <PrintPhotoGrid photos={photos} />
            </>
          )}
          <ActivityPhotoManager
            activityId={activity.id}
            trackPoints={activity.trackPoints}
            photos={photos}
            onPhotosChange={onPhotosChange}
          />
        </div>
      )
  }
}
