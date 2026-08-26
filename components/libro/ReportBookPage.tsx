'use client'
// Una sezione del Reportage come pagina del libro — vedi /root/.claude/plans/logical-munching-kahan.md,
// Fase 2. Stesso principio di GuideBookPage.tsx (mount/unmount reale, una sezione alla volta,
// stessa estrazione di Fase 0). Differenza chiave rispetto a Guida: i capitoli narrativi
// ("Cronaca") non hanno una chiave stabile — sono titoli liberi scritti da Giulia o dall'utente —
// quindi qui la pagina è indirizzata da un indice numerico 1-based (vedi Fase 3,
// `.../reportage/[activityId]/sezione/[n]/page.tsx`), non da uno slug come per Guida.
import { useEffect, useMemo, useState } from 'react'
import BookPage, { type BookPageSection } from './BookPage'
import { useReportageBookData } from '@/app/diari/[id]/percorsi/[percorsoId]/reportage/[activityId]/useReportageBookData'
import { buildReportDisplaySections, renderReportFixedWidget, type DisplaySection } from '@/lib/resoconto/reportDisplaySections'
import { parseSections } from '@/lib/reportStore'
import type { ReportFixedSectionKey } from '@/components/resoconto/sectionStyle'
import { PhotoLightbox } from '@/app/resoconto/[id]/PhotoLightbox'
import { FONT } from '@/lib/designTokens'
import { Loader2 } from 'lucide-react'
import ReportGenerationPanel from './ReportGenerationPanel'
import MagazineBody from '@/components/editorial/MagazineBody'

const ALWAYS_PRESENT: ReportFixedSectionKey[] = ['dati_punteggi', 'andamento']

function isSectionPresent(s: DisplaySection, hasNatura: boolean, hasLuoghi: boolean, hasPhotos: boolean): boolean {
  if (s.narrativeIndex != null) return true
  const key = s.key as ReportFixedSectionKey
  if (ALWAYS_PRESENT.includes(key)) return true
  if (key === 'natura') return hasNatura
  if (key === 'poi') return hasLuoghi
  if (key === 'galleria_foto') return hasPhotos
  return false
}

interface Props {
  /** Base path del Reportage nel Diario (es. `/diari/{id}/percorsi/{percorsoId}/reportage/{activityId}`). */
  basePath: string
  diarioTitle: string
  activityId: string
  /** 1-based, coerente con la route `.../sezione/[n]`. */
  pageIndex: number
  onOpenMap3D?: () => void
  /** `pageIndex` fuori dall'intervallo valido [1, numero di sezioni presenti] — capita quando una
   *  rigenerazione cambia il numero di capitoli dopo che un link a `pageIndex` è già stato aperto
   *  (Fase 3, docs/diario-a-libro-piano.md: "clamp/redirect esplicito"). Il chiamante (la route
   *  `.../sezione/[n]/page.tsx`) decide cosa fare — di norma redirect a `sezione/1` o alla pagina
   *  di riepilogo — invece che questo componente lo faccia da solo, perché non conosce l'URL della
   *  pagina di riepilogo (basePath qui è quello del Reportage, non del suo indice). */
  onInvalidPageIndex?: (presentCount: number) => void
}

export default function ReportBookPage({ basePath, diarioTitle, activityId, pageIndex, onOpenMap3D, onInvalidPageIndex }: Props) {
  const bd = useReportageBookData(activityId)
  const [highlightedPoiId, setHighlightedPoiId] = useState<number | null>(null)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  // useReportageBookData non espone un setter per il contenuto (Fase 1, loader magro): il testo
  // appena generato dal pannello inline sotto arriva qui via callback, non da un refetch — stesso
  // principio del pannello Guida (GuideGenerationPanel), ma lì il refetch di getPlannedById era
  // comunque necessario per gli altri campi persistiti (cachedGuideNotices/Sources), qui il solo
  // testo basta.
  const [overrideContent, setOverrideContent] = useState<string | null>(null)
  const content = overrideContent ?? bd.content

  const narrativeChapters = useMemo(() => parseSections(content), [content])
  const displaySections = useMemo(() => buildReportDisplaySections(content), [content])

  const hasNatura = bd.natura.hasGps && !!bd.natura.flora?.available
  const hasLuoghi = bd.pois.length > 0 || bd.poiWikiEntries.length > 0
  const hasPhotos = bd.photos.length > 0

  const present = useMemo(
    () => displaySections.filter(s => isSectionPresent(s, hasNatura, hasLuoghi, hasPhotos)),
    [displaySections, hasNatura, hasLuoghi, hasPhotos],
  )

  const idx = pageIndex - 1
  const current = idx >= 0 && idx < present.length ? present[idx] : undefined

  // present.length parte da 0 finché i dati non sono arrivati — non è ancora un "fuori intervallo"
  // reale, solo un ancora-non-caricato: il chiamante deve reagire solo a dati assestati (loading
  // concluso, activity trovata) e comunque senza una sezione a quell'indice.
  const ready = !bd.loading && !bd.notFound && !!bd.activity
  useEffect(() => {
    if (ready && !current) onInvalidPageIndex?.(present.length)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, current, present.length])

  if (bd.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#fbf6e8' }}>
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#a9915f' }} />
      </div>
    )
  }
  if (bd.notFound || !bd.activity) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm" style={{ background: '#fbf6e8', color: '#6b6142', fontFamily: FONT.body }}>
        Reportage non trovato.
      </div>
    )
  }

  const sections: BookPageSection[] = present.map((s, i) => ({
    key: s.key,
    label: s.title,
    href: `${basePath}/sezione/${i + 1}`,
  }))

  if (!current) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm" style={{ background: '#fbf6e8', color: '#6b6142', fontFamily: FONT.body }}>
        Questa sezione non è ancora disponibile per questo Reportage.
      </div>
    )
  }

  const gpsPoints = bd.activity.trackPoints.filter(p => p.lat !== undefined && p.lon !== undefined)
  const dateISO = bd.activity.startTime.slice(0, 10)

  const widget = current.narrativeIndex == null
    ? renderReportFixedWidget(current.key as ReportFixedSectionKey, {
        activity: bd.activity, data: bd.data, natura: bd.natura, hasGps: bd.hasGps, gpsPoints, dateISO,
        onOpenMap3D: onOpenMap3D ?? (() => {}), pois: bd.pois, poiWikiEntries: bd.poiWikiEntries,
        highlightedPoiId, onPoiTap: (poiId: number) => setHighlightedPoiId(prev => prev === poiId ? null : poiId),
        photos: bd.photos, onPhotoTap: (photoId: string) => {
          const i = bd.photos.findIndex(p => p.id === photoId)
          if (i >= 0) setLightboxIndex(i)
        }, onPhotosChange: bd.onPhotosChange,
      })
    : null

  const chapterBody = current.narrativeIndex != null ? narrativeChapters[current.narrativeIndex]?.body : undefined

  return (
    <BookPage
      diarioTitle={diarioTitle}
      indexHref={basePath}
      sectionLabel={current.title}
      prevHref={idx > 0 ? `${basePath}/sezione/${idx}` : undefined}
      nextHref={idx < present.length - 1 ? `${basePath}/sezione/${idx + 2}` : basePath}
      sections={sections}
      currentSectionKey={current.key}
      pageLabel={`${idx + 1} di ${present.length}`}
    >
      <h1 style={{ fontFamily: FONT.display, fontWeight: 600, fontSize: 22, color: '#3f3a22', margin: '0 0 14px' }}>
        {current.title}
      </h1>
      {chapterBody?.trim() && (
        <div style={{ fontFamily: FONT.lora, fontSize: 14.5, lineHeight: 1.7, color: '#4a4530', marginBottom: 16 }}>
          <MagazineBody body={chapterBody} />
        </div>
      )}
      {widget}
      {!content.trim() && (
        <ReportGenerationPanel
          activityId={activityId}
          activityTitle={bd.activity.title ?? 'Escursione'}
          hasContent={false}
          photos={bd.photos}
          onGenerated={setOverrideContent}
        />
      )}
      {lightboxIndex != null && (
        <PhotoLightbox photos={bd.photos} index={lightboxIndex} onNavigate={setLightboxIndex} onClose={() => setLightboxIndex(null)} />
      )}
    </BookPage>
  )
}
