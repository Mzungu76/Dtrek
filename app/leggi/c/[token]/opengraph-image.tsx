import { ImageResponse } from 'next/og'
import { fetchPublicCollection } from '@/lib/sharePublicCollection'

export const runtime = 'nodejs'
export const alt = 'Raccolta di Diari su DTrek'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function OgImage({ params }: { params: { token: string } }) {
  const collection = await fetchPublicCollection(params.token)

  if (!collection) {
    return new ImageResponse(
      (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#1a3c26,#0e2118)', color: '#fff', fontSize: 60, fontWeight: 700 }}>
          ▲ DTrek
        </div>
      ),
      size,
    )
  }

  const stats = [
    { v: String(collection.volumes.length), l: collection.volumes.length === 1 ? 'VOLUME' : 'VOLUMI' },
    { v: `${collection.totalKm.toFixed(0)} km`, l: 'PERCORSI' },
    { v: `${Math.round(collection.totalElevationGain).toLocaleString('it')} m`, l: 'DISLIVELLO' },
  ]

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative', background: 'linear-gradient(135deg,#3a2a1c 0%,#0e2118 100%)', color: '#fff', fontFamily: 'sans-serif' }}>
        {collection.coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={collection.coverUrl} alt=""
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.38 }} />
        )}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(100deg, rgba(10,25,15,0.92) 0%, rgba(10,25,15,0.55) 65%, rgba(10,25,15,0.25) 100%)' }} />

        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', padding: '64px 60px', width: '100%', height: '100%', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', fontSize: 30, fontWeight: 700, color: '#5bc47a' }}>
            ▲ <span style={{ color: '#fff', marginLeft: 10 }}>DTrek</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 58, fontWeight: 800, lineHeight: 1.05, maxWidth: 900, display: 'flex' }}>
              {collection.title.length > 46 ? collection.title.slice(0, 44) + '…' : collection.title}
            </div>
            <div style={{ display: 'flex', fontSize: 26, color: 'rgba(255,255,255,0.6)', marginTop: 14 }}>
              di {collection.ownerName}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 48 }}>
            {stats.map(s => (
              <div key={s.l} style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontSize: 46, fontWeight: 800 }}>{s.v}</div>
                <div style={{ fontSize: 17, color: 'rgba(255,255,255,0.5)', letterSpacing: 1 }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    size,
  )
}
