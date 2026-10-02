'use client'
import { TrailScoreGaugeBadge, type SafetyPreview } from '@/components/TrailScoreGaugeBadge'

// Il badge a doppio anello è disegnato per sfondi scuri (la traccia degli anelli è bianca al 18%): sul chiaro
// spariva. Qui lo si mette sempre su un disco scuro, così il Trail Score (anello interno) e la Sicurezza
// (anello esterno) si leggono ovunque, nelle liste come nelle schede.
export default function CamminoCtsBadge({ total, safety, size = 40, loading }: { total: number | null; safety: SafetyPreview | null; size?: number; loading?: boolean }) {
  return (
    <span className="inline-flex shrink-0 items-center justify-center rounded-full bg-stone-800 shadow-sm" style={{ padding: Math.max(2, Math.round(size * 0.08)) }}>
      <TrailScoreGaugeBadge total={total} safety={safety} size={size} showLabel={false} loading={loading} />
    </span>
  )
}
