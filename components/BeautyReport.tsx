'use client'
import type { BeautyScore } from '@/lib/beautyScore'

interface Props {
  score: BeautyScore
}

function ScoreBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="flex-1 h-2.5 bg-stone-100 rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{ width: `${value * 10}%`, backgroundColor: color }}
      />
    </div>
  )
}

function GradeBadge({ grade, color }: { grade: string; color: string }) {
  return (
    <span
      className="inline-flex items-center justify-center w-9 h-9 rounded-xl text-white text-sm font-bold shrink-0 shadow-sm"
      style={{ backgroundColor: color }}
    >
      {grade}
    </span>
  )
}

export default function BeautyReport({ score }: Props) {
  return (
    <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
      {/* Header — overall grade */}
      <div
        className="px-5 py-4 flex items-center gap-4"
        style={{ background: `${score.color}15`, borderBottom: `1px solid ${score.color}30` }}
      >
        <div
          className="flex items-center justify-center w-16 h-16 rounded-2xl text-white shrink-0 shadow"
          style={{ backgroundColor: score.color }}
        >
          <span className="font-display text-2xl font-bold">{score.overall.toFixed(1)}</span>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-0.5">
            Bellezza del percorso
          </p>
          <p className="font-display text-xl font-bold text-stone-800">{score.gradeLabel}</p>
          <p className="text-xs text-stone-400 mt-0.5">voto: {score.grade}/10 · media di 5 categorie</p>
        </div>
      </div>

      {/* Category rows */}
      <div className="divide-y divide-stone-100">
        {score.categories.map(cat => (
          <div key={cat.key} className="px-5 py-3.5">
            <div className="flex items-center gap-3">
              <span className="text-xl w-7 text-center shrink-0">{cat.emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium text-stone-700">{cat.label}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-stone-400 font-mono">{cat.score.toFixed(1)}</span>
                    <GradeBadge grade={cat.grade} color={cat.color} />
                  </div>
                </div>
                <ScoreBar value={cat.score} color={cat.color} />
                {cat.reasons.length > 0 && (
                  <p className="text-xs text-stone-400 mt-1.5 truncate">
                    {cat.reasons.join(' · ')}
                  </p>
                )}
                {cat.reasons.length === 0 && (
                  <p className="text-xs text-stone-300 mt-1.5 italic">Nessun elemento rilevato</p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Footer note */}
      <div className="px-5 py-3 bg-stone-50 border-t border-stone-100">
        <p className="text-xs text-stone-400">
          Valutazione automatica basata su OpenStreetMap e Wikipedia · aggiornata al caricamento della pagina
        </p>
      </div>
    </div>
  )
}
