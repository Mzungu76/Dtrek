'use client'
import { useMemo } from 'react'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { ActivityMeta } from '@/lib/blobStore'

export default function ActivityHeatmap({ activities, year }: { activities: ActivityMeta[]; year: number }) {
  const counts = useMemo(() => {
    const map = new Map<string, number>()
    for (const a of activities) {
      const key = format(new Date(a.startTime), 'yyyy-MM-dd')
      map.set(key, (map.get(key) ?? 0) + 1)
    }
    return map
  }, [activities])

  const cells = useMemo(() => {
    const jan1  = new Date(year, 0, 1)
    const dec31 = new Date(year, 11, 31)
    const start = new Date(jan1)
    const dow   = start.getDay()
    start.setDate(start.getDate() - (dow === 0 ? 6 : dow - 1))
    const all: Date[] = []
    const d = new Date(start)
    while (d <= dec31) { all.push(new Date(d)); d.setDate(d.getDate() + 1) }
    while (all.length % 7 !== 0) { all.push(new Date(d)); d.setDate(d.getDate() + 1) }
    return all
  }, [year])

  const weeks = cells.length / 7

  const monthLabels = useMemo(() => {
    const labels: { label: string; col: number }[] = []
    let lastMonth = -1
    cells.forEach((d, i) => {
      if (d.getFullYear() === year && d.getMonth() !== lastMonth) {
        lastMonth = d.getMonth()
        labels.push({ label: format(d, 'MMM', { locale: it }), col: Math.floor(i / 7) })
      }
    })
    return labels
  }, [cells, year])

  const colorClass = (count: number, inYear: boolean) => {
    if (!inYear) return 'bg-transparent'
    if (count === 0) return 'bg-stone-100 hover:bg-stone-200'
    if (count === 1) return 'bg-forest-200 hover:bg-forest-300'
    if (count === 2) return 'bg-forest-400 hover:bg-forest-500'
    return 'bg-forest-600 hover:bg-forest-700'
  }

  return (
    <div className="overflow-x-auto pb-2">
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${weeks}, 12px)`, gap: '2px', marginBottom: '4px' }}>
        {Array.from({ length: weeks }, (_, col) => {
          const lbl = monthLabels.find(l => l.col === col)
          return <div key={col} className="text-[10px] text-stone-400">{lbl?.label ?? ''}</div>
        })}
      </div>
      <div className="flex gap-1">
        <div className="flex flex-col gap-0.5 mr-1">
          {['L', '', 'M', '', 'G', '', 'S'].map((d, i) => (
            <div key={i} className="text-[10px] text-stone-400 w-3 h-3 flex items-center justify-center">{d}</div>
          ))}
        </div>
        <div style={{
          display: 'grid',
          gridTemplateRows: 'repeat(7, 12px)',
          gridTemplateColumns: `repeat(${weeks}, 12px)`,
          gridAutoFlow: 'column',
          gap: '2px',
        }}>
          {cells.map((day, i) => {
            const key   = format(day, 'yyyy-MM-dd')
            const count = counts.get(key) ?? 0
            const inYear = day.getFullYear() === year
            return (
              <div
                key={i}
                title={inYear ? `${format(day, 'dd MMM yyyy', { locale: it })}: ${count} escursion${count !== 1 ? 'i' : 'e'}` : ''}
                className={`rounded-sm transition-colors cursor-default ${colorClass(count, inYear)}`}
              />
            )
          })}
        </div>
      </div>
      <div className="flex items-center gap-1.5 mt-2">
        <span className="text-[10px] text-stone-400">Meno</span>
        {['bg-stone-100', 'bg-forest-200', 'bg-forest-400', 'bg-forest-600'].map(c => (
          <div key={c} className={`w-3 h-3 rounded-sm ${c}`} />
        ))}
        <span className="text-[10px] text-stone-400">Di più</span>
      </div>
    </div>
  )
}
