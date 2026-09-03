'use client'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { TornFrame, tornVariant } from '@/components/TornFrame'
import { TACCUINO_PAPER } from '@/lib/taccuinoTokens'

interface Props {
  title: string
  score: number | string
  label: string
  color: string
  badge: string
  open: boolean
  onToggle: () => void
  hasDetail?: boolean
  children?: React.ReactNode
}

// Compact "number + title" tile, expandable inline (no popup) to reveal the
// score-specific breakdown passed as children — shared shell for SI, Safety
// Score, CTS and any future score so the unified scores grid only renders
// one visual pattern instead of each widget's own full-size card header.
export function ScoreTile({ title, score, label, color, badge, open, onToggle, hasDetail = true, children }: Props) {
  return (
    <TornFrame size="card" variant={tornVariant(title)} className={open && hasDetail ? 'sm:col-span-2 lg:col-span-4' : ''}>
      {/* Sfondo opaco sotto la tinta trasparente del punteggio (${color}10): senza, quel 6% di
          opacità lascerebbe trasparire il riempimento invisibile di .torn-cast sotto (nero) invece
          della carta. */}
      <div style={{ background: TACCUINO_PAPER.card }}>
        <button
          onClick={onToggle}
          disabled={!hasDetail}
          className="w-full flex items-center gap-3 px-4 py-3.5 text-left disabled:cursor-default"
          style={{ background: `${color}10` }}
        >
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: TACCUINO_PAPER.contourLine }}>{title}</p>
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-2xl font-black" style={{ color }}>{score}</span>
              <span className="text-xs font-semibold" style={{ color }}>{label}</span>
            </div>
          </div>
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md text-white shrink-0" style={{ backgroundColor: color }}>{badge}</span>
          {hasDetail && (open ? <ChevronUp className="w-4 h-4 shrink-0" style={{ color: TACCUINO_PAPER.contourLine }} /> : <ChevronDown className="w-4 h-4 shrink-0" style={{ color: TACCUINO_PAPER.contourLine }} />)}
        </button>

        {open && hasDetail && (
          <div className="px-4 py-4" style={{ borderTop: `1px solid ${TACCUINO_PAPER.cardBorder}` }}>
            {children}
          </div>
        )}
      </div>
    </TornFrame>
  )
}
