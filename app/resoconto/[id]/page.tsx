'use client'
import { Suspense, useEffect, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import { getActivityById, type StoredActivity, type ActivityMeta } from '@/lib/blobStore'
import { formatDuration, msToKmh, type TrackPoint } from '@/lib/tcxParser'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { ctsLabel } from '@/lib/trailScore'
import AltimetryChart from '@/components/AltimetryChart'
import HRChart from '@/components/HRChart'
import SpeedChart from '@/components/SpeedChart'
import { ComfortTrailScoreWidget } from '@/components/ComfortTrailScoreWidget'
import ShareModal from '@/components/ShareModal'
import {
  ArrowLeft, Loader2, Mountain, Route, Clock, Heart, Zap, Flame,
  MapPin, Share2, BookOpen, PenLine, Box, X, Camera,
} from 'lucide-react'

const MapView    = dynamic(() => import('@/components/MapView'),    { ssr: false })
const RouteMap3D = dynamic(() => import('@/components/RouteMap3D'), { ssr: false })

// ── Types ─────────────────────────────────────────────────────────────────────

interface RoutePhoto {
  id: string
  dataUrl: string
  progress: number
  caption: string
  hasExifGps: boolean
  lat?: number
  lon?: number
}

type TabId = 'racconto' | 'scheda' | 'mappa' | 'poi' | 'statistiche' | 'condividi'
const TABS: { id: TabId; label: string }[] = [
  { id: 'racconto',    label: 'Racconto'    },
  { id: 'scheda',      label: 'Scheda'      },
  { id: 'mappa',       label: 'Mappa'       },
  { id: 'poi',         label: 'POI'         },
  { id: 'statistiche', label: 'Statistiche' },
  { id: 'condividi',   label: '📤 Condividi' },
]

interface HikeReport {
  id: string
  activity_id: string
  title: string
  content: string
  created_at: string
}

// ── CTS Widget ────────────────────────────────────────────────────────────────

function CtsCompareWidget({ actual, estimated }: { actual: number; estimated?: number }) {
  const info = ctsLabel(actual)
  return (
    <div className="rounded-[14px] p-4 text-white" style={{ background: 'linear-gradient(135deg, #1a3320, #2d5c38)' }}>
      <div className="flex items-center justify-between">
        <div className="flex-1 text-center">
          <p className="text-[10px] font-bold uppercase tracking-[2px] mb-1" style={{ color: '#7fd491' }}>CTS Reale</p>
          <p className="text-[42px] font-bold leading-none" style={{ fontFamily: "'DM Mono', monospace" }}>{actual}</p>
          <p className="text-[11px] mt-1 font-semibold" style={{ color: '#7fd491' }}>{info.label}</p>
        </div>
        {estimated != null && (
          <>
            <div className="flex flex-col items-center gap-1 px-3">
              <span className="text-[20px] opacity-40">→</span>
              <span className="text-[9px] uppercase tracking-wider opacity-50">vs</span>
            </div>
            <div className="flex-1 text-center opacity-60">
              <p className="text-[10px] font-bold uppercase tracking-[2px] mb-1" style={{ color: '#7fd491' }}>Stimato</p>
              <p className="text-[36px] font-bold leading-none" style={{ fontFamily: "'DM Mono', monospace" }}>{estimated}</p>
              <p className="text-[11px] mt-1">
                {actual > estimated
                  ? <span style={{ color: '#7fd491' }}>+{actual - estimated} ↑</span>
                  : <span className="text-white opacity-60">{actual - estimated}</span>}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Report text renderer ──────────────────────────────────────────────────────

function ReportText({ content }: { content: string }) {
  const paragraphs = content
    .replace(/^## .+$/gm, '')
    .replace(/\[curiosita\][\s\S]*?\[\/curiosita\]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .split('\n\n')
    .filter(p => p.trim())

  return (
    <div className="space-y-3">
      {paragraphs.map((p, i) => (
        <p
          key={i}
          className="text-[14px] leading-7 text-stone-600"
          style={{ fontFamily: "'Lora', serif", fontStyle: i === 0 ? 'italic' : 'normal' }}
        >
          {p.trim()}
        </p>
      ))}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

function ResocontoInner() {
  const { id }       = useParams() as { id: string }
  const actId        = decodeURIComponent(id)
  const router       = useRouter()
  const searchParams = useSearchParams()
  const initialTab   = (searchParams?.get('tab') as TabId | null) ?? 'racconto'

  const [activity,  setActivity]  = useState<StoredActivity | null>(null)
  const [report,    setReport]    = useState<HikeReport | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [tab, setTab]             = useState<TabId>(initialTab)
  const [showShare, setShowShare] = useState(false)

  // Photo state
  const [photos,       setPhotos]       = useState<RoutePhoto[]>([])
  const [coverPhotoId, setCoverPhotoId] = useState<string | null>(null)
  const [show3D,       setShow3D]       = useState(false)
  const [lightbox,     setLightbox]     = useState<RoutePhoto | null>(null)

  useEffect(() => {
    Promise.all([
      getActivityById(actId),
      fetch(`/api/resoconto?activityId=${encodeURIComponent(actId)}`).then(r => r.json()).catch(() => null),
    ]).then(([act, rep]) => {
      setActivity(act)
      setReport(Array.isArray(rep) ? rep[0] ?? null : rep)
    }).finally(() => setLoading(false))
  }, [actId])

  // Load photos + cover from localStorage
  useEffect(() => {
    if (!actId) return
    try {
      const raw = localStorage.getItem(`dtrek_vp_${actId}`)
      if (raw) {
        const parsed = JSON.parse(raw) as RoutePhoto[]
        setPhotos([...parsed].sort((a, b) => a.progress - b.progress))
      }
    } catch { /* localStorage non disponibile */ }
    const savedCover = localStorage.getItem(`dtrek_cover_${actId}`)
    if (savedCover) setCoverPhotoId(savedCover)
  }, [actId])

  const meta         = activity as (StoredActivity & ActivityMeta & { trailScore?: number; linkedPlannedTrailScore?: number; linkedPlannedTrackPoints?: TrackPoint[] }) | null
  const trackPoints  = activity?.trackPoints ?? []
  const cts          = meta?.trailScore != null ? Math.round(meta.trailScore) : null
  const ctsEstimated = meta?.linkedPlannedTrailScore != null ? Math.round(meta.linkedPlannedTrailScore) : undefined
  const maxHR        = meta?.maxHeartRate ?? 0
  const avgHR        = meta?.avgHeartRate ?? 0
  const maxSpd       = meta?.maxSpeedMs != null ? msToKmh(meta.maxSpeedMs) : null
  const avgSpd       = meta?.avgSpeedMs != null ? msToKmh(meta.avgSpeedMs) : null

  const heroPhoto    = photos.find(p => p.id === coverPhotoId) ?? photos[0] ?? null
  const stripPhotos  = photos.length >= 2 ? photos.slice(1, 5) : []

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#F0F7F1' }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#2d5c38' }} />
      </div>
    )
  }

  if (!activity || !meta) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: '#F0F7F1' }}>
        <p className="text-stone-500 text-lg">Escursione non trovata</p>
        <button onClick={() => router.push('/diario')} style={{ color: '#2d5c38' }} className="hover:underline">
          ← Torna al Diario
        </button>
      </div>
    )
  }

  const dateLabel = format(new Date(meta.startTime), "EEEE d MMMM yyyy", { locale: it })
  const title     = meta.title ?? 'Escursione'

  return (
    <div className="min-h-screen pb-20 md:pb-0" style={{ background: '#F0F7F1' }}>

      {/* ── Cover photo hero (non-sticky) ───────────────────────────── */}
      {heroPhoto ? (
        <div className="relative overflow-hidden" style={{ height: '220px' }}>
          <img
            src={heroPhoto.dataUrl}
            alt={heroPhoto.caption || title}
            className="w-full h-full object-cover"
          />
          <div
            className="absolute inset-0"
            style={{ background: 'linear-gradient(to top, rgba(26,51,32,.80) 0%, rgba(0,0,0,.20) 60%, transparent 100%)' }}
          />
          <div className="absolute inset-x-0 bottom-0 px-4 pb-3">
            <h1
              className="text-[20px] font-bold leading-tight text-white mb-0.5 capitalize"
              style={{ fontFamily: "'Lora', serif" }}
            >
              {title}
            </h1>
            <p className="text-[10px] capitalize" style={{ color: '#7fd491' }}>{dateLabel}</p>
          </div>
          {/* Back button overlay */}
          <div className="absolute top-3 left-4">
            <button
              onClick={() => router.push('/diario')}
              className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg"
              style={{ background: 'rgba(0,0,0,.30)', color: 'white' }}
            >
              <ArrowLeft className="w-4 h-4" />
              Diario
            </button>
          </div>
          {/* Resoconto badge */}
          <div className="absolute top-3 right-4">
            <span
              className="text-[9px] font-bold tracking-[2px] uppercase px-2 py-0.5 rounded-md"
              style={{ background: 'rgba(0,0,0,.30)', color: '#7fd491' }}
            >
              Resoconto
            </span>
          </div>
        </div>
      ) : (
        /* Gradient hero when no cover photo */
        <div
          className="relative overflow-hidden"
          style={{ background: 'linear-gradient(160deg, #1a3320 0%, #2d5c38 100%)', padding: '14px 16px 18px' }}
        >
          <div className="flex items-center justify-between mb-2">
            <button
              onClick={() => router.push('/diario')}
              className="flex items-center gap-1.5 text-sm font-medium"
              style={{ color: '#7fd491' }}
            >
              <ArrowLeft className="w-4 h-4" />
              Diario
            </button>
            <span
              className="text-[9px] font-bold tracking-[2px] uppercase px-2 py-0.5 rounded-md"
              style={{ background: 'rgba(255,255,255,.12)', color: '#7fd491' }}
            >
              Resoconto
            </span>
          </div>
          <h1
            className="text-[18px] font-bold leading-tight text-white mb-0.5 capitalize"
            style={{ fontFamily: "'Lora', serif" }}
          >
            {title}
          </h1>
          <p className="text-[10px] capitalize" style={{ color: '#7fd491' }}>{dateLabel}</p>
        </div>
      )}

      {/* ── Photo mosaic strip ──────────────────────────────────────── */}
      {stripPhotos.length > 0 && (
        <div className="flex overflow-hidden" style={{ height: '80px' }}>
          {stripPhotos.map(ph => (
            <button
              key={ph.id}
              onClick={() => setLightbox(ph)}
              className="flex-1 overflow-hidden"
            >
              <img
                src={ph.dataUrl}
                alt={ph.caption}
                className="w-full h-full object-cover hover:scale-105 transition-transform duration-200"
                style={{ objectPosition: 'center 40%' }}
              />
            </button>
          ))}
        </div>
      )}

      {/* ── Sticky tab bar ──────────────────────────────────────────── */}
      <div
        className="sticky top-0 z-40 border-b"
        style={{ background: '#1a3320', borderColor: 'rgba(255,255,255,.10)' }}
      >
        <div className="flex overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); if (t.id === 'condividi') setShowShare(true) }}
              className="flex-shrink-0 px-4 py-2.5 text-[12px] font-medium transition-colors"
              style={
                tab === t.id
                  ? { fontWeight: 700, color: 'white', borderBottom: '2px solid #4a9e5c', background: 'rgba(255,255,255,.06)' }
                  : { color: 'rgba(127,212,145,.60)', borderBottom: '2px solid transparent' }
              }
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab content ─────────────────────────────────────────────── */}
      <div className="px-4 py-4">

        {/* ── RACCONTO ──────────────────────────────────────────────── */}
        {tab === 'racconto' && (
          <div className="space-y-4">
            {/* CTS widget */}
            {cts != null && <CtsCompareWidget actual={cts} estimated={ctsEstimated} />}

            {/* Racconto or placeholder */}
            {report ? (
              <div className="bg-white rounded-[14px] p-4" style={{ boxShadow: '0 2px 12px rgba(0,0,0,.07)' }}>
                <ReportText content={report.content} />
              </div>
            ) : (
              <div
                className="rounded-[14px] p-5 flex flex-col items-center gap-3 text-center"
                style={{ background: '#F0F7F1', border: '2px dashed #4a9e5c' }}
              >
                <PenLine className="w-8 h-8" style={{ color: '#4a9e5c' }} />
                <div>
                  <p className="font-bold text-sm" style={{ color: '#1a3320', fontFamily: "'Lora', serif" }}>
                    Racconto da scrivere
                  </p>
                  <p className="text-xs mt-1" style={{ color: '#8a7f6e' }}>
                    Apri l&apos;escursione per generare il racconto con Giulia
                  </p>
                </div>
                <button
                  onClick={() => router.push(`/escursione/${encodeURIComponent(actId)}`)}
                  className="px-5 py-2.5 rounded-full text-white text-sm font-semibold"
                  style={{ background: '#2d5c38' }}
                >
                  Scrivi il racconto
                </button>
              </div>
            )}

            {/* ── Photo gallery ──────────────────────────────────────── */}
            {photos.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-bold uppercase tracking-[2px]" style={{ color: '#4a9e5c' }}>
                    Le mie foto ({photos.length})
                  </p>
                  <button
                    onClick={() => router.push(`/escursione/${encodeURIComponent(actId)}`)}
                    className="text-[10px] font-semibold flex items-center gap-1"
                    style={{ color: '#2d5c38' }}
                  >
                    <Camera className="w-3 h-3" />
                    Gestisci foto
                  </button>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
                  {photos.map((ph, i) => (
                    <button
                      key={ph.id}
                      onClick={() => setLightbox(ph)}
                      className="shrink-0 rounded-[10px] overflow-hidden"
                      style={{ width: '110px', boxShadow: '0 2px 8px rgba(0,0,0,.12)' }}
                    >
                      <img
                        src={ph.dataUrl}
                        alt={ph.caption}
                        style={{ width: '110px', height: '82px', objectFit: 'cover' }}
                      />
                      {ph.caption && (
                        <div className="bg-white px-1.5 py-1">
                          <p
                            className="text-[9px] leading-tight truncate"
                            style={{ color: '#5e564c', fontStyle: 'italic' }}
                          >
                            {i + 1}. {ph.caption}
                          </p>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Add photos CTA (when no photos yet) */}
            {photos.length === 0 && (
              <button
                onClick={() => router.push(`/escursione/${encodeURIComponent(actId)}`)}
                className="w-full flex items-center gap-2.5 px-4 py-3 rounded-[14px] text-sm"
                style={{ background: 'rgba(74,158,92,.08)', border: '1.5px dashed #4a9e5c', color: '#2d5c38' }}
              >
                <Camera className="w-4 h-4 shrink-0" />
                <span className="font-medium">Aggiungi foto all&apos;escursione</span>
              </button>
            )}
          </div>
        )}

        {/* ── SCHEDA ────────────────────────────────────────────────── */}
        {tab === 'scheda' && (
          <div className="space-y-3">
            <div className="bg-white rounded-[14px] overflow-hidden" style={{ boxShadow: '0 2px 12px rgba(0,0,0,.07)' }}>
              {[
                ['Distanza',      `${(meta.distanceMeters / 1000).toFixed(2)} km`],
                ['Dislivello D+', `${Math.round(meta.elevationGain)} m`],
                ['Dislivello D−', `${Math.round(meta.elevationLoss)} m`],
                ['Durata',        formatDuration(meta.totalTimeSeconds)],
                ['Quota max',     `${Math.round(meta.altitudeMax)} m`],
                avgSpd != null ? ['Velocità media', `${avgSpd.toFixed(1)} km/h`] : null,
                maxSpd != null ? ['Velocità max',   `${maxSpd.toFixed(1)} km/h`] : null,
                avgHR > 0 ? ['FC media', `${avgHR} bpm`] : null,
                maxHR > 0 ? ['FC max',   `${maxHR} bpm`] : null,
                cts != null   ? ['CTS reale',   String(cts)] : null,
                ctsEstimated != null ? ['CTS stimato', String(ctsEstimated)] : null,
              ].filter(Boolean).map((row, i, arr) => {
                const [label, value] = row as [string, string]
                return (
                  <div key={label} className="flex items-center justify-between px-4 py-3"
                    style={{ borderBottom: i < arr.length - 1 ? '1px solid #f0f5f9' : 'none' }}
                  >
                    <span className="text-[11px] uppercase tracking-[1px] font-semibold" style={{ color: '#8a7f6e' }}>{label}</span>
                    <span className="text-[15px] font-bold" style={{ color: '#1a3320', fontFamily: "'DM Mono', monospace" }}>{value}</span>
                  </div>
                )
              })}
            </div>

            {cts != null && (
              <ComfortTrailScoreWidget
                result={null}
                cached={cts}
                compareWith={ctsEstimated}
              />
            )}
          </div>
        )}

        {/* ── MAPPA ─────────────────────────────────────────────────── */}
        {tab === 'mappa' && (
          <div className="space-y-3">

            {/* Vista 3D button */}
            {trackPoints.length > 1 && (
              <div className="flex justify-end">
                <button
                  onClick={() => setShow3D(true)}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-[10px] text-sm font-semibold text-white shadow-sm"
                  style={{ background: '#2d5c38' }}
                >
                  <Box className="w-4 h-4" />
                  Vista 3D / Video
                </button>
              </div>
            )}

            <div className="rounded-[14px] overflow-hidden" style={{ height: '55vh', minHeight: '280px' }}>
              {trackPoints.length > 1 ? (
                <MapView trackPoints={trackPoints} height="55vh" />
              ) : (
                <div className="h-full flex items-center justify-center bg-stone-100 rounded-[14px]">
                  <p className="text-stone-400 text-sm">Nessuna traccia disponibile</p>
                </div>
              )}
            </div>

            {trackPoints.length > 0 && (
              <div className="bg-white rounded-[14px] p-4" style={{ boxShadow: '0 2px 12px rgba(0,0,0,.07)' }}>
                <p className="text-[10px] font-bold uppercase tracking-[1.5px] mb-3" style={{ color: '#4a9e5c' }}>
                  Profilo altimetrico
                </p>
                <AltimetryChart trackPoints={trackPoints} mode="actual" />
              </div>
            )}
          </div>
        )}

        {/* ── POI ───────────────────────────────────────────────────── */}
        {tab === 'poi' && (
          <div className="flex flex-col items-center py-12 gap-4 text-center" style={{ color: '#a9a18e' }}>
            <MapPin className="w-10 h-10 opacity-30" />
            <div>
              <p className="text-sm font-medium">Punti di interesse</p>
              <p className="text-xs mt-1">I POI vengono caricati dalla mappa</p>
            </div>
            <button
              onClick={() => setTab('mappa')}
              className="px-4 py-2 rounded-full text-sm font-semibold text-white"
              style={{ background: '#2d5c38' }}
            >
              Vai alla Mappa
            </button>
          </div>
        )}

        {/* ── STATISTICHE ───────────────────────────────────────────── */}
        {tab === 'statistiche' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Distanza',  value: `${(meta.distanceMeters/1000).toFixed(2)} km`, icon: <Route    className="w-4 h-4" /> },
                { label: 'Durata',    value: formatDuration(meta.totalTimeSeconds),          icon: <Clock    className="w-4 h-4" /> },
                avgHR > 0 ? { label: 'FC media', value: `${avgHR} bpm`, icon: <Heart className="w-4 h-4" /> } : null,
                maxHR > 0 ? { label: 'FC max',   value: `${maxHR} bpm`, icon: <Zap   className="w-4 h-4" /> } : null,
                { label: 'D+ totale', value: `${Math.round(meta.elevationGain)} m`,          icon: <Mountain className="w-4 h-4" /> },
                meta.calories > 0 ? { label: 'Calorie', value: `${meta.calories} kcal`, icon: <Flame className="w-4 h-4" /> } : null,
              ].filter(Boolean).map((s, i) => (
                <div key={i} className="bg-white rounded-[12px] p-3" style={{ boxShadow: '0 1px 6px rgba(0,0,0,.05)' }}>
                  <div className="flex items-center gap-1.5 mb-1" style={{ color: '#4a9e5c' }}>
                    {s!.icon}
                    <span className="text-[9px] font-bold uppercase tracking-[1px]">{s!.label}</span>
                  </div>
                  <p className="text-[18px] font-bold" style={{ color: '#1a3320', fontFamily: "'DM Mono', monospace" }}>
                    {s!.value}
                  </p>
                </div>
              ))}
            </div>

            {trackPoints.length > 0 && (
              <div className="space-y-3">
                <div className="bg-white rounded-[14px] p-4" style={{ boxShadow: '0 2px 12px rgba(0,0,0,.07)' }}>
                  <p className="text-[10px] font-bold uppercase tracking-[1.5px] mb-3" style={{ color: '#4a9e5c' }}>Altimetria</p>
                  <AltimetryChart trackPoints={trackPoints} mode="actual" />
                </div>
                {avgHR > 0 && (
                  <div className="bg-white rounded-[14px] p-4" style={{ boxShadow: '0 2px 12px rgba(0,0,0,.07)' }}>
                    <p className="text-[10px] font-bold uppercase tracking-[1.5px] mb-3" style={{ color: '#4a9e5c' }}>Frequenza cardiaca</p>
                    <HRChart trackPoints={trackPoints} avgHR={avgHR} maxHR={maxHR} />
                  </div>
                )}
                <div className="bg-white rounded-[14px] p-4" style={{ boxShadow: '0 2px 12px rgba(0,0,0,.07)' }}>
                  <p className="text-[10px] font-bold uppercase tracking-[1.5px] mb-3" style={{ color: '#4a9e5c' }}>Velocità</p>
                  <SpeedChart trackPoints={trackPoints} avgSpeedMs={meta.avgSpeedMs ?? 0} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── CONDIVIDI ─────────────────────────────────────────────── */}
        {tab === 'condividi' && (
          <div className="space-y-4">
            <div className="bg-white rounded-[14px] p-5 text-center" style={{ boxShadow: '0 2px 12px rgba(0,0,0,.07)' }}>
              <Share2 className="w-10 h-10 mx-auto mb-3" style={{ color: '#4a9e5c' }} />
              <p className="font-bold text-base mb-1" style={{ color: '#1a3320', fontFamily: "'Lora', serif" }}>
                Condividi questa escursione
              </p>
              <p className="text-sm mb-4" style={{ color: '#8a7f6e' }}>
                Scegli il formato e condividi la tua avventura
              </p>
              <button
                onClick={() => setShowShare(true)}
                className="w-full py-3 rounded-[14px] text-white font-semibold text-sm"
                style={{ background: '#2d5c38' }}
              >
                Apri opzioni di condivisione
              </button>
            </div>
          </div>
        )}

      </div>

      {/* ── Share Modal ──────────────────────────────────────────────── */}
      {showShare && (
        <ShareModal
          kind="activity"
          activity={meta as unknown as import('@/lib/blobStore').ActivityMeta}
          onClose={() => { setShowShare(false); if (tab === 'condividi') setTab('condividi') }}
        />
      )}

      {/* ── RouteMap3D overlay ───────────────────────────────────────── */}
      {show3D && (
        <RouteMap3D
          trackPoints={activity.trackPoints}
          title={meta.title}
          onClose={() => setShow3D(false)}
          plannedTrackPoints={meta.linkedPlannedTrackPoints}
          activityId={actId}
          distanceMeters={meta.distanceMeters}
          elevationGain={meta.elevationGain}
        />
      )}

      {/* ── Lightbox ────────────────────────────────────────────────── */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,.92)' }}
          onClick={() => setLightbox(null)}
        >
          <button className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors">
            <X className="w-6 h-6" />
          </button>
          <div className="max-w-lg w-full" onClick={e => e.stopPropagation()}>
            <img
              src={lightbox.dataUrl}
              alt={lightbox.caption}
              className="w-full rounded-2xl shadow-2xl"
            />
            {lightbox.caption && (
              <p className="text-sm italic text-white/70 text-center mt-3"
                style={{ fontFamily: "'Lora', serif" }}>
                {lightbox.caption}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── BookOpen shortcut (no racconto) ─────────────────────────── */}
      {!report && tab !== 'racconto' && (
        <button
          onClick={() => setTab('racconto')}
          className="fixed bottom-24 right-4 w-12 h-12 rounded-full flex items-center justify-center shadow-lg md:hidden"
          style={{ background: '#2d5c38', zIndex: 40 }}
          title="Vai al Racconto"
        >
          <BookOpen className="w-5 h-5 text-white" />
        </button>
      )}

    </div>
  )
}

export default function ResocontoPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" style={{ background: '#F0F7F1' }} />}>
      <ResocontoInner />
    </Suspense>
  )
}
