// Anteprima social del sito personale (/u/[slug]) — stesso identico linguaggio visivo di
// app/leggi/d/[token]/opengraph-image.tsx e app/leggi/c/[token]/opengraph-image.tsx: senza
// questo file, il link più condiviso di tutti (il sito personale stesso, non un singolo Diario/
// Raccolta) appariva su WhatsApp/social come testo nudo invece che come una card con foto.
import { ImageResponse } from 'next/og'
import { fetchPublicProfile } from '@/lib/publicProfile'

export const runtime = 'nodejs'
export const alt = 'Sito personale su DTrek'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function OgImage({ params }: { params: { slug: string } }) {
  const profile = await fetchPublicProfile(params.slug)

  if (!profile) {
    return new ImageResponse(
      (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#1a3c26,#0e2118)', color: '#fff', fontSize: 60, fontWeight: 700 }}>
          ▲ DTrek
        </div>
      ),
      size,
    )
  }

  const coverUrl = profile.collections.find(c => c.coverUrl)?.coverUrl
    ?? profile.diaries.find(d => d.coverUrl)?.coverUrl
    ?? null

  const stats = [
    profile.collections.length > 0 ? { v: String(profile.collections.length), l: profile.collections.length === 1 ? 'RACCOLTA' : 'RACCOLTE' } : null,
    profile.diaries.length > 0 ? { v: String(profile.diaries.length), l: profile.diaries.length === 1 ? 'DIARIO' : 'DIARI' } : null,
    profile.reports.length > 0 ? { v: String(profile.reports.length), l: 'REPORTAGE' } : null,
  ].filter((s): s is { v: string; l: string } => s !== null)

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative', background: 'linear-gradient(135deg,#1a3c26 0%,#0e2118 100%)', color: '#fff', fontFamily: 'sans-serif' }}>
        {coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverUrl} alt=""
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.38 }} />
        )}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(100deg, rgba(10,25,15,0.92) 0%, rgba(10,25,15,0.55) 65%, rgba(10,25,15,0.25) 100%)' }} />

        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', padding: '64px 60px', width: '100%', height: '100%', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', fontSize: 30, fontWeight: 700, color: '#5bc47a' }}>
            ▲ <span style={{ color: '#fff', marginLeft: 10 }}>DTrek</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 58, fontWeight: 800, lineHeight: 1.05, maxWidth: 900, display: 'flex' }}>
              {profile.displayName.length > 46 ? profile.displayName.slice(0, 44) + '…' : profile.displayName}
            </div>
            <div style={{ display: 'flex', fontSize: 26, color: 'rgba(255,255,255,0.6)', marginTop: 14 }}>
              Sito personale
            </div>
          </div>

          {stats.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 48 }}>
              {stats.map(s => (
                <div key={s.l} style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ fontSize: 46, fontWeight: 800 }}>{s.v}</div>
                  <div style={{ fontSize: 17, color: 'rgba(255,255,255,0.5)', letterSpacing: 1 }}>{s.l}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    ),
    size,
  )
}
