'use client'
import { useMemo } from 'react'
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

/**
 * Corpo "magazine" di una sezione: lead paragraph a piena larghezza, resto del testo su colonne
 * CSS (attive solo da `lg`, vedi classe `two` passata dal chiamante — su schermi più stretti la
 * colonna singola evita il problema di colonne troppo anguste insieme al sommario laterale),
 * callout `[curiosita]`/`[avviso]` e sottotitoli per-POI (usati dallo scroll-to-POI della mappa).
 */
export default function MagazineBody({ body, color, sectionPhoto, twoColumns }: { body: string; color: string; sectionPhoto?: string; twoColumns?: boolean }) {
  const blocks = useMemo(() => parseBlocks(body), [body])

  // First paragraph (lead) stands alone full-width; rest flow in columns
  const lead = blocks.find(b => b.type === 'lead')
  const rest  = blocks.filter(b => b !== lead)

  return (
    <div>
      {lead && (
        <p className="text-[17px] sm:text-[19px] leading-[1.75] italic text-stone-700 mb-6">
          {lead.text}
        </p>
      )}
      <div className={twoColumns ? 'lg:columns-2 lg:gap-8 print-columns-2' : 'print-columns-2'}>
        {sectionPhoto && (
          <div className="float-right ml-5 mb-4 w-[42%] sm:w-[38%]" style={{ columnSpan: 'none' as const }}>
            <div className="relative w-full h-40 rounded-sm shadow-sm overflow-hidden">
              <Image src={sectionPhoto} alt="" fill sizes="(max-width: 640px) 42vw, 38vw" className="object-cover" />
            </div>
            <p className="text-[9px] italic text-stone-400 mt-1">© Wikimedia Commons</p>
          </div>
        )}
        {rest.map((b, i) => {
          if (b.type === 'curiosita') {
            return (
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
            )
          }
          if (b.type === 'avviso') {
            return (
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
            )
          }
          if (b.type === 'subsection') {
            return (
              <h3
                key={i}
                id={slugifyHeading(b.text)}
                className="font-display text-[11px] font-bold tracking-[1.5px] uppercase mt-6 mb-2 scroll-mt-24"
                style={{ color, breakAfter: 'avoid' }}
              >
                {b.text}
              </h3>
            )
          }
          return (
            <p key={i} className="text-[15px] leading-7 text-stone-600 mb-4">
              {b.text}
            </p>
          )
        })}
      </div>
    </div>
  )
}
