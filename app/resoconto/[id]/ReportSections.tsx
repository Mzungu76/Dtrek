'use client'
import dynamic from 'next/dynamic'
import RouteTimeline from '@/app/components/RouteTimeline'
import SectionCard from '@/app/components/ResocontoSectionCard'
import type { StoredActivity } from '@/lib/blobStore'
import type { RoutePhoto } from '@/lib/activityPhotos'
import type { Section } from '@/lib/reportStore'
import { slotFor } from './sectionPhotoSlot'

const RoutePhotoMap = dynamic(() => import('@/app/components/RoutePhotoMap'), { ssr: false })

export function ReportSections({ activity, photos, sections }: {
  activity: StoredActivity; photos: RoutePhoto[]; sections: Section[]
}) {
  const miniMapNode = activity.trackPoints.length > 4 ? (
    <div className="float-right ml-5 mb-4 w-52 shrink-0 hidden md:block print:block">
      <div className="bg-stone-50 rounded-xl border border-stone-200 overflow-hidden shadow-sm">
        <RoutePhotoMap
          trackPoints={activity.trackPoints}
          photos={photos}
          height="170px"
        />
        {photos.length > 0 && (
          <div className="px-2 pt-1 pb-2 space-y-0.5">
            {photos.slice(0, 7).map((ph, i) => (
              <div key={ph.id} className="flex items-center gap-1.5">
                <span className="w-4 h-4 bg-amber-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center shrink-0 font-display">
                  {i + 1}
                </span>
                <span className="font-body text-[9px] text-stone-500 truncate">{ph.caption}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  ) : undefined

  return (
    <>
      {sections.map((section, i) => {
        const slot = slotFor(section.title, i)
        return (
          <SectionCard
            key={i}
            section={section}
            index={i}
            photo={slot === 0 ? undefined : photos[slot]}
            photoIndex={slot === 0 ? undefined : slot + 1}
            floatNode={slot === 0 ? miniMapNode : undefined}
          />
        )
      })}

      {/* ── Elevation profile with photo markers — end of report ── */}
      {sections.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-5 mb-5 print:rounded-none print:shadow-none print:border-0 print:border-t print:border-stone-200">
          <h3 className="font-display font-bold uppercase tracking-[2px] text-xs text-stone-400 mb-3">
            Profilo altimetrico
          </h3>
          <RouteTimeline trackPoints={activity.trackPoints} photos={photos} />
        </div>
      )}
    </>
  )
}
