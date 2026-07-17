'use client'
import Image from 'next/image'
import type { RoutePhoto } from '@/lib/activityPhotos'

interface Props {
  /** Foto da mostrare (già escluse quelle usate come copertina/hero dal chiamante) — la prima
   *  diventa il riquadro grande, le successive (fino a 3) i riquadri piccoli. */
  photos: RoutePhoto[]
  onPhotoClick: (photoId: string) => void
}

/**
 * Mosaico "protagonista" — un riquadro grande + fino a 3 piccoli, invece della vecchia striscia
 * di 4 miniature identiche alte 32px (components/PhotoMosaic.tsx, ancora usata da Guida). Su
 * mobile il grande sta sopra a piena larghezza; da `sm` in su il grande occupa 2/3 della
 * larghezza (non metà: con solo 2-3 piccoli affiancarli in colonna uguale li rendeva striminziti)
 * e i piccoli si impilano nel terzo restante, alti abbastanza da restare leggibili.
 */
export default function PhotoShowcase({ photos, onPhotoClick }: Props) {
  if (photos.length === 0) return null
  const [first, ...rest] = photos
  const smalls = rest.slice(0, 3)

  if (smalls.length === 0) {
    return (
      <button
        onClick={() => onPhotoClick(first.id)}
        className="relative w-full h-56 sm:h-96 overflow-hidden block print:hidden group"
      >
        <Image src={first.url} alt={first.caption ?? ''} fill sizes="100vw" className="object-cover group-hover:scale-105 transition-transform duration-300" />
      </button>
    )
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 print:hidden">
      <button
        onClick={() => onPhotoClick(first.id)}
        className="relative col-span-2 h-44 sm:h-96 overflow-hidden group"
      >
        <Image src={first.url} alt={first.caption ?? ''} fill sizes="(max-width: 640px) 100vw, 66vw" className="object-cover group-hover:scale-105 transition-transform duration-300" />
      </button>
      <div className="col-span-2 sm:col-span-1 grid grid-cols-3 sm:flex sm:flex-col gap-1.5 sm:h-96">
        {smalls.map(ph => (
          <button
            key={ph.id}
            onClick={() => onPhotoClick(ph.id)}
            className="relative h-28 sm:h-auto sm:flex-1 overflow-hidden group"
          >
            <Image src={ph.url} alt={ph.caption ?? ''} fill sizes="(max-width: 640px) 33vw, 22vw" className="object-cover group-hover:scale-105 transition-transform duration-300" />
          </button>
        ))}
      </div>
    </div>
  )
}
