// Articolo di una singola escursione sul sito pubblico del Diario, e scheda compatta per le
// escursioni senza racconto. Estratto da DiaryPublicView quando il link è diventato un sito con
// una pagina per escursione: lo stesso articolo serve alla home (in anteprima) e alla sua pagina.

import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { Route as RouteIcon, Mountain, Clock } from 'lucide-react'
import { parseSections } from '@/lib/reportStore'
import { parseMarkupBlocks, parseInlineEmphasis } from '@/lib/guideMarkup'
import { formatDuration } from '@/lib/tcxParser'
import { bucketPhotosByChapter } from '@/lib/photoBuckets'
import { formatPublicDate } from '@/lib/privacy/formatPublicDate'
import type { PublicDiaryEntry, PublicDiaryPhoto } from '@/lib/sharePublicDiary'
import type { DiaryPublicSections } from '@/lib/diaryConfig'
import { RouteSketch } from './RouteSketch'
import { RouteMap } from './RouteMap'
import { LocatorMap } from '@/components/LocatorMap'

/** Il corpo dei resoconti è markdown: gli asterischi dell'enfasi vanno resi, non stampati. */
function Inline({ text }: { text: string }) {
  return (
    <>
      {parseInlineEmphasis(text).map((seg, i) =>
        seg.bold ? <strong key={i} className="font-semibold text-stone-800">{seg.text}</strong> : <span key={i}>{seg.text}</span>,
      )}
    </>
  )
}

function StatCell({ icon, value, label }: { icon?: React.ReactNode; value: string; label: string }) {
  return (
    <div className="flex-1 min-w-0 px-3 py-3 text-center">
      <div className="flex items-center justify-center gap-1 text-forest-700">
        {icon}
        <span className="font-mono text-base font-bold leading-none">{value}</span>
      </div>
      <div className="text-[9px] font-semibold text-stone-400 uppercase tracking-wider mt-1">{label}</div>
    </div>
  )
}

export function EntryStats({ entry }: { entry: PublicDiaryEntry }) {
  return (
    <div className="flex items-stretch divide-x divide-stone-100 border-y border-stone-100 my-5">
      <StatCell icon={<RouteIcon className="w-3.5 h-3.5 text-stone-300" />} value={`${(entry.distanceMeters / 1000).toFixed(1)}`} label="km" />
      <StatCell icon={<Mountain className="w-3.5 h-3.5 text-stone-300" />} value={`${Math.round(entry.elevationGain)}`} label="m D+" />
      {entry.totalTimeSeconds > 0 && (
        <StatCell icon={<Clock className="w-3.5 h-3.5 text-stone-300" />} value={formatDuration(entry.totalTimeSeconds)} label="in cammino" />
      )}
      {entry.altitudeMax != null && (
        <StatCell value={`${Math.round(entry.altitudeMax)}`} label="quota max" />
      )}
    </div>
  )
}

export function PhotoGrid({ photos }: { photos: PublicDiaryPhoto[] }) {
  if (photos.length === 0) return null
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mt-6">
      {photos.map((p, i) => (
        <figure key={i} className="min-w-0">
          {/* `loading="lazy"` non è un dettaglio: un diario con dieci escursioni può avere un
              centinaio di foto a piena risoluzione, e chi apre il link spesso è in mobilità. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.url} alt={p.caption ?? ''} loading="lazy" decoding="async"
            className="w-full aspect-[4/3] object-cover rounded-xl bg-stone-100" />
          {p.caption && (
            <figcaption className="text-[11px] font-lora italic text-stone-400 text-center mt-1.5 leading-snug">
              {p.caption}
            </figcaption>
          )}
        </figure>
      ))}
    </div>
  )
}

/**
 * Foto incastonata nel testo, con il paragrafo che le scorre accanto.
 *
 * Il float parte solo da `sm:` in su: sotto i 640 px la colonna è troppo stretta perché testo e
 * immagine convivano affiancati, e una foto al 46% lascerebbe righe da quattro parole. Su mobile
 * resta quindi un blocco a piena larghezza — spezza comunque il muro di testo, che è lo scopo.
 * La `<section>` che le contiene ha `flow-root`, così il float è contenuto dalla sezione e non
 * sborda in quella successiva.
 */
function InlineFigure({ photo, side }: { photo: PublicDiaryPhoto; side: 'left' | 'right' }) {
  return (
    <figure className={`my-4 sm:w-[46%] sm:mb-3 ${side === 'right' ? 'sm:float-right sm:ml-5' : 'sm:float-left sm:mr-5'}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photo.url} alt={photo.caption ?? ''} loading="lazy" decoding="async"
        className="w-full aspect-[4/3] object-cover rounded-xl bg-stone-100" />
      {photo.caption && (
        <figcaption className="text-[11px] font-lora italic text-stone-400 mt-1.5 leading-snug">
          {photo.caption}
        </figcaption>
      )}
    </figure>
  )
}

/** Ogni quanti paragrafi si incastona una foto. Due è il passo che spezza il testo senza che la
 *  pagina diventi un collage: con paragrafi da 5-8 righe cade una foto ogni schermata scarsa. */
const PARAGRAPHS_PER_PHOTO = 2

/** Escursione con un racconto: articolo completo. */
export function EntryArticle({ entry, n, show, hideExactDate = false }: { entry: PublicDiaryEntry; n: number; show: DiaryPublicSections; hideExactDate?: boolean }) {
  const sections = show.racconto ? parseSections(entry.content).filter(s => s.body.trim()) : []

  // La prima foto fa da apertura in cima all'articolo: nel corpo si riparte dalla seconda, per non
  // ritrovarsi la stessa immagine due volte a poche righe di distanza.
  const bodyPhotos = show.foto ? entry.photos.slice(1) : []
  // Le foto seguono il racconto: ogni capitolo riceve quelle scattate durante la sua fetta di
  // cammino, invece di essere impilate tutte in fondo (lib/photoBuckets.ts).
  const buckets = bucketPhotosByChapter(bodyPhotos, Math.max(1, sections.length))

  // Quel che avanza da un capitolo — perché aveva più foto che paragrafi — confluisce nella
  // galleria di chiusura, così nessuna foto sparisce.
  const leftovers: PublicDiaryPhoto[] = []
  let figureCount = 0

  const renderedSections = sections.map((section, si) => {
    const queue = [...(buckets[si] ?? [])]
    const nodes: React.ReactNode[] = []
    let paragraphs = 0

    parseMarkupBlocks(section.body).forEach((block, bi) => {
      if (block.type === 'curiosita') {
        nodes.push(
          <aside key={`b${bi}`} className="my-4 rounded-r-xl border-l-[3px] border-terra-500 bg-terra-50/60 px-4 py-3">
            <p className="font-lora italic text-[15px] leading-relaxed text-stone-600">
              <Inline text={block.text} />
            </p>
          </aside>,
        )
        return
      }
      if (block.type === 'avviso') {
        nodes.push(
          <aside key={`b${bi}`} className="my-4 rounded-r-xl border-l-[3px] border-amber-500 bg-amber-50 px-4 py-3">
            <p className="text-sm leading-relaxed text-amber-900"><Inline text={block.text} /></p>
          </aside>,
        )
        return
      }
      if (block.type === 'subsection') {
        nodes.push(
          <h4 key={`b${bi}`} className="font-display font-bold text-base text-forest-800 mt-5 mb-1.5">
            {block.text}
          </h4>,
        )
        return
      }
      nodes.push(
        <p key={`b${bi}`} className="font-lora text-[15px] leading-[1.75] text-stone-600 mb-3.5">
          <Inline text={block.text} />
        </p>,
      )
      paragraphs++
      if (paragraphs % PARAGRAPHS_PER_PHOTO === 0 && queue.length > 0) {
        const photo = queue.shift()!
        // Lati alternati lungo tutto l'articolo, non per capitolo: due capitoli brevi di fila non
        // producono due foto affiancate dallo stesso lato.
        nodes.push(<InlineFigure key={`f${bi}`} photo={photo} side={figureCount++ % 2 === 0 ? 'right' : 'left'} />)
      }
    })

    leftovers.push(...queue)

    return (
      // `flow-root` contiene i float delle foto dentro la sezione che le ospita.
      <section key={si} className="mt-6 first:mt-0 flow-root">
        <h3 className="font-barlow font-bold text-[11px] tracking-[0.2em] uppercase text-terra-500 mb-2">
          {section.title}
        </h3>
        {nodes}
      </section>
    )
  })

  return (
    <article id={`esc-${n}`} className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden scroll-mt-16">
      {show.foto && entry.photos[0] && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={entry.photos[0].url} alt="" loading="lazy" decoding="async"
          className="w-full aspect-[16/9] object-cover bg-stone-100" />
      )}

      <div className="p-5 sm:p-7">
        <p className="font-barlow font-bold text-[10px] tracking-[0.2em] uppercase text-terra-500">
          Escursione #{String(n).padStart(2, '0')} · {format(new Date(entry.startTime), 'MMMM yyyy', { locale: it })}
        </p>
        <h2 className="font-display text-2xl sm:text-3xl font-bold text-forest-900 leading-tight mt-1.5">
          {entry.title}
        </h2>
        <p className="text-xs text-stone-400 mt-1.5">
          {formatPublicDate(entry.startTime, hideExactDate)}
        </p>

        <EntryStats entry={entry} />

        {show.percorso && entry.polyline && (
          // Percorso e inquadramento affiancati: la mappa del percorso dice com'è fatto il giro,
          // quella dell'Italia dice dove si trova. Da sola, la prima lascia chi legge senza
          // riferimenti — una traccia fra due boschi può stare ovunque.
          <div className="mb-6 flex gap-3 items-start">
            <div className="flex-1 min-w-0">
              <RouteMap
              polyline={entry.polyline}
                photoProgress={entry.photos.map(p => p.progress).filter((p): p is number => p != null)}
              />
              <p className="text-[10px] text-stone-400 text-center mt-1.5">
                Partenza, arrivo e punti in cui sono state scattate le foto
              </p>
            </div>
            <div className="w-[104px] sm:w-[132px] shrink-0">
              <LocatorMap lat={entry.polyline[0][0]} lon={entry.polyline[0][1]} label={entry.title} />
            </div>
          </div>
        )}

        {renderedSections}

        <div className="clear-both" />
        <PhotoGrid photos={leftovers} />
      </div>
    </article>
  )
}

/**
 * Escursione senza racconto: scheda compatta.
 *
 * Un resoconto le cui sezioni esistono ma sono vuote (`## Titolo` e nient'altro) non ha una
 * storia da raccontare — nel PDF queste occupavano due pagine intere a testa, con una fascia
 * fotografica scura vuota e uno spazio narrativo bianco. Qui l'escursione resta nel diario, perché
 * è successa davvero, ma senza fingere un contenuto che non c'è.
 */
export function EntryCard({ entry, n, hideExactDate = false }: { entry: PublicDiaryEntry; n: number; hideExactDate?: boolean }) {
  return (
    <article id={`esc-${n}`} className="bg-white rounded-3xl border border-stone-200 shadow-sm p-5 flex gap-4 items-center scroll-mt-16">
      {entry.photos[0]
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={entry.photos[0].url} alt="" loading="lazy" decoding="async"
            className="w-20 h-20 sm:w-24 sm:h-24 object-cover rounded-2xl shrink-0 bg-stone-100" />
        : entry.polyline
          ? <div className="w-20 sm:w-24 shrink-0"><RouteSketch polyline={entry.polyline} /></div>
          : <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl shrink-0 bg-stone-100" />
      }
      <div className="min-w-0 flex-1">
        <p className="font-barlow font-bold text-[9px] tracking-[0.2em] uppercase text-terra-500">
          Escursione #{String(n).padStart(2, '0')}
        </p>
        <h2 className="font-display text-lg font-bold text-forest-900 leading-tight mt-0.5 truncate">
          {entry.title}
        </h2>
        <p className="text-xs text-stone-400 mt-0.5">
          {formatPublicDate(entry.startTime, hideExactDate)}
        </p>
        <p className="font-mono text-xs text-stone-500 mt-1.5">
          {(entry.distanceMeters / 1000).toFixed(1)} km · {Math.round(entry.elevationGain)} m D+
          {entry.totalTimeSeconds > 0 && ` · ${formatDuration(entry.totalTimeSeconds)}`}
        </p>
      </div>
    </article>
  )
}

