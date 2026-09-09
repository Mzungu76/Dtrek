// Riga di registro — un Diario nell'elenco "attivo" (stagione corrente) di /diari. Sostituisce la
// copertina a piena tela del vecchio scaffale: dorso colorato, titolo, etichette, metriche reali.
// docs/diari-restyling-piano.md, Fase 1.
//
// Niente sparkline "di tendenza": senza uno storico mensile reale per Diario sarebbe un numero
// finto (vedi la guardia "niente data slop" del piano di design) — la riga mostra solo dati che
// l'endpoint restituisce davvero.
import Link from 'next/link'
import { BookMarked } from 'lucide-react'
import { FONT } from '@/lib/designTokens'
import { TACCUINO_PAPER, TACCUINO_INK, TACCUINO_ACCENT, TACCUINO_ACCENT_SECONDARY, TACCUINO_ACCENT_TINT } from '@/lib/taccuinoTokens'
import { DORSI } from '@/lib/diari/dorsoColore'
import type { DiarySummary } from '@/lib/diari/aggregateDiaries'

function formatUltimaUscita(iso: string | null): string {
  if (!iso) return 'nessuna uscita'
  const d = new Date(iso)
  return `ultima ${d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}`
}

interface Props {
  diario: DiarySummary
  indiceColore: number
  /** Titoli delle Raccolte a cui questo Diario appartiene già — calcolati in /diari incrociando
   *  GET /api/collections, non un campo del Diario stesso: la stessa appartenenza si vede anche in
   *  /raccolte/[id]. Assente/vuoto per un Diario che non è in nessuna raccolta. */
  nomiRaccolte?: string[]
}

export function RegistroRow({ diario, indiceColore, nomiRaccolte }: Props) {
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
          {nomiRaccolte && nomiRaccolte.length > 0 && (
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded"
              style={{ background: TACCUINO_PAPER.light, border: `1px solid ${TACCUINO_ACCENT_SECONDARY}66`, color: TACCUINO_ACCENT_SECONDARY, fontSize: 8.5, fontWeight: 700 }}
              title={nomiRaccolte.join(', ')}
            >
              <BookMarked className="w-2.5 h-2.5" />
              {nomiRaccolte[0]}{nomiRaccolte.length > 1 ? ` +${nomiRaccolte.length - 1}` : ''}
            </span>
          )}
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
