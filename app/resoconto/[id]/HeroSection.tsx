import { Route, Mountain, Clock, Flame } from 'lucide-react'
import type { StoredActivity } from '@/lib/blobStore'
import type { RoutePhoto } from '@/lib/activityPhotos'
import { formatDuration } from '@/lib/tcxParser'

export function HeroSection({ activity, heroPhoto, dateStr }: {
  activity: StoredActivity; heroPhoto: RoutePhoto | null; dateStr: string
}) {
  return (
    <div className="relative w-full overflow-hidden print:h-[220px]"
      style={{ height: 'clamp(220px, 38vw, 420px)' }}>
      {heroPhoto
        ? <img src={heroPhoto.url} alt=""
            className="absolute inset-0 w-full h-full object-cover" />
        : <div className="absolute inset-0 bg-gradient-to-br from-forest-900 via-forest-800 to-forest-700" />
      }
      <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(31,22,15,0.75) 0%, rgba(31,22,15,0.25) 45%, transparent 100%)' }} />
      <div className="absolute inset-x-0 bottom-0 p-6 max-w-5xl mx-auto">
        <h1 className="font-display text-3xl sm:text-5xl font-black text-white leading-tight uppercase tracking-tight drop-shadow-lg mb-2">
          {activity.title ?? activity.notes ?? 'Escursione'}
        </h1>
        {dateStr && (
          <p className="font-body text-sm italic text-white/80">{dateStr}</p>
        )}
        <div className="flex flex-wrap gap-2 mt-3">
          {[
            { icon: <Route className="w-3 h-3" />, v: `${(activity.distanceMeters / 1000).toFixed(1)} km` },
            { icon: <Mountain className="w-3 h-3" />, v: `${activity.elevationGain.toFixed(0)} m D+` },
            { icon: <Clock className="w-3 h-3" />, v: formatDuration(activity.totalTimeSeconds) },
            ...(activity.calories > 0 ? [{ icon: <Flame className="w-3 h-3" />, v: `${activity.calories} kcal` }] : []),
          ].map(({ icon, v }) => (
            <span key={v} className="flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full bg-white/15 border border-white/20 text-white font-display tracking-wide">
              {icon} {v}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
