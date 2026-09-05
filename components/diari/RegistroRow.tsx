// Riga di registro — un Diario nell'elenco "attivo" (stagione corrente) di /diari. Sostituisce la
// copertina a piena tela del vecchio scaffale: dorso colorato, titolo, etichette, metriche reali.
// docs/diari-restyling-piano.md, Fase 1.
//
// Niente sparkline "di tendenza": senza uno storico mensile reale per Diario sarebbe un numero
// finto (vedi la guardia "niente data slop" del piano di design) — la riga mostra solo dati che
// l'endpoint restituisce davvero.
import Link from 'next/link'
import { FONT } from '@/lib/designTokens'
import { TACCUINO_PAPER, TACCUINO_INK, TACCUINO_ACCENT, TACCUINO_ACCENT_SECONDARY, TACCUINO_ACCENT_TINT } from '@/lib/taccuinoTokens'
import type { DiarySummary } from '@/lib/diari/aggregateDiaries'

// Palette dei dorsi — stessa direzione "Taccuino Botanico" di lib/taccuinoTokens.tsx, un giro
// deterministico per indice così lo stesso Diario ha sempre lo stesso colore tra un caricamento e
// l'altro (nessuno stato da persistere solo per questo).
const DORSI = [
  'linear-gradient(180deg,#C0603D,#8A3D26)',
  'linear-gradient(180deg,#7C8F6E,#4A5A3F)',
  'linear-gradient(180deg,#A89A78,#5E564C)',
  'linear-gradient(180deg,#8A6A46,#3A352B)',
  'linear-gradient(180deg,#5F7355,#2E3A26)',
]

function formatUltimaUscita(iso: string | null): string {
  if (!iso) return 'nessuna uscita'
  const d = new Date(iso)
  return `ultima ${d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}`
}

interface Props {
  diario: DiarySummary
  indiceColore: number
}

export function RegistroRow({ diario, indiceColore }: Props) {
  return (
    <Link
      href={`/diari/${encodeURIComponent(diario.id)}`}
      className="flex items-stretch gap-3 rounded-xl overflow-hidden"
      style={{ background: TACCUINO_PAPER.card, border: `1px solid ${TACCUINO_PAPER.cardBorder}` }}
    >
      <span className="w-2 shrink-0" style={{ background: DORSI[indiceColore % DORSI.length] }} />
      <div className="flex-1 min-w-0 py-2.5 pr-2.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span style={{ fontFamily: FONT.lora, fontWeight: 600, fontSize: 14, color: TACCUINO_INK.typed, lineHeight: 1.15 }}>
            {diario.title}
          </span>
          {diario.isDefault && (
            <span
              className="px-1.5 py-0.5 rounded"
              style={{ background: TACCUINO_ACCENT_TINT, color: TACCUINO_ACCENT[600], fontSize: 8.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}
            >
              Default
            </span>
          )}
          {diario.labels.map(etichetta => (
            <span
              key={etichetta}
              className="px-1.5 py-0.5 rounded"
              style={{ background: TACCUINO_PAPER.light, border: `1px solid ${TACCUINO_PAPER.cardBorder}`, color: TACCUINO_INK.hand, fontSize: 8.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}
            >
              {etichetta}
            </span>
          ))}
        </div>
        <p style={{ fontSize: 10.5, color: TACCUINO_INK.handMuted, marginTop: 3 }}>
          {diario.reportageCount === 0
            ? 'nessun reportage'
            : `${diario.reportageCount} reportage · ${(diario.distanceMeters / 1000).toFixed(0)} km · +${Math.round(diario.elevationGain)} m`}
          {' · '}{formatUltimaUscita(diario.lastActivityAt)}
        </p>
      </div>
      {diario.pubblicabile && (
        <span className="self-center pr-3" style={{ color: TACCUINO_ACCENT_SECONDARY, fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Pubblicabile
        </span>
      )}
    </Link>
  )
}
