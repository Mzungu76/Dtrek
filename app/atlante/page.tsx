'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import Navbar, { MOBILE_BOTTOMBAR_SPACER } from '@/components/Navbar'
import { TACCUINO_PAPER, TACCUINO_INK, TACCUINO_RULED_TEXT_STYLE, TaccuinoPaperTexture, TaccuinoRuledLines } from '@/lib/taccuinoTokens'
import { FONT } from '@/lib/designTokens'
import type { AllPercorsiRow } from '@/app/api/percorsi/route'
import { BookMarked, ChevronRight, Compass, Loader2, MapPin, Search, Sparkles } from 'lucide-react'

interface TavolaProps {
  href: string
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  title: string
  subtitle: string
  count: number | null
}

function Tavola({ href, icon: Icon, title, subtitle, count }: TavolaProps) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 py-3"
      style={{ borderBottom: `1px dotted ${TACCUINO_PAPER.cardBorder}` }}
    >
      <span className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: TACCUINO_PAPER.card, border: `1px solid ${TACCUINO_PAPER.cardBorder}` }}>
        <Icon className="w-4 h-4" style={{ color: TACCUINO_INK.hand }} />
      </span>
      <div className="min-w-0 flex-1">
        <p style={{ fontFamily: FONT.lora, fontWeight: 600, fontSize: 14, color: TACCUINO_INK.typed }}>{title}</p>
        <p style={{ fontSize: 11, color: TACCUINO_INK.handMuted }}>{subtitle}</p>
      </div>
      {count !== null && (
        <span style={{ fontFamily: FONT.mono, fontSize: 12, fontWeight: 700, color: TACCUINO_INK.hand }}>{count}</span>
      )}
      <ChevronRight className="w-4 h-4 shrink-0" style={{ color: TACCUINO_INK.handMuted }} />
    </Link>
  )
}

/**
 * "Atlante" — il secondo libro della Libreria: dove potresti andare, non ciò che è già tuo
 * (docs/libreria-atlante-piano.md, Fase 2). Un unico Atlante, sempre presente, non uno scaffale
 * fra gli altri.
 *
 * Quattro tavole, tre delle quali già esistevano come pagine orfane prima di questo restyling:
 * qui diventano solo punti d'accesso raggiungibili, con un conteggio reale — il contenuto vero
 * resta dove viveva (/percorsi-per-te, /profilo/ricerche-salvate), niente duplicato.
 */
export default function AtlantePage() {
  const [salvateCount, setSalvateCount] = useState<number | null>(null)
  const [ricercheCount, setRicercheCount] = useState<number | null>(null)
  const [proposteCount, setProposteCount] = useState<number | null>(null)

  useEffect(() => {
    fetch('/api/percorsi')
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((rows: AllPercorsiRow[]) => setSalvateCount(rows.filter(r => r.reportageCount === 0 && !r.diaryId).length))
      .catch(() => setSalvateCount(null))

    fetch('/api/route-build/search-history')
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((d: { searches: unknown[] }) => setRicercheCount(d.searches.length))
      .catch(() => setRicercheCount(null))

    fetch('/api/percorsi-per-te')
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((d: { cards: unknown[] }) => setProposteCount(d.cards.length))
      .catch(() => setProposteCount(null))
  }, [])

  return (
    <div className={`relative min-h-screen ${MOBILE_BOTTOMBAR_SPACER}`}>
      <TaccuinoPaperTexture />
      <TaccuinoRuledLines />
      <Navbar />

      <div className="max-w-[520px] mx-auto px-4 sm:px-8" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 28px)', paddingBottom: 40 }}>
        <p style={{ fontFamily: FONT.barlow, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.18em', fontSize: 10.5, color: TACCUINO_INK.hand, ...TACCUINO_RULED_TEXT_STYLE }}>
          Il libro delle mete
        </p>
        <div className="flex items-center gap-2 mt-1 mb-1.5">
          <Compass className="w-6 h-6" style={{ color: TACCUINO_INK.typed }} />
          <h1 style={{ fontFamily: FONT.lora, fontWeight: 700, fontSize: 26, color: TACCUINO_INK.typed }}>Atlante</h1>
        </div>
        <p style={{ fontSize: 12.5, color: TACCUINO_INK.hand, ...TACCUINO_RULED_TEXT_STYLE }} className="mb-5 max-w-[42ch]">
          Contiene ciò che non è ancora tuo. Quando decidi di andarci, lo trascrivi in un Diario — e da lì in poi vive lì.
        </p>

        <Link
          href="/percorsi/cerca"
          className="flex items-center gap-3 h-12 px-4 rounded-full mb-6"
          style={{ background: TACCUINO_PAPER.card, border: `1px solid ${TACCUINO_PAPER.cardBorder}`, color: TACCUINO_INK.handMuted }}
        >
          <Search className="w-4 h-4 shrink-0" />
          <span style={{ fontSize: 13 }}>Cerca un luogo, un sentiero, un borgo, un sito&hellip;</span>
        </Link>

        <p className="mb-1" style={{ fontFamily: FONT.barlow, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: 10, color: TACCUINO_INK.hand }}>
          Le tavole
        </p>
        <div className="flex flex-col">
          <Tavola href="/atlante/salvate" icon={BookMarked} title="Salvate" subtitle="Messe da parte mentre cercavi" count={salvateCount} />
          <Tavola href="/percorsi/cerca/luoghi" icon={MapPin} title="Vicino a te" subtitle="Cerca sulla carta, dalla tua posizione" count={null} />
          <Tavola href="/profilo/ricerche-salvate" icon={Search} title="Ricerche salvate" subtitle="Le tue ricerche" count={ricercheCount} />
          <Tavola href="/percorsi-per-te" icon={Sparkles} title="Proposte per te" subtitle="Mete suggerite in base ai tuoi gusti" count={proposteCount} />
        </div>

        {salvateCount === null && ricercheCount === null && proposteCount === null && (
          <div className="flex items-center justify-center py-8 gap-2" style={{ color: TACCUINO_INK.handMuted }}>
            <Loader2 className="w-4 h-4 animate-spin" /><span style={{ fontSize: 12 }}>Caricamento…</span>
          </div>
        )}
      </div>
    </div>
  )
}
