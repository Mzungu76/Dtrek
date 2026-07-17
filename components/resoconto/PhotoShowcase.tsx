'use client'
import Image from 'next/image'
import type { RoutePhoto } from '@/lib/activityPhotos'

interface Props {
  /** Foto da mostrare (già escluse quelle usate come copertina/hero dal chiamante) — la prima
   *  diventa il riquadro grande, le successive (fino a 4) i riquadri piccoli. */
  photos: RoutePhoto[]
  onPhotoClick: (photoId: string) => void
}

/**
 * Mosaico "protagonista" — un riquadro grande + fino a 4 piccoli, invece della vecchia striscia
 * di 4 miniature identiche alte 32px (components/PhotoMosaic.tsx, ancora usata da Guida). Su
 * mobile il grande sta sopra a piena larghezza; da `sm` in su il grande occupa la colonna
 * sinistra per tutta l'altezza e i piccoli si impilano a destra.
 */
export default function PhotoShowcase({ photos, onPhotoClick }: Props) {
  if (photos.length === 0) return null
  const [first, ...rest] = photos
  const smalls = rest.slice(0, 4)

  if (smalls.length === 0) {
    return (
      <button
        onClick={() => onPhotoClick(first.id)}
        className="relative w-full h-56 sm:h-80 overflow-hidden block print:hidden group"
      >
        <Image src={first.url} alt={first.caption ?? ''} fill sizes="100vw" className="object-cover group-hover:scale-105 transition-transform duration-300" />
      </button>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-1 print:hidden">
      <button
        onClick={() => onPhotoClick(first.id)}
        className="relative col-span-2 sm:col-span-1 sm:row-span-2 h-44 sm:h-80 overflow-hidden group"
      >
        <Image src={first.url} alt={first.caption ?? ''} fill sizes="(max-width: 640px) 100vw, 50vw" className="object-cover group-hover:scale-105 transition-transform duration-300" />
      </button>
      <div className="col-span-2 sm:col-span-1 grid grid-cols-2 sm:flex sm:flex-col gap-1 sm:h-80">
        {smalls.map(ph => (
          <button
            key={ph.id}
            onClick={() => onPhotoClick(ph.id)}
            className="relative h-24 sm:h-auto sm:flex-1 overflow-hidden group"
          >
            <Image src={ph.url} alt={ph.caption ?? ''} fill sizes="25vw" className="object-cover group-hover:scale-105 transition-transform duration-300" />
          </button>
        ))}
      </div>
    </div>
  )
}
