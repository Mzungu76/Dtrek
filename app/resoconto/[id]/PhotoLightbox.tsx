import { X } from 'lucide-react'
import type { RoutePhoto } from '@/lib/activityPhotos'

export function PhotoLightbox({ photo, onClose }: { photo: RoutePhoto; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 print:hidden"
      onClick={onClose}>
      <button className="absolute top-4 right-4 text-white/70 hover:text-white">
        <X className="w-6 h-6" />
      </button>
      <div className="max-w-3xl w-full" onClick={e => e.stopPropagation()}>
        <img src={photo.url} alt={photo.caption}
          className="w-full rounded-2xl shadow-2xl" />
        {photo.caption && (
          <p className="font-body text-sm italic text-white/70 text-center mt-3">
            {photo.caption}
          </p>
        )}
      </div>
    </div>
  )
}
