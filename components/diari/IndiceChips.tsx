'use client'
// Filtro a chip sopra il registro — compare solo oltre una manciata di Diari (soglia scelta nel
// piano: sotto i 6 sarebbe rumore, l'elenco intero ci sta già in una schermata).
// docs/diari-restyling-piano.md, Fase 1.
import { FONT } from '@/lib/designTokens'
import { TACCUINO_PAPER, TACCUINO_INK, TACCUINO_ACCENT } from '@/lib/taccuinoTokens'

export const FILTRO_TUTTI = 'tutti'
export const FILTRO_ARCHIVIO = 'archivio'

interface Props {
  etichette: { valore: string; conteggio: number }[]
  totale: number
  archiviati: number
  selezionato: string
  onSelect: (valore: string) => void
}

function Chip({ attivo, onClick, children }: { attivo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 inline-flex items-center gap-1.5 h-[30px] px-3 rounded-full"
      style={{
        background: attivo ? TACCUINO_ACCENT[600] : TACCUINO_PAPER.card,
        border: `1px solid ${attivo ? TACCUINO_ACCENT[600] : TACCUINO_PAPER.cardBorder}`,
        color: attivo ? TACCUINO_PAPER.light : TACCUINO_INK.hand,
        fontFamily: FONT.barlow, fontWeight: 700, fontSize: 11,
      }}
    >
      {children}
    </button>
  )
}

export function IndiceChips({ etichette, totale, archiviati, selezionato, onSelect }: Props) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
      <Chip attivo={selezionato === FILTRO_TUTTI} onClick={() => onSelect(FILTRO_TUTTI)}>
        Tutti <span style={{ opacity: 0.7, fontFamily: FONT.mono, fontSize: 9.5 }}>{totale}</span>
      </Chip>
      {etichette.map(({ valore, conteggio }) => (
        <Chip key={valore} attivo={selezionato === valore} onClick={() => onSelect(valore)}>
          {valore} <span style={{ opacity: 0.7, fontFamily: FONT.mono, fontSize: 9.5 }}>{conteggio}</span>
        </Chip>
      ))}
      {archiviati > 0 && (
        <Chip attivo={selezionato === FILTRO_ARCHIVIO} onClick={() => onSelect(FILTRO_ARCHIVIO)}>
          Archivio <span style={{ opacity: 0.7, fontFamily: FONT.mono, fontSize: 9.5 }}>{archiviati}</span>
        </Chip>
      )}
    </div>
  )
}
