'use client'
import {
  Search, Loader2, MapPin, Route, TrendingUp, Clock, Sparkles, AlertCircle,
} from 'lucide-react'
import type { TrailSearchResult, TrailSearchCandidate } from '@/lib/trailSearch'
import type { SearchFilters } from '@/lib/trailFilters'
import { ROUTE_TYPE_LABEL, ROUTE_TYPE_ICON, type RouteType } from '@/lib/routeTypeLabels'
import { DIFFICULTY_TIER_LABEL, DIFFICULTY_TIER_SAC, sacCodesForTiers, tierForSac, type DifficultyTier } from '@/lib/difficultyTiers'
import { NETWORK_LABEL } from '@/lib/networkLabels'
import { formatDurationSecs } from '@/lib/trailStats'

const ALL_ROUTE_TYPES: RouteType[] = ['loop', 'out_and_back', 'point_to_point']
const ALL_TIERS: DifficultyTier[] = ['facile', 'moderato', 'impegnativo']

interface Props {
  results: TrailSearchResult[]
  pendingCandidates: TrailSearchCandidate[]
  loading: boolean
  error: string | null
  truncated: boolean
  hasSearched: boolean
  filters: SearchFilters
  onFiltersChange: (filters: SearchFilters) => void
  onUsePreferences?: () => void
  onSelectTrail: (id: number) => void
  selectingId: number | null
  onSearchThisArea: () => void
  canSearchThisArea: boolean
}

function isRouteTypeActive(filters: SearchFilters, rt: RouteType): boolean {
  return !filters.routeType || filters.routeType.includes(rt)
}

function isTierActive(filters: SearchFilters, tier: DifficultyTier): boolean {
  if (!filters.difficulty) return true
  return DIFFICULTY_TIER_SAC[tier].some(code => filters.difficulty!.includes(code))
}

function chipClass(active: boolean): string {
  return `px-3 py-1.5 rounded-full text-xs font-medium border transition ${
    active
      ? 'bg-sky-600 border-sky-600 text-white'
      : 'bg-white border-stone-200 text-stone-500 hover:bg-stone-50'
  }`
}

function RangeField({
  label, min, max, step, unit, onChange,
}: {
  label: string
  min?: number
  max?: number
  step: number
  unit: string
  onChange: (min: number | undefined, max: number | undefined) => void
}) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-stone-500 w-20 shrink-0">{label}</span>
      <input
        type="number"
        placeholder="da"
        step={step}
        defaultValue={min ?? ''}
        onBlur={e => onChange(e.target.value === '' ? undefined : Number(e.target.value), max)}
        className="w-16 px-2 py-1 rounded-lg border border-stone-200 text-stone-700"
      />
      <span className="text-stone-300">–</span>
      <input
        type="number"
        placeholder="a"
        step={step}
        defaultValue={max ?? ''}
        onBlur={e => onChange(min, e.target.value === '' ? undefined : Number(e.target.value))}
        className="w-16 px-2 py-1 rounded-lg border border-stone-200 text-stone-700"
      />
      <span className="text-stone-400">{unit}</span>
    </div>
  )
}

export default function ExploreResultsPanel({
  results, pendingCandidates, loading, error, truncated, hasSearched,
  filters, onFiltersChange, onUsePreferences, onSelectTrail, selectingId,
  onSearchThisArea, canSearchThisArea,
}: Props) {
  function toggleRouteType(rt: RouteType) {
    const active = ALL_ROUTE_TYPES.filter(t => isRouteTypeActive(filters, t))
    const next = isRouteTypeActive(filters, rt) ? active.filter(t => t !== rt) : [...active, rt]
    onFiltersChange({ ...filters, routeType: (next.length === 0 || next.length === ALL_ROUTE_TYPES.length) ? undefined : next })
  }

  function toggleTier(tier: DifficultyTier) {
    const active = ALL_TIERS.filter(t => isTierActive(filters, t))
    const next = isTierActive(filters, tier) ? active.filter(t => t !== tier) : [...active, tier]
    onFiltersChange({ ...filters, difficulty: (next.length === 0 || next.length === ALL_TIERS.length) ? undefined : sacCodesForTiers(next) })
  }

  const totalShown = results.length + pendingCandidates.length

  return (
    <div className="flex flex-col h-full">
      {/* Cerca in quest'area */}
      <div className="p-3 border-b border-stone-100">
        <button
          onClick={onSearchThisArea}
          disabled={loading}
          className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition disabled:opacity-60 ${
            canSearchThisArea
              ? 'bg-sky-600 hover:bg-sky-700 text-white shadow-sm animate-[pulse_2s_ease-in-out_2]'
              : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
          }`}
        >
          {loading
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Ricerca in corso…</>
            : <><Search className="w-4 h-4" /> Cerca in quest&apos;area</>}
        </button>
      </div>

      {/* Filtri */}
      <div className="p-3 border-b border-stone-100 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium text-stone-400 uppercase tracking-wide">Filtri</span>
          {onUsePreferences && (
            <button
              onClick={onUsePreferences}
              className="flex items-center gap-1 text-xs text-forest-600 hover:text-forest-700 font-medium"
            >
              <Sparkles className="w-3.5 h-3.5" /> Usa le mie preferenze
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {ALL_ROUTE_TYPES.map(rt => {
            const Icon = ROUTE_TYPE_ICON[rt]
            return (
              <button key={rt} onClick={() => toggleRouteType(rt)} className={chipClass(isRouteTypeActive(filters, rt))}>
                <span className="flex items-center gap-1"><Icon className="w-3 h-3" />{ROUTE_TYPE_LABEL[rt]}</span>
              </button>
            )
          })}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {ALL_TIERS.map(tier => (
            <button key={tier} onClick={() => toggleTier(tier)} className={chipClass(isTierActive(filters, tier))}>
              {DIFFICULTY_TIER_LABEL[tier]}
            </button>
          ))}
        </div>

        <RangeField
          label="Distanza" unit="km" step={1}
          min={filters.distanceKmMin} max={filters.distanceKmMax}
          onChange={(min, max) => onFiltersChange({ ...filters, distanceKmMin: min, distanceKmMax: max })}
        />
        <RangeField
          label="Dislivello" unit="m" step={50}
          min={filters.elevationGainMin} max={filters.elevationGainMax}
          onChange={(min, max) => onFiltersChange({ ...filters, elevationGainMin: min, elevationGainMax: max })}
        />
        <RangeField
          label="Durata" unit="min" step={30}
          min={filters.durationMinMin} max={filters.durationMinMax}
          onChange={(min, max) => onFiltersChange({ ...filters, durationMinMin: min, durationMinMax: max })}
        />
      </div>

      {/* Risultati */}
      <div className="flex-1 overflow-y-auto">
        {error && (
          <div className="m-3 px-3 py-2.5 rounded-xl bg-red-50 text-red-700 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        {!error && hasSearched && totalShown === 0 && !loading && (
          <div className="p-6 text-center text-sm text-stone-400">
            Nessun sentiero trovato con questi filtri in quest&apos;area.
          </div>
        )}

        {!hasSearched && !loading && (
          <div className="p-6 text-center text-sm text-stone-400">
            Sposta la mappa sulla zona che ti interessa e premi &quot;Cerca in quest&apos;area&quot;.
          </div>
        )}

        {totalShown > 0 && (
          <div className="px-3 py-2 text-[11px] text-stone-400">
            {truncated
              ? `Mostrati i primi ${totalShown} sentieri nell'area — restringi la zona o i filtri per risultati più mirati.`
              : `${totalShown} sentieri trovati`}
          </div>
        )}

        {results.map(t => {
          const dur = t.estimatedTimeMin != null ? t.estimatedTimeMin * 60 : 0
          const RouteIcon = t.routeType ? ROUTE_TYPE_ICON[t.routeType] : null
          const tier = tierForSac(t.sacScale)
          const isSelecting = selectingId === t.id
          return (
            <button
              key={t.id}
              onClick={() => onSelectTrail(t.id)}
              disabled={selectingId !== null}
              className={`w-full text-left px-4 py-3 border-b border-stone-100 flex items-center gap-3 transition-opacity ${
                isSelecting ? 'bg-sky-50' : selectingId !== null ? 'opacity-40' : 'hover:bg-stone-50'
              }`}
            >
              {isSelecting ? (
                <Loader2 className="w-4 h-4 text-sky-500 shrink-0 animate-spin" />
              ) : (
                <MapPin className="w-4 h-4 text-stone-400 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-stone-800 font-medium truncate">{t.name}</span>
                  {t.network && NETWORK_LABEL[t.network] && (
                    <span className="text-[10px] text-stone-400 shrink-0">{NETWORK_LABEL[t.network]}</span>
                  )}
                  {RouteIcon && (
                    <span className="text-[10px] text-stone-400 shrink-0 flex items-center gap-0.5">
                      <RouteIcon className="w-3 h-3" />{ROUTE_TYPE_LABEL[t.routeType!]}
                    </span>
                  )}
                  {tier && (
                    <span className="text-[10px] text-stone-400 shrink-0">{DIFFICULTY_TIER_LABEL[tier]}</span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-stone-500">
                  <span className="flex items-center gap-1"><Route className="w-3 h-3" />{t.distanceKm != null ? `${t.distanceKm.toFixed(1)} km` : 'N/D'}</span>
                  <span className="flex items-center gap-1"><TrendingUp className="w-3 h-3" />{t.elevationGain != null ? `+${t.elevationGain} m` : 'N/D'}</span>
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{dur > 0 ? formatDurationSecs(dur) : 'N/D'}</span>
                </div>
              </div>
            </button>
          )
        })}

        {pendingCandidates.map(c => (
          <div key={c.id} className="px-4 py-3 border-b border-stone-100 flex items-center gap-3 animate-pulse">
            <div className="w-4 h-4 rounded-full bg-stone-200 shrink-0" />
            <div className="flex-1 min-w-0 space-y-1.5">
              <div className="h-3.5 w-2/3 bg-stone-200 rounded" />
              <div className="h-3 w-1/3 bg-stone-100 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
