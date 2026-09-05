// Rail delle tre fasi in cima a /diari — Fase 1 di docs/diari-restyling-piano.md, versione A
// ("Plancia di campo") del restyling. Dice a colpo d'occhio cosa fa Dtrek — pianifichi, navighi,
// registri — prima ancora di mostrare un solo Diario, che è il motivo per cui esiste questo
// componente e non solo l'elenco dei Diari.
//
// I conteggi sono entrambi dati di server, non IndexedDB: "tracce offline" del mockup (locale al
// telefono, vive dentro Navigator — lib/offline/packageManager.ts) è diventato "percorsi con
// traccia pronta" — le Mete che hanno già un tracciato GPS e possono essere navigate, dato che
// l'app principale può leggere senza aprire Navigator (vedi il piano, "due buchi di dati").
import Link from 'next/link'
import { Compass, Navigation2, NotebookPen } from 'lucide-react'
import { FONT } from '@/lib/designTokens'
import { TACCUINO_PAPER, TACCUINO_INK, TACCUINO_ACCENT, TACCUINO_ACCENT_TINT } from '@/lib/taccuinoTokens'

interface Props {
  metePronteCount: number
  percorsiConTracciaCount: number
  reportageTotali: number
}

function Fase({ numero, icon: Icon, nome, meta, href, attiva }: {
  numero: string
  icon: typeof Compass
  nome: string
  meta: string
  href?: string
  attiva?: boolean
}) {
  const content = (
    <div
      className="flex flex-col gap-1 px-2.5 py-2.5 h-full"
      style={attiva ? { background: TACCUINO_ACCENT_TINT } : undefined}
    >
      <div className="flex items-center gap-1.5" style={{ color: attiva ? TACCUINO_ACCENT[600] : TACCUINO_INK.hand }}>
        <span style={{ fontFamily: FONT.mono, fontWeight: 700, fontSize: 8.5, letterSpacing: '0.06em' }}>{numero}</span>
        <Icon className="w-3.5 h-3.5" />
      </div>
      <p style={{ fontFamily: FONT.barlow, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em', fontSize: 11, color: attiva ? TACCUINO_ACCENT[600] : TACCUINO_INK.typed, lineHeight: 1 }}>
        {nome}
      </p>
      <p style={{ fontSize: 10, color: attiva ? TACCUINO_ACCENT[600] : TACCUINO_INK.handMuted, lineHeight: 1.25 }}>{meta}</p>
    </div>
  )
  return (
    <div className="flex-1 min-w-0">
      {href ? <Link href={href} className="block h-full">{content}</Link> : content}
    </div>
  )
}

export function FasiRail({ metePronteCount, percorsiConTracciaCount, reportageTotali }: Props) {
  return (
    <div
      className="grid grid-cols-3 rounded-2xl overflow-hidden divide-x"
      style={{ background: TACCUINO_PAPER.card, border: `1px solid ${TACCUINO_PAPER.cardBorder}`, borderColor: TACCUINO_PAPER.cardBorder }}
    >
      <Fase numero="01" icon={Compass} nome="Pianifica" meta={`${metePronteCount} ${metePronteCount === 1 ? 'meta pronta' : 'mete pronte'}`} href="/percorsi" />
      <Fase numero="02" icon={Navigation2} nome="Naviga" meta={`${percorsiConTracciaCount} con traccia`} href="/navigatore" />
      <Fase numero="03" icon={NotebookPen} nome="Registra" meta={`${reportageTotali} reportage`} attiva />
    </div>
  )
}
