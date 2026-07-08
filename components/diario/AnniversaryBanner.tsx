'use client'
import { useMemo } from 'react'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import type { ActivityMeta } from '@/lib/blobStore'
import { findAnniversaries } from '@/lib/stats'

export function AnniversaryBanner({ activities }: { activities: ActivityMeta[] }) {
  const anniversaries = useMemo(() => findAnniversaries(activities), [activities])
  if (anniversaries.length === 0) return null
  return (
    <div className="print:hidden max-w-[794px] mx-auto mb-6 flex flex-col gap-2">
      {anniversaries.map(({ activity, yearsAgo }) => (
        <a
          key={activity.id}
          href={`/resoconto/${activity.id}`}
          className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 hover:bg-amber-100 transition-colors"
        >
          <span className="text-sm text-amber-900">
            🎉 <span className="font-semibold">{yearsAgo} anno{yearsAgo === 1 ? '' : 'i'} fa</span>
            {' '}facevi <span className="font-semibold">{activity.title}</span>
            {' '}({(activity.distanceMeters / 1000).toFixed(1)} km, {format(new Date(activity.startTime), 'd MMMM yyyy', { locale: it })})
          </span>
        </a>
      ))}
    </div>
  )
}
