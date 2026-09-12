'use client'
import { ProfileAvatar } from '@/components/Navbar'
import HubNavBar from './HubNavBar'

/**
 * Shown in place of the magazine-cover hub while its data (planned hikes list, or the open
 * route's own record) is still loading — mimics TopOverlay/CoverMap/BottomGallery's shapes so
 * the handoff to real content is a reveal, not a layout jump. The nav bar itself doesn't depend
 * on that data, so it renders for real (and stays interactive) instead of as a placeholder —
 * split the same way as the real layout: only the profile icon up top (in the same row as the
 * pill placeholders, mirroring TopOverlay.tsx), the link bar down at the very bottom.
 */
export default function HubSkeleton() {
  return (
    <div className="fixed inset-0 bg-gradient-to-br from-[#123448] to-[#071824] overflow-hidden">
      <div className="absolute inset-x-0 top-0 z-20 px-3 sm:px-4 flex items-center gap-1.5" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 10px)' }}>
        <div className="flex-1 min-w-0 flex items-center gap-1.5 overflow-hidden">
          {[64, 56, 60, 48].map((w, i) => (
            <div key={i} className="shrink-0 h-7 rounded-full bg-white/15 animate-pulse" style={{ width: w }} />
          ))}
        </div>
        <ProfileAvatar size={32} iconSize={14} />
      </div>

      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-3">
        <div className="px-3 sm:px-4">
          <div className="mb-3 space-y-2">
            <div className="h-6 w-2/3 rounded-md bg-white/15 animate-pulse" />
            <div className="h-3 w-1/3 rounded-md bg-white/10 animate-pulse" />
          </div>
          <div className="flex items-center gap-2.5 overflow-hidden">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="shrink-0 w-20 h-20 rounded-2xl bg-white/10 animate-pulse"
                style={{ animationDelay: `${i * 80}ms` }}
              />
            ))}
          </div>
        </div>
        <HubNavBar />
      </div>
    </div>
  )
}
