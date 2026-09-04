'use client'
// Una sezione del Reportage come pagina del libro — vedi /root/.claude/plans/logical-munching-kahan.md,
// Fase 2. Stesso principio di GuideBookPage.tsx (mount/unmount reale, una sezione alla volta,
// stessa estrazione di Fase 0). Differenza chiave rispetto a Guida: i capitoli narrativi
// ("Cronaca") non hanno una chiave stabile — sono titoli liberi scritti da Giulia o dall'utente —
// quindi qui la pagina è indirizzata da un indice numerico 1-based (vedi Fase 3,
// `.../reportage/[activityId]/sezione/[n]/page.tsx`), non da uno slug come per Guida.
//
// Ristrutturazione Diario/Mete (richiesta esplicita dell'utente): il Reportage ora si allinea
// interamente allo stile "a libro" già usato per la Guida — generazione AI inline quando manca
// ancora contenuto (stesso principio di GuideGenerationPanel dentro GuideBookPage.tsx), editor
// testuale assistito e rigenerazione raggiungibili dal drawer "Strumenti" (ReportageToolsDrawer,
// stesso ruolo di PercorsoToolsDrawer.tsx), "Indice" e il giro di boa a fine libro che tornano al
// Sommario del Diario (non più a una vista estesa).
import { useEffect, useMemo, useState } from 'react'
import BookPage, { type BookPageSection } from './BookPage'
import { useReportageBookData } from '@/app/diari/[id]/percorsi/[percorsoId]/reportage/[activityId]/useReportageBookData'
import { buildReportDisplaySections, renderReportFixedWidget, HIKING_ONLY_FIXED_SECTIONS, type DisplaySection } from '@/lib/resoconto/reportDisplaySections'
import { metaHasHikingMetrics } from '@/lib/metaTypes'
import { parseSections, sectionsToMarkdown, markdownToSections, SCAFFOLD_SECTIONS, type ReportSection, type ReportAuthoredBy } from '@/lib/reportStore'
import { getReport, saveReportContent } from '@/lib/sync/hikeReportStore'
import type { ReportFixedSectionKey } from '@/components/resoconto/sectionStyle'
import { PhotoLightbox } from '@/app/resoconto/[id]/PhotoLightbox'
import { FONT } from '@/lib/designTokens'
import { TACCUINO_PAPER, TACCUINO_INK, TACCUINO_RULED_TEXT_STYLE } from '@/lib/taccuinoTokens'
import { Loader2 } from 'lucide-react'
import MagazineBody from '@/components/editorial/MagazineBody'
import ReportGenerationPanel from './ReportGenerationPanel'
import ReportageToolsDrawer from './ReportageToolsDrawer'
import ManualEditor from '@/app/components/ManualEditor'

const ALWAYS_PRESENT: ReportFixedSectionKey[] = ['dati_punteggi', 'andamento']

function isSectionPresent(s: DisplaySection, hasNatura: boolean, hasLuoghi: boolean, hasPhotos: boolean, hikingMetrics: boolean): boolean {
  if (s.narrativeIndex != null) return true
  const key = s.key as ReportFixedSectionKey
  // "Dati e punteggi"/"Andamento" restano sempre presenti solo per un sentiero — per una Meta
  // senza traccia GPS (Borgo/Città/Sito) buildReportDisplaySections le esclude già a monte
  // dall'elenco (vedi HIKING_ONLY_FIXED_SECTIONS), questo controllo è solo una difesa in più.
  if (ALWAYS_PRESENT.includes(key)) return hikingMetrics || !HIKING_ONLY_FIXED_SECTIONS.includes(key)
  if (key === 'natura') return hasNatura
  if (key === 'poi') return hasLuoghi
  if (key === 'galleria_foto') return hasPhotos
  return false
}

interface Props {
  /** Base path del Reportage nel Diario (es. `/diari/{id}/percorsi/{percorsoId}/reportage/{activityId}`). */
  basePath: string
  /** URL del Sommario del Diario — stesso ruolo di `diarioHref` in GuideBookPage.tsx. */
  diarioHref: string
  diarioTitle: string
  activityId: string
  /** 1-based, coerente con la route `.../sezione/[n]`. */
  pageIndex: number
  onOpenMap3D?: () => void
  /** `pageIndex` fuori dall'intervallo valido [1, numero di sezioni presenti] — capita quando una
   *  rigenerazione cambia il numero di capitoli dopo che un link a `pageIndex` è già stato aperto
   *  (Fase 3, docs/diario-a-libro-piano.md: "clamp/redirect esplicito"). Il chiamante (la route
   *  `.../sezione/[n]/page.tsx`) decide cosa fare — di norma redirect a `sezione/1` — la scelta di
   *  routing resta lì, non qui. */
  onInvalidPageIndex?: (presentCount: number) => void
}

export default function ReportBookPage({ basePath, diarioHref, diarioTitle, activityId, pageIndex, onOpenMap3D, onInvalidPageIndex }: Props) {
  const bd = useReportageBookData(activityId)
  const [highlightedPoiId, setHighlightedPoiId] = useState<number | null>(null)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [toolsOpen, setToolsOpen] = useState(false)
  const [editorMode, setEditorMode] = useState<'view' | 'manual'>('view')
  // useReportageBookData non espone un setter per il contenuto (Fase 1, loader magro): il testo
  // appena generato dal pannello inline sotto arriva qui via callback, non da un refetch — stesso
  // principio del pannello Guida (GuideGenerationPanel), ma lì il refetch di getPlannedById era
  // comunque necessario per gli altri campi persistiti (cachedGuideNotices/Sources), qui il solo
  // testo basta.
  const [overrideContent, setOverrideContent] = useState<string | null>(null)
  const content = overrideContent ?? bd.content

  // Struttura a sezioni dell'editor manuale (hike_reports.sections) — non fa parte di
  // useReportageBookData (che espone solo `content`, il markdown già appiattito): fetch separato,
  // stesso principio di ReportReader.tsx.
  const [reportSections, setReportSections] = useState<ReportSection[]>([])
  const [reportAuthoredBy, setReportAuthoredBy] = useState<ReportAuthoredBy>('ai')
  useEffect(() => {
    getReport(activityId).then(rep => {
      if (rep?.sections?.length) setReportSections(rep.sections)
      if (rep?.authored_by) setReportAuthoredBy(rep.authored_by)
    }).catch(() => {})
  }, [activityId])

  async function saveSections(sections: ReportSection[], authoredBy: ReportAuthoredBy) {
    const newContent = sectionsToMarkdown(sections)
    await saveReportContent(activityId, newContent, sections, authoredBy)
    setReportSections(sections)
    setReportAuthoredBy(authoredBy)
    setOverrideContent(newContent)
  }

  function startManualEditor() {
    const hasContent = !!content.trim()
    if (reportSections.length === 0) {
      setReportSections(hasContent ? markdownToSections(content) : SCAFFOLD_SECTIONS)
      if (!hasContent) setReportAuthoredBy('manual')
      else if (reportAuthoredBy === 'ai') setReportAuthoredBy('mixed')
    }
    setEditorMode('manual')
  }

  const hikingMetrics = metaHasHikingMetrics(bd.activity?.metaType)
  const narrativeChapters = useMemo(() => parseSections(content), [content])
  const displaySections = useMemo(() => buildReportDisplaySections(content, hikingMetrics), [content, hikingMetrics])

  const hasNatura = bd.natura.hasGps && !!bd.natura.flora?.available
  const hasLuoghi = bd.pois.length > 0 || bd.poiWikiEntries.length > 0
  const hasPhotos = bd.photos.length > 0

  const present = useMemo(
    () => displaySections.filter(s => isSectionPresent(s, hasNatura, hasLuoghi, hasPhotos, hikingMetrics)),
    [displaySections, hasNatura, hasLuoghi, hasPhotos, hikingMetrics],
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
      <div className="min-h-screen flex items-center justify-center" style={{ background: TACCUINO_PAPER.base }}>
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: TACCUINO_INK.handMuted }} />
      </div>
    )
  }
  if (bd.notFound || !bd.activity) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm" style={{ background: TACCUINO_PAPER.base, color: TACCUINO_INK.handMuted, fontFamily: FONT.body }}>
        Reportage non trovato.
      </div>
    )
  }

  if (editorMode === 'manual') {
    return (
      <div className="max-w-[900px] mx-auto px-4 pt-6 pb-12">
        <ManualEditor
          activityId={activityId}
          activity={bd.activity}
          photos={bd.photos}
          onPhotosChange={bd.onPhotosChange}
          initialSections={reportSections.length > 0 ? reportSections : SCAFFOLD_SECTIONS}
          initialAuthoredBy={reportAuthoredBy}
          onSave={saveSections}
          onCancel={() => setEditorMode('view')}
        />
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
      <div className="min-h-screen flex items-center justify-center text-sm" style={{ background: TACCUINO_PAPER.base, color: TACCUINO_INK.handMuted, fontFamily: FONT.body }}>
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
    <>
      <ReportageToolsDrawer
        open={toolsOpen}
        onClose={() => setToolsOpen(false)}
        activityId={activityId}
        activityTitle={bd.activity.title ?? 'Escursione'}
        hasContent={!!content.trim()}
        photos={bd.photos}
        onGenerated={setOverrideContent}
        onOpenEditor={startManualEditor}
      />
      <BookPage
        diarioTitle={diarioTitle}
        indexHref={diarioHref}
        onToolsClick={() => setToolsOpen(true)}
        sectionLabel={current.title}
        prevHref={idx > 0 ? `${basePath}/sezione/${idx}` : undefined}
        nextHref={idx < present.length - 1 ? `${basePath}/sezione/${idx + 2}` : basePath}
        sections={sections}
        currentSectionKey={current.key}
        pageLabel={`${idx + 1} di ${present.length}`}
        theme="taccuino"
      >
        <h1 style={{ fontFamily: FONT.display, fontWeight: 600, fontSize: 22, color: TACCUINO_INK.typed, margin: '0 0 14px', ...TACCUINO_RULED_TEXT_STYLE }}>
          {current.title}
        </h1>
        {chapterBody?.trim() && (
          <div style={{ fontFamily: FONT.lora, fontSize: 14.5, color: TACCUINO_INK.hand, marginBottom: 16, ...TACCUINO_RULED_TEXT_STYLE }}>
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
    </>
  )
}
