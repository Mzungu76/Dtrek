'use client'
import { useMemo, type ReactNode } from 'react'
import Image from 'next/image'
import { slugifyHeading } from '@/lib/guideSlug'

interface Block { type: 'lead' | 'para' | 'curiosita' | 'avviso' | 'subsection'; text: string }

function parseBlocks(body: string): Block[] {
  const out: Block[] = []
  // [curiosita] e [avviso] sono blocchi delimitati su una riga dedicata (stessa convenzione di
  // [sottotitolo]/[indovinello]/[epoca], vedi app/api/guide/route.ts) — [avviso] segnala una
  // criticità reale e specifica trovata dalla ricerca web di Giulia sullo stato del percorso.
  const blockRe = /\[(curiosita|avviso)\]([\s\S]*?)\[\/\1\]/g
  let last = 0
  let m: RegExpExecArray | null
  let paraCount = 0

  const flushText = (chunk: string) => {
    let buf: string[] = []
    const flush = () => {
      const p = buf.join(' ').trim()
      if (p) {
        out.push({ type: paraCount === 0 ? 'lead' : 'para', text: p })
        paraCount++
        buf = []
      }
    }
    for (const line of chunk.split('\n')) {
      const t = line.trim()
      if (t.startsWith('### ')) { flush(); out.push({ type: 'subsection', text: t.slice(4) }) }
      else if (!t) flush()
      else buf.push(t)
    }
    flush()
  }

  while ((m = blockRe.exec(body)) !== null) {
    flushText(body.slice(last, m.index))
    out.push({ type: m[1] as 'curiosita' | 'avviso', text: m[2].trim().replace(/\n/g, ' ') })
    last = m.index + m[0].length
  }
  flushText(body.slice(last))
  return out
}

export interface ExtraPhoto { url: string; caption?: string }

interface Props {
  body: string
  color: string
  sectionPhoto?: string
  twoColumns?: boolean
  /** Didascalia sotto la foto — quando assente (Guida) resta "© Wikimedia Commons"; il
   *  chiamante (Resoconto: foto proprie dell'utente, con didascalia personale) la sovrascrive. */
  photoCaption?: string
  /** Nodo aggiuntivo mostrato prima della foto (Resoconto: mini-mappa del percorso con i pin
   *  foto sulla prima sezione) — assente per Guida. */
  extraFloatNode?: ReactNode
  /** Numero del pin foto (Resoconto: stesso numero della galleria/profilo altimetrico/PDF) —
   *  mostrato come pallino in alto a sinistra sulla foto. Assente per Guida. */
  photoIndexBadge?: number
  /** Resoconto-only: altre foto di questo capitolo (oltre a `sectionPhoto`, che resta la sola
   *  ancorata in alto a destra) — inserite a piena larghezza ogni due paragrafi, in stile
   *  reportage, invece di restare tutte compresse nello stesso riquadro fluttuante. Assente per
   *  Guida. */
  extraPhotos?: ExtraPhoto[]
}

/**
 * Corpo "magazine" di una sezione: lead paragraph a piena larghezza, resto del testo su colonne
 * CSS (attive solo da `lg`, vedi classe `two` passata dal chiamante — su schermi più stretti la
 * colonna singola evita il problema di colonne troppo anguste insieme al sommario laterale),
 * callout `[curiosita]`/`[avviso]` e sottotitoli per-POI (usati dallo scroll-to-POI della mappa).
 * Condiviso tra Guida (GuideReader) e Resoconto (ReportReader).
 */
export default function MagazineBody({ body, color, sectionPhoto, twoColumns, photoCaption, extraFloatNode, photoIndexBadge, extraPhotos }: Props) {
  const blocks = useMemo(() => parseBlocks(body), [body])

  // First paragraph (lead) stands alone full-width; rest flow in columns
  const lead = blocks.find(b => b.type === 'lead')
  const rest  = blocks.filter(b => b !== lead)

  // Foto extra inserite a piena larghezza dopo ogni 2° paragrafo di prosa (non conta subtitle/
  // curiosita/avviso) — un contatore locale al render, non ha bisogno di stato: la lista di foto
  // e il testo cambiano sempre insieme (stesso capitolo).
  let paraCount = 0
  let extraPhotoIdx = 0

  return (
    <div>
      {lead && (
        <p className="text-[17px] sm:text-[19px] leading-[1.75] italic text-stone-700 mb-6">
          {lead.text}
        </p>
      )}
      <div className={twoColumns ? 'lg:columns-2 lg:gap-8 print-columns-2' : 'print-columns-2'}>
        {extraFloatNode}
        {sectionPhoto && (
          <div className="float-right ml-5 mb-4 w-[42%] sm:w-[38%]" style={{ columnSpan: 'none' as const }}>
            <div className="relative w-full h-40 rounded-sm shadow-sm overflow-hidden">
              <Image src={sectionPhoto} alt="" fill sizes="(max-width: 640px) 42vw, 38vw" className="object-cover" />
              {photoIndexBadge != null && (
                <span className="absolute top-1.5 left-1.5 w-5 h-5 bg-amber-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {photoIndexBadge}
                </span>
              )}
            </div>
            <p className="text-[9px] italic text-stone-400 mt-1">{photoCaption ?? '© Wikimedia Commons'}</p>
          </div>
        )}
        {rest.flatMap((b, i) => {
          if (b.type === 'curiosita') {
            return [(
              <div
                key={i}
                className="my-5 rounded-xl bg-stone-50 border-l-2 pl-4 pr-4 py-3"
                style={{ borderColor: color, columnSpan: 'all' as const, breakInside: 'avoid' }}
              >
                <p className="text-[9px] font-bold tracking-[2.5px] uppercase mb-1.5" style={{ color }}>
                  ◆ Lo sapevi?
                </p>
                <p className="italic text-[14px] leading-relaxed text-stone-700">
                  {b.text}
                </p>
              </div>
            )]
          }
          if (b.type === 'avviso') {
            return [(
              <div
                key={i}
                className="my-5 rounded-sm overflow-hidden shadow-sm border border-amber-200"
                style={{ columnSpan: 'all' as const, breakInside: 'avoid' }}
              >
                <div className="flex">
                  <div className="w-1 flex-shrink-0 bg-amber-500" />
                  <div className="flex-1 px-4 py-3 bg-amber-50">
                    <p className="text-[9px] font-bold tracking-[2.5px] uppercase mb-1.5 text-amber-700">
                      ⚠ Stato del percorso
                    </p>
                    <p className="text-[14px] leading-relaxed text-amber-900">
                      {b.text}
                    </p>
                  </div>
                </div>
              </div>
            )]
          }
          if (b.type === 'subsection') {
            return [(
              <h3
                key={i}
                id={slugifyHeading(b.text)}
                className="font-display text-[11px] font-bold tracking-[1.5px] uppercase mt-6 mb-2 scroll-mt-24"
                style={{ color, breakAfter: 'avoid' }}
              >
                {b.text}
              </h3>
            )]
          }
          paraCount++
          const paragraph = (
            <p key={i} className="text-[15px] leading-7 text-stone-600 mb-4">
              {b.text}
            </p>
          )
          // Una foto extra ogni due paragrafi di prosa — resa come <figure> a piena larghezza,
          // fratello del paragrafo (non annidata: un <p> non può contenere un blocco a piena
          // larghezza senza invalidare l'HTML e rompere il flusso delle colonne CSS).
          if (extraPhotos && paraCount % 2 === 0 && extraPhotoIdx < extraPhotos.length) {
            const photo = extraPhotos[extraPhotoIdx++]
            const figure = (
              <figure
                key={`${i}-photo`}
                className="my-5 rounded-2xl overflow-hidden shadow-sm"
                style={{ columnSpan: 'all' as const, breakInside: 'avoid' }}
              >
                <div className="relative w-full h-56 sm:h-72">
                  <Image src={photo.url} alt="" fill sizes="(max-width: 1024px) 100vw, 52rem" className="object-cover" />
                </div>
                {photo.caption && (
                  <figcaption className="text-[10px] italic text-stone-400 mt-1.5 text-center px-2">{photo.caption}</figcaption>
                )}
              </figure>
            )
            return [paragraph, figure]
          }
          return [paragraph]
        })}
      </div>
    </div>
  )
}
