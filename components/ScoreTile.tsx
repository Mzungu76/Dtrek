'use client'
import { ChevronDown, ChevronUp } from 'lucide-react'

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
    <div className="rounded-2xl border border-stone-200 shadow-sm overflow-hidden bg-white">
      <button
        onClick={onToggle}
        disabled={!hasDetail}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left disabled:cursor-default"
        style={{ background: `${color}10` }}
      >
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">{title}</p>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black" style={{ color }}>{score}</span>
            <span className="text-xs font-semibold truncate" style={{ color }}>{label}</span>
          </div>
        </div>
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md text-white shrink-0" style={{ backgroundColor: color }}>{badge}</span>
        {hasDetail && (open ? <ChevronUp className="w-4 h-4 text-stone-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-stone-400 shrink-0" />)}
      </button>

      {open && hasDetail && (
        <div className="border-t border-stone-100 bg-stone-50 px-4 py-4">
          {children}
        </div>
      )}
    </div>
  )
}
