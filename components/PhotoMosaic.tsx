'use client'
import Image from 'next/image'

export interface MosaicPhoto {
  id: string
  url: string
  alt?: string
}

interface Props {
  photos: MosaicPhoto[]
  onPhotoClick?: (id: string) => void
  heightClass?: string
}

export default function PhotoMosaic({ photos, onPhotoClick, heightClass = 'h-32' }: Props) {
  if (photos.length === 0) return null
  return (
    <div className={`flex ${heightClass} overflow-hidden print:hidden`}>
      {photos.map(ph => (
        <button key={ph.id} onClick={() => onPhotoClick?.(ph.id)}
          className="relative flex-1 overflow-hidden hover:scale-[1.02] transition-transform">
          <Image src={ph.url} alt={ph.alt ?? ''} fill sizes="33vw"
            className="object-cover" style={{ objectPosition: 'center 40%' }} />
        </button>
      ))}
    </div>
  )
}
