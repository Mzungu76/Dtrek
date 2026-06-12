'use client'
import { useMemo, useEffect, useState } from 'react'
import { ActivityMeta } from '@/lib/blobStore'
import { Streaks } from '@/lib/stats'
import { computeBadges, BADGE_CATEGORY_LABELS, type BadgeCategory, type ComputedBadge } from '@/lib/badges'
import { Trophy, Lock } from 'lucide-react'
import InfoButton from './InfoButton'

const LS_KEY = 'dtrek_badges_seen'

function getSeen(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(LS_KEY) ?? '[]')) } catch { return new Set() }
}
function markSeen(ids: string[]) {
  try {
    const current = getSeen()
    ids.forEach(id => current.add(id))
    localStorage.setItem(LS_KEY, JSON.stringify(Array.from(current)))
  } catch {}
}

const CATEGORY_ORDER: BadgeCategory[] = ['distanza', 'dislivello', 'quota', 'frequenza', 'speciale']

interface Props {
  activities: ActivityMeta[]
  streaks: Streaks
  onGuideLink: (section: string) => void
}

export default function TabTraguardi({ activities, streaks, onGuideLink }: Props) {
  const badges = useMemo(() => computeBadges(activities, streaks), [activities, streaks])
  const [newlyUnlocked, setNewlyUnlocked] = useState<Set<string>>(new Set())

  useEffect(() => {
    const seen = getSeen()
    const fresh = badges.filter(b => b.unlocked && !seen.has(b.id)).map(b => b.id)
    if (fresh.length > 0) {
      setNewlyUnlocked(new Set(fresh))
      markSeen(badges.filter(b => b.unlocked).map(b => b.id))
    }
  }, [badges])

  const unlocked = badges.filter(b => b.unlocked).length
  const total    = badges.length

  const byCategory = CATEGORY_ORDER.map(cat => ({
    cat,
    label: BADGE_CATEGORY_LABELS[cat],
    badges: badges.filter(b => b.category === cat),
  }))

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-amber-100 rounded-2xl flex items-center justify-center">
            <Trophy className="w-7 h-7 text-amber-600" />
          </div>
          <div>
            <p className="text-2xl font-bold font-display text-stone-800">{unlocked} <span className="text-stone-400 font-normal text-lg">/ {total}</span></p>
            <p className="text-sm text-stone-500 flex items-center gap-1.5">
              badge sbloccati
              <InfoButton section="badge" onGuideLink={onGuideLink} />
            </p>
          </div>
          <div className="ml-auto hidden sm:block">
            <div className="h-3 w-48 bg-stone-100 rounded-full overflow-hidden">
              <div className="h-3 bg-amber-400 rounded-full transition-all" style={{ width: `${Math.round(unlocked / total * 100)}%` }} />
            </div>
            <p className="text-xs text-stone-400 mt-1 text-right">{Math.round(unlocked / total * 100)}% completato</p>
          </div>
        </div>
        {newlyUnlocked.size > 0 && (
          <div className="mt-4 p-3 bg-amber-50 rounded-xl border border-amber-200">
            <p className="text-sm font-medium text-amber-800">
              🎉 Hai sbloccato {newlyUnlocked.size} nuovo{newlyUnlocked.size > 1 ? 'i' : ''} badge!
            </p>
          </div>
        )}
      </div>

      {/* Categories */}
      {byCategory.map(({ cat, label, badges: catBadges }) => {
        const unlockedCat = catBadges.filter(b => b.unlocked).length
        return (
          <div key={cat}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-stone-700">{label}</h3>
              <span className="text-xs text-stone-400">{unlockedCat}/{catBadges.length}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {catBadges.map(badge => (
                <BadgeCard key={badge.id} badge={badge} isNew={newlyUnlocked.has(badge.id)} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function BadgeCard({ badge, isNew }: { badge: ComputedBadge; isNew: boolean }) {
  const pct = badge.progressPct

  return (
    <div className={`relative rounded-2xl border p-4 transition-all ${
      badge.unlocked
        ? `bg-white border-amber-200 shadow-sm ${isNew ? 'ring-2 ring-amber-400 animate-pulse' : ''}`
        : 'bg-stone-50 border-stone-200 opacity-60'
    }`}>
      {badge.unlocked && isNew && (
        <span className="absolute top-2 right-2 text-xs bg-amber-400 text-white px-1.5 py-0.5 rounded-full font-medium">NEW</span>
      )}
      <div className="flex items-start gap-3">
        <span className={`text-2xl shrink-0 ${badge.unlocked ? '' : 'grayscale opacity-40'}`}>{badge.icon}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className={`text-sm font-semibold ${badge.unlocked ? 'text-stone-800' : 'text-stone-400'}`}>{badge.name}</p>
            {!badge.unlocked && <Lock className="w-3 h-3 text-stone-300 shrink-0" />}
          </div>
          <p className="text-xs text-stone-400 mt-0.5 leading-tight">{badge.description}</p>
          {typeof pct !== 'undefined' && !badge.unlocked && (
            <div className="mt-2">
              <div className="h-1.5 bg-stone-200 rounded-full overflow-hidden">
                <div className="h-1.5 bg-forest-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
              </div>
              <p className="text-[10px] text-stone-400 mt-0.5">
                {badge.progressCurrent?.toLocaleString('it')}{badge.progressUnit ? ` ${badge.progressUnit}` : ''} / {badge.progressTarget?.toLocaleString('it')}{badge.progressUnit ? ` ${badge.progressUnit}` : ''} ({pct}%)
              </p>
            </div>
          )}
          {badge.unlocked && (
            <p className="text-xs text-amber-600 mt-1 font-medium">✓ Sbloccato</p>
          )}
        </div>
      </div>
    </div>
  )
}
