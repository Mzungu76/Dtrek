import type { ActivityMeta } from '@/lib/blobStore'

export function MonthBarChart({ activities }: { activities: ActivityMeta[] }) {
  const counts = Array(12).fill(0)
  activities.forEach(a => {
    if (a.startTime) counts[new Date(a.startTime).getMonth()]++
  })
  const max = Math.max(...counts, 1)
  const months = ['G','F','M','A','M','G','L','A','S','O','N','D']
  const bw = 17
  function barColor(c: number): string {
    if (c === 0) return '#f3f4f6'
    if (c === 1) return '#bbf7d0'
    if (c <= 3) return '#4ade80'
    return '#16a34a'
  }
  return (
    <svg viewBox="0 0 260 90" className="w-full" style={{ height: 90 }}>
      {counts.map((c, i) => {
        const barH = c > 0 ? Math.max((c / max) * 56, 4) : 2
        const x = i * (260 / 12) + 1.5
        const by = 68 - barH
        return (
          <g key={i}>
            <rect x={x} y={by} width={bw} height={barH} fill={barColor(c)} rx={2} />
            {c > 0 && (
              <text x={x + bw / 2} y={by - 2} textAnchor="middle" fontSize={6} fill="#6b7280" fontFamily="Arial">{c}</text>
            )}
            <text x={x + bw / 2} y={82} textAnchor="middle" fontSize={7} fill="#9ca3af" fontFamily="Arial">{months[i]}</text>
          </g>
        )
      })}
    </svg>
  )
}
