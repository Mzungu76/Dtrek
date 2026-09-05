// Striscia delle Raccolte in cima/fondo alla dashboard di /diari — un elemento visivo, non un
// semplice link testuale: le raccolte sono un livello di pubblicazione (docs/raccolte-
// pubblicazione-piano.md), non una funzione minore da relegare a una riga di testo. Compare solo
// quando l'utente ne ha già almeno una: un elenco vuoto di card sarebbe peggio di un link
// "Le mie Raccolte" per chi non le ha ancora scoperte.
import Link from 'next/link'
import { BookMarked, ChevronRight, Plus } from 'lucide-react'
import { FONT } from '@/lib/designTokens'
import { TACCUINO_PAPER, TACCUINO_INK } from '@/lib/taccuinoTokens'
import type { CollectionSummary } from '@/app/api/collections/route'

// Stessa direzione "Taccuino Botanico" dei dorsi del registro (RegistroRow.tsx) — una palette a
// sé perché una raccolta è una collana di volumi, non un singolo Diario: il gradiente qui è più
// scuro/"a libro chiuso" per leggersi come un oggetto diverso, non una variazione della stessa riga.
const COPERTINE = [
  'linear-gradient(160deg,#7A5A3C,#2E2A22)',
  'linear-gradient(160deg,#4A5A3F,#22271C)',
  'linear-gradient(160deg,#8A6A46,#3A352B)',
  'linear-gradient(160deg,#5F7355,#2E3A26)',
  'linear-gradient(160deg,#8A3D26,#542417)',
]

export function RaccolteStrip({ raccolte }: { raccolte: CollectionSummary[] }) {
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2.5">
        <p style={{ fontFamily: FONT.barlow, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: 11, color: TACCUINO_INK.hand }}>
          Le mie Raccolte
        </p>
        <Link href="/raccolte" className="inline-flex items-center gap-1" style={{ color: TACCUINO_INK.hand, fontSize: 11 }}>
          Vedi tutte <ChevronRight className="w-3 h-3" />
        </Link>
      </div>

      <div className="flex gap-2.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {raccolte.map((r, i) => (
          <Link
            key={r.id}
            href={`/raccolte/${encodeURIComponent(r.id)}`}
            className="shrink-0 w-[132px] rounded-xl overflow-hidden"
            style={{ border: `1px solid ${TACCUINO_PAPER.cardBorder}` }}
          >
            <div className="h-[74px] flex items-end p-2.5" style={{ background: COPERTINE[i % COPERTINE.length] }}>
              <BookMarked className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.7)' }} />
            </div>
            <div className="px-2.5 py-2" style={{ background: TACCUINO_PAPER.card }}>
              <p className="truncate" style={{ fontFamily: FONT.lora, fontWeight: 600, fontSize: 12.5, color: TACCUINO_INK.typed }}>
                {r.title}
              </p>
              <p style={{ fontSize: 9, color: TACCUINO_INK.handMuted, marginTop: 1 }}>
                {r.volumeCount} {r.volumeCount === 1 ? 'volume' : 'volumi'}
              </p>
            </div>
          </Link>
        ))}

        <Link
          href="/raccolte"
          className="shrink-0 w-[132px] rounded-xl flex flex-col items-center justify-center gap-1.5"
          style={{ border: `1.5px dashed ${TACCUINO_PAPER.cardBorder}`, color: TACCUINO_INK.handMuted, minHeight: 74 + 42 }}
        >
          <Plus className="w-4 h-4" />
          <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Nuova</span>
        </Link>
      </div>
    </div>
  )
}
