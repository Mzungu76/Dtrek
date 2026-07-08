export function DiarioCover({
  coverUrl, diaryTitle, diarySubtitle, diaryAuthor, dateRange, totalActivities, totalKm, totalElevationGain,
}: {
  coverUrl: string | null; diaryTitle: string; diarySubtitle: string; diaryAuthor: string
  dateRange?: string; totalActivities?: number; totalKm?: number; totalElevationGain?: number
}) {
  const stats: { value: string; label: string }[] = []
  if (totalActivities)     stats.push({ value: String(totalActivities), label: 'Escursioni' })
  if (totalKm)              stats.push({ value: totalKm.toFixed(0), label: 'Km percorsi' })
  if (totalElevationGain)   stats.push({ value: Math.round(totalElevationGain).toLocaleString('it'), label: 'M dislivello' })

  return (
    <div className="diario-page" style={{
      width: 794, height: 1123,
      position: 'relative', overflow: 'hidden', margin: '24px auto',
      boxShadow: '0 8px 56px rgba(0,0,0,0.28)',
      background: coverUrl ? undefined : 'linear-gradient(158deg,#193b20 0%,#1c4724 45%,#20592b 100%)',
    }}>
      {/* Full-bleed background photo, when the user has set one */}
      {coverUrl && (
        <img src={coverUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      )}

      {/* Topographic texture + mountain silhouette — only on the illustrated (no-photo) cover */}
      {!coverUrl && (
        <>
          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.045 }} viewBox="0 0 794 1123" preserveAspectRatio="xMidYMid slice">
            <path d="M0,900 Q200,820 400,840 Q600,860 794,780 L794,1123 L0,1123 Z" fill="white" opacity="0.6" />
            <path d="M0,780 Q180,700 380,720 Q580,740 794,665" stroke="white" strokeWidth="0.8" fill="none" />
            <path d="M0,660 Q200,590 400,610 Q600,630 794,555" stroke="white" strokeWidth="0.8" fill="none" />
            <path d="M0,545 Q220,480 400,500 Q600,520 794,445" stroke="white" strokeWidth="0.7" fill="none" />
            <path d="M0,430 Q200,372 400,392 Q600,412 794,340" stroke="white" strokeWidth="0.6" fill="none" />
            <path d="M0,315 Q200,265 400,285 Q600,305 794,235" stroke="white" strokeWidth="0.5" fill="none" />
          </svg>
          <svg style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', opacity: 0.08 }} viewBox="0 0 794 320" preserveAspectRatio="none">
            <path d="M0,320 L70,215 L130,255 L225,125 L305,178 L385,58 L450,125 L520,72 L595,128 L660,82 L730,118 L794,88 L794,320 Z" fill="white" />
          </svg>
          <div style={{ position: 'absolute', top: 100, right: 40, fontFamily: 'Playfair Display, serif', fontSize: 220, fontWeight: 900, color: 'rgba(255,255,255,0.025)', lineHeight: 1, userSelect: 'none', pointerEvents: 'none' }}>II</div>
        </>
      )}

      {/* Dark overlay — only needed for legibility over a photo */}
      {coverUrl && (
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(160deg, rgba(8,24,14,0.68) 0%, rgba(8,24,14,0.48) 60%, rgba(8,24,14,0.55) 100%)' }} />
      )}

      {/* Terra top stripe */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: '#e08d3c' }} />

      {/* Brand header */}
      <div style={{ position: 'absolute', top: 38, left: 64, right: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 15, fontWeight: 900, letterSpacing: 7, color: '#e08d3c', textTransform: 'uppercase' }}>DTrek</span>
        <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 9, letterSpacing: 3, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase' }}>Diario di Escursioni</span>
      </div>

      {/* Title block */}
      <div style={{ position: 'absolute', top: 270, left: 64, right: 100 }}>
        {dateRange && (
          <p style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: 6, color: '#e08d3c', textTransform: 'uppercase', margin: '0 0 22px' }}>
            {dateRange}
          </p>
        )}
        <h1 style={{
          fontFamily: 'Playfair Display, serif',
          fontSize: 64,
          fontWeight: 700,
          color: 'white',
          lineHeight: 1.05,
          letterSpacing: -1,
          margin: '0 0 30px',
        }}>
          {diaryTitle}
        </h1>
        <div style={{ width: 80, height: 2, background: '#e08d3c', margin: '0 0 30px' }} />
        {diarySubtitle && (
          <p style={{ fontFamily: 'Lora, serif', fontSize: 16, fontStyle: 'italic', color: 'rgba(255,255,255,0.58)', letterSpacing: 0.5, margin: '0 0 42px' }}>
            {diarySubtitle}
          </p>
        )}

        {/* Stats trio */}
        {stats.length > 0 && (
          <div style={{ display: 'flex', gap: 0, borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 28 }}>
            {stats.map((s, i) => (
              <div key={s.label} style={{
                flex: 1,
                padding: i === 0 ? '0 28px 0 0' : i === stats.length - 1 ? '0 0 0 28px' : '0 28px',
                borderRight: i < stats.length - 1 ? '1px solid rgba(255,255,255,0.08)' : undefined,
              }}>
                <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 30, fontWeight: 500, color: 'white', margin: 0, lineHeight: 1 }}>{s.value}</p>
                <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 9, letterSpacing: 3, color: 'rgba(255,255,255,0.38)', textTransform: 'uppercase', margin: '7px 0 0' }}>{s.label}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Author */}
      <div style={{ position: 'absolute', bottom: 52, left: 64, right: 64, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        {diaryAuthor && (
          <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 10, letterSpacing: 5, color: 'rgba(255,255,255,0.38)', textTransform: 'uppercase', margin: 0 }}>
            {diaryAuthor}
          </p>
        )}
        <p style={{ fontFamily: 'Lora, serif', fontSize: 10, fontStyle: 'italic', color: 'rgba(255,255,255,0.2)', margin: 0 }}>
          Stampato con DTrek
        </p>
      </div>

      {/* Terra bottom stripe */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg,#e08d3c 0%,#d97220 55%,transparent 100%)' }} />
    </div>
  )
}
