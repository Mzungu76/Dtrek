'use client'
// Stagione passata o Archivio, collassati in una riga sola finché l'utente non li apre —
// docs/diari-restyling-piano.md, Fase 1. Deve restare raggiungibile con un tocco: un fold che non
// si apre mai renderebbe irraggiungibili i Diari passati o archiviati, una regressione rispetto
// allo scaffale di oggi (dove sono tutti visibili subito).
import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { FONT } from '@/lib/designTokens'
import { TACCUINO_PAPER, TACCUINO_INK } from '@/lib/taccuinoTokens'
import { RegistroRow } from './RegistroRow'
import type { GruppoDiari } from '@/lib/diari/raggruppaDiari'

const DORSI_MINI = ['#8A6A46', '#5F7355', '#A89A78', '#7A5A3C', '#4A5A3F']

interface Props {
  gruppo: GruppoDiari
  /** Titoli delle Raccolte per id di Diario — vedi RegistroRow. */
  nomiRaccolteByDiaryId?: Map<string, string[]>
}

export function GruppoCollassato({ gruppo, nomiRaccolteByDiaryId }: Props) {
  const [aperto, setAperto] = useState(false)

  const distanzaTotale = gruppo.diari.reduce((s, d) => s + d.distanceMeters, 0)
  const reportageTotali = gruppo.diari.reduce((s, d) => s + d.reportageCount, 0)

  if (aperto) {
    return (
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => setAperto(false)}
          className="flex items-center gap-1.5 self-start"
          style={{ fontFamily: FONT.barlow, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: 10, color: TACCUINO_INK.hand }}
        >
          <ChevronDown className="w-3.5 h-3.5 rotate-180" /> {gruppo.etichetta}
        </button>
        {gruppo.diari.map((diario, i) => (
          <RegistroRow key={diario.id} diario={diario} indiceColore={i} nomiRaccolte={nomiRaccolteByDiaryId?.get(diario.id)} />
        ))}
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => setAperto(true)}
      className="flex items-center gap-2.5 h-[52px] px-3 rounded-xl w-full"
      style={{ background: 'transparent', border: `1px solid ${TACCUINO_PAPER.cardBorder}` }}
    >
      <div className="flex items-end gap-0.5 h-6 shrink-0">
        {gruppo.diari.slice(0, 5).map((d, i) => (
          <span key={d.id} className="block w-1.5 rounded-sm" style={{ height: 14 + (i % 3) * 4, background: DORSI_MINI[i % DORSI_MINI.length] }} />
        ))}
      </div>
      <div className="flex-1 min-w-0 text-left">
        <p style={{ fontSize: 12.5, fontWeight: 700, color: TACCUINO_INK.typed, lineHeight: 1.1 }}>{gruppo.etichetta}</p>
        <p style={{ fontSize: 10, color: TACCUINO_INK.handMuted, marginTop: 2 }}>
          {gruppo.diari.length} {gruppo.diari.length === 1 ? 'volume' : 'volumi'} · {(distanzaTotale / 1000).toFixed(0)} km · {reportageTotali} reportage
        </p>
      </div>
      <ChevronDown className="w-4 h-4 shrink-0" style={{ color: TACCUINO_INK.handMuted }} />
    </button>
  )
}
