'use client'
import { useState, useEffect } from 'react'
import { fetchNearbyWiki } from '@/lib/wikipedia'
import type { WikiPage } from '@/lib/wikipedia'

interface Props {
  lat: number
  lon: number
  radiusM?: number
  onLoaded?: (pages: WikiPage[]) => void
}

export default function WikiCards({ lat, lon, radiusM = 8000, onLoaded }: Props) {
  const [pages,   setPages]   = useState<WikiPage[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    fetchNearbyWiki(lat, lon, radiusM)
      .then(p => { setPages(p); onLoaded?.(p) })
      .catch(() => setError('Impossibile caricare articoli Wikipedia'))
      .finally(() => setLoading(false))
  }, [lat, lon, radiusM])

  if (loading) return (
    <div className="space-y-3">
      {[1, 2].map(i => (
        <div key={i} className="rounded-xl border border-stone-200 bg-stone-50 h-24 animate-pulse" />
      ))}
    </div>
  )
  if (error) return (
    <p className="text-sm text-red-500">{error}</p>
  )
  if (pages.length === 0) return (
    <p className="text-sm text-stone-400 italic">Nessun articolo Wikipedia nelle vicinanze.</p>
  )

  return (
    <div className="space-y-3">
      {pages.map(page => (
        <a
          key={page.pageid}
          href={page.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex gap-3 rounded-xl border border-stone-200 bg-white p-3 hover:bg-stone-50 transition-colors group"
        >
          {page.thumbnail && (
            <img
              src={page.thumbnail}
              alt={page.title}
              className="w-16 h-16 object-cover rounded-lg flex-shrink-0"
            />
          )}
          <div className="min-w-0">
            <p className="font-semibold text-stone-800 text-sm group-hover:text-forest-700 truncate">{page.title}</p>
            {page.description && (
              <p className="text-xs text-stone-500 mb-1">{page.description}</p>
            )}
            <p className="text-xs text-stone-600 line-clamp-2">{page.extract}</p>
            <p className="text-xs text-stone-400 mt-1">{(page.dist / 1000).toFixed(1)} km di distanza</p>
          </div>
        </a>
      ))}
    </div>
  )
}
