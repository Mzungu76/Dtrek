import { ImageResponse } from 'next/og'
import { fetchPublicActivity, routeToSvgPath } from '@/lib/sharePublic'

export const runtime = 'nodejs'
export const alt = 'Escursione su DTrek'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

function fmtDur(secs: number): string {
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60)
  return h === 0 ? `${m}min` : m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`
}

export default async function OgImage({ params }: { params: { token: string } }) {
  const a = await fetchPublicActivity(params.token)

  // Fallback card when the activity is missing or revoked
  if (!a) {
    return new ImageResponse(
      (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#1a3c26,#0e2118)', color: '#fff', fontSize: 60, fontWeight: 700 }}>
          ▲ DTrek
        </div>
      ),
      size,
    )
  }

  const routePath = routeToSvgPath(a.routePolyline, 400, 24)
  const stats = [
    { v: `${(a.distanceMeters / 1000).toFixed(1)} km`, l: 'DISTANZA' },
    { v: `${Math.round(a.elevationGain)} m`,           l: 'DISLIVELLO' },
    { v: fmtDur(a.totalTimeSeconds),                   l: 'DURATA' },
  ]

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', background: 'linear-gradient(135deg,#1a3c26 0%,#0e2118 100%)', color: '#fff', fontFamily: 'sans-serif', position: 'relative' }}>
        {/* Route artwork, right side */}
        <div style={{ position: 'absolute', right: 40, top: 95, width: 440, height: 440, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="440" height="440" viewBox="0 0 400 400">
            <path d={routePath} fill="none" stroke="#5bc47a" strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" opacity={0.95} />
          </svg>
        </div>

        {/* Left content */}
        <div style={{ display: 'flex', flexDirection: 'column', padding: '64px 60px', width: 720, height: '100%', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', fontSize: 30, fontWeight: 700, color: '#5bc47a' }}>
            ▲ <span style={{ color: '#fff', marginLeft: 10 }}>DTrek</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 64, fontWeight: 800, lineHeight: 1.05, maxWidth: 640, display: 'flex' }}>
              {a.title.length > 46 ? a.title.slice(0, 44) + '…' : a.title}
            </div>
            <div style={{ display: 'flex', fontSize: 26, color: 'rgba(255,255,255,0.6)', marginTop: 14 }}>
              {a.ownerName ? `di ${a.ownerName}` : 'Escursione'}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 48 }}>
            {stats.map(s => (
              <div key={s.l} style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontSize: 46, fontWeight: 800 }}>{s.v}</div>
                <div style={{ fontSize: 17, color: 'rgba(255,255,255,0.5)', letterSpacing: 1 }}>{s.l}</div>
              </div>
            ))}
            {a.trailScore !== undefined && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginLeft: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 92, height: 92, borderRadius: 92, background: a.trailColor ?? '#16a34a', fontSize: 42, fontWeight: 800 }}>
                  {Math.round(a.trailScore)}
                </div>
                <div style={{ display: 'flex', fontSize: 16, color: 'rgba(255,255,255,0.7)', marginTop: 8 }}>TrailScore</div>
              </div>
            )}
          </div>
        </div>
      </div>
    ),
    size,
  )
}
