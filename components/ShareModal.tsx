'use client'
import { useState, useEffect, useRef } from 'react'
import { X, Download, Facebook, Copy, Check, Share2, Loader2, Globe, ExternalLink, Trash2 } from 'lucide-react'

const KIND_TITLE: Record<string, string> = {
  activity:   'La mia escursione',
  stats:      'Le mie statistiche di trekking',
  comparison: 'Confronto escursioni',
  map:        'Le mie escursioni',
}
import {
  ShareFormat,
  ActivityShareOpts, StatsShareOpts, ComparisonShareOpts, MapShareOpts,
  generateActivityImage, generateStatsImage, generateComparisonImage, generateMapImage,
} from '@/utils/shareImage'
import { ActivityMeta } from '@/lib/blobStore'

// ─── Toggle ────────────────────────────────────────────────────────────────────

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer select-none">
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`w-9 h-5 rounded-full relative transition-colors ${checked ? 'bg-forest-500' : 'bg-stone-200'}`}
      >
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${checked ? 'left-4' : 'left-0.5'}`} />
      </button>
      <span className="text-sm text-stone-600">{label}</span>
    </label>
  )
}

// ─── Props ─────────────────────────────────────────────────────────────────────

interface ActivityShareProps { kind: 'activity';    activity: ActivityMeta;  onClose: () => void }
interface StatsShareProps    { kind: 'stats';       activities: ActivityMeta[]; onClose: () => void }
interface CompareShareProps  { kind: 'comparison';  activities: ActivityMeta[]; onClose: () => void }
interface MapShareProps      { kind: 'map';         activities: ActivityMeta[]; onClose: () => void }
export type ShareModalProps = ActivityShareProps | StatsShareProps | CompareShareProps | MapShareProps

// ─── Modal ─────────────────────────────────────────────────────────────────────

export default function ShareModal(props: ShareModalProps) {
  const { onClose } = props
  const [fmt, setFmt]           = useState<ShareFormat>('9:16')
  const [imageUrl, setImageUrl] = useState('')
  const [generating, setGen]    = useState(false)
  const [copied, setCopied]     = useState(false)
  const [canNativeShare, setCanNativeShare] = useState(false)
  const [shareToken, setShareToken] = useState<string | null>(null)
  const [linkBusy, setLinkBusy]     = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const cancelRef               = useRef(false)

  const activityId = props.kind === 'activity' ? props.activity.id : null
  const publicUrl  = shareToken && typeof window !== 'undefined' ? `${window.location.origin}/s/${shareToken}` : ''

  // Load any existing public-link token for this activity
  useEffect(() => {
    if (!activityId) return
    let cancelled = false
    fetch(`/api/share?id=${encodeURIComponent(activityId)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled && d) setShareToken(d.token ?? null) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [activityId])

  const createLink = async () => {
    if (!activityId) return
    setLinkBusy(true)
    try {
      const res = await fetch('/api/share', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: activityId }),
      })
      const d = await res.json()
      if (res.ok && d.token) setShareToken(d.token)
    } finally { setLinkBusy(false) }
  }

  const revokeLink = async () => {
    if (!activityId) return
    setLinkBusy(true)
    try {
      await fetch(`/api/share?id=${encodeURIComponent(activityId)}`, { method: 'DELETE' })
      setShareToken(null)
    } finally { setLinkBusy(false) }
  }

  const copyLink = async () => {
    if (!publicUrl) return
    try {
      if (canNativeShare && navigator.share) {
        await navigator.share({ title: 'La mia escursione su DTrek', url: publicUrl })
      } else {
        await navigator.clipboard.writeText(publicUrl)
        setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2200)
      }
    } catch { /* cancelled */ }
  }

  // Native share sheet is only useful when the device can share files (mobile)
  useEffect(() => {
    try {
      const probe = new File([new Blob()], 'p.png', { type: 'image/png' })
      setCanNativeShare(!!navigator.canShare && navigator.canShare({ files: [probe] }))
    } catch { setCanNativeShare(false) }
  }, [])

  const [actOpts, setActOpts] = useState<ActivityShareOpts>({
    showMap: true, showRoute: true,
    showDistance: true, showElevation: true,
    showDuration: true, showHR: true, showCalories: true, showDate: true,
    showProfile: true, showScore: true,
  })
  const [statsOpts, setStatsOpts] = useState<StatsShareOpts>({
    showTotals: true, showStreaks: true, showRecords: true,
  })
  const [cmpOpts, setCmpOpts] = useState<ComparisonShareOpts>({
    showDistance: true, showElevation: true, showDuration: true,
    showHR: true, showCalories: true, showPace: false,
  })
  const [mapOpts, setMapOpts] = useState<MapShareOpts>({ showCount: true })

  // Regenerate image whenever anything relevant changes
  useEffect(() => {
    cancelRef.current = false
    setGen(true)
    setImageUrl('')

    const run = async () => {
      try {
        let url = ''
        if (props.kind === 'activity') {
          url = await generateActivityImage(props.activity, actOpts, fmt)
        } else if (props.kind === 'stats') {
          url = await generateStatsImage(props.activities, statsOpts, fmt)
        } else if (props.kind === 'comparison') {
          url = await generateComparisonImage(props.activities, cmpOpts, fmt)
        } else if (props.kind === 'map') {
          url = await generateMapImage(props.activities, mapOpts, fmt)
        }
        if (!cancelRef.current) { setImageUrl(url); setGen(false) }
      } catch (e) {
        console.error('Share image error:', e)
        if (!cancelRef.current) setGen(false)
      }
    }

    run()
    return () => { cancelRef.current = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    fmt, actOpts, statsOpts, cmpOpts, mapOpts, props.kind,
    (props as ActivityShareProps).activity?.id,
    (props as StatsShareProps).activities?.length,
  ])

  const handleDownload = () => {
    const a = document.createElement('a')
    a.href = imageUrl
    a.download = `dtrek-${props.kind}-${Date.now()}.png`
    a.click()
  }

  const handleNativeShare = async () => {
    if (!imageUrl) return
    try {
      const blob = await fetch(imageUrl).then(r => r.blob())
      const file = new File([blob], `dtrek-${props.kind}-${Date.now()}.png`, { type: 'image/png' })
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: KIND_TITLE[props.kind] ?? 'DTrek',
          text:  `${KIND_TITLE[props.kind] ?? ''} · tracciato con DTrek 🥾`,
        })
      } else {
        handleDownload()
      }
    } catch {
      // user cancelled the share sheet — no-op
    }
  }

  const handleFacebook = () => {
    window.open(
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(window.location.href)}`,
      '_blank', 'width=600,height=400,noopener',
    )
  }

  const handleCopy = async () => {
    try {
      const blob = await fetch(imageUrl).then(r => r.blob())
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    } catch {
      await navigator.clipboard.writeText(window.location.href).catch(() => {})
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2200)
  }

  const options = () => {
    if (props.kind === 'activity') {
      const hasPolyline = !!(props.activity.routePolyline && props.activity.routePolyline.length > 1)
      const hasProfile  = !!(props.activity.elevationProfile && props.activity.elevationProfile.length > 3)
      const hasScore    = typeof props.activity.trailScore === 'number' && props.activity.trailScore > 0
      return (
        <div className="space-y-2.5">
          {hasPolyline && (
            <>
              <Toggle label="Mappa geografica (OSM)" checked={actOpts.showMap}     onChange={v => setActOpts(o => ({ ...o, showMap: v, showRoute: v ? false : o.showRoute }))} />
              {!actOpts.showMap && (
                <Toggle label="Percorso (astratto)"   checked={actOpts.showRoute}   onChange={v => setActOpts(o => ({ ...o, showRoute: v }))} />
              )}
            </>
          )}
          {hasScore   && <Toggle label="Badge TrailScore"    checked={actOpts.showScore}   onChange={v => setActOpts(o => ({ ...o, showScore: v }))} />}
          {hasProfile && <Toggle label="Profilo altimetrico" checked={actOpts.showProfile} onChange={v => setActOpts(o => ({ ...o, showProfile: v }))} />}
          <Toggle label="Data"               checked={actOpts.showDate}      onChange={v => setActOpts(o => ({ ...o, showDate: v }))} />
          <Toggle label="Distanza"           checked={actOpts.showDistance}  onChange={v => setActOpts(o => ({ ...o, showDistance: v }))} />
          <Toggle label="Dislivello"         checked={actOpts.showElevation} onChange={v => setActOpts(o => ({ ...o, showElevation: v }))} />
          <Toggle label="Durata"             checked={actOpts.showDuration}  onChange={v => setActOpts(o => ({ ...o, showDuration: v }))} />
          <Toggle label="Frequenza cardiaca" checked={actOpts.showHR}        onChange={v => setActOpts(o => ({ ...o, showHR: v }))} />
          <Toggle label="Calorie"            checked={actOpts.showCalories}  onChange={v => setActOpts(o => ({ ...o, showCalories: v }))} />
        </div>
      )
    }
    if (props.kind === 'stats') return (
      <div className="space-y-2.5">
        <Toggle label="Totali (km, tempo, calorie, D+)" checked={statsOpts.showTotals}  onChange={v => setStatsOpts(o => ({ ...o, showTotals: v }))} />
        <Toggle label="Streak"                           checked={statsOpts.showStreaks} onChange={v => setStatsOpts(o => ({ ...o, showStreaks: v }))} />
        <Toggle label="Record personali"                 checked={statsOpts.showRecords} onChange={v => setStatsOpts(o => ({ ...o, showRecords: v }))} />
      </div>
    )
    if (props.kind === 'comparison') return (
      <div className="space-y-2.5">
        <Toggle label="Distanza"           checked={cmpOpts.showDistance}  onChange={v => setCmpOpts(o => ({ ...o, showDistance: v }))} />
        <Toggle label="Dislivello"         checked={cmpOpts.showElevation} onChange={v => setCmpOpts(o => ({ ...o, showElevation: v }))} />
        <Toggle label="Durata"             checked={cmpOpts.showDuration}  onChange={v => setCmpOpts(o => ({ ...o, showDuration: v }))} />
        <Toggle label="Frequenza cardiaca" checked={cmpOpts.showHR}        onChange={v => setCmpOpts(o => ({ ...o, showHR: v }))} />
        <Toggle label="Calorie"            checked={cmpOpts.showCalories}  onChange={v => setCmpOpts(o => ({ ...o, showCalories: v }))} />
        <Toggle label="Passo medio"        checked={cmpOpts.showPace}      onChange={v => setCmpOpts(o => ({ ...o, showPace: v }))} />
      </div>
    )
    if (props.kind === 'map') return (
      <div className="space-y-2.5">
        <Toggle label="Numero di percorsi" checked={mapOpts.showCount} onChange={v => setMapOpts(o => ({ ...o, showCount: v }))} />
      </div>
    )
    return null
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100 shrink-0">
          <div className="flex items-center gap-2">
            <Share2 className="w-5 h-5 text-forest-600" />
            <h2 className="font-semibold text-stone-800">Condividi</h2>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Preview */}
            <div>
              <p className="text-xs font-semibold text-stone-400 uppercase tracking-widest mb-2">Anteprima</p>
              <div
                className="rounded-xl overflow-hidden bg-[#1a3c26] flex items-center justify-center relative mx-auto"
                style={{
                  aspectRatio: fmt === '1:1' ? '1/1' : fmt === '9:16' ? '9/16' : '16/9',
                  maxHeight: '56vh',
                  width: fmt === '9:16' ? 'auto' : '100%',
                }}
              >
                {generating && (
                  <div className="absolute inset-0 flex items-center justify-center bg-[#1a3c26]">
                    <Loader2 className="w-8 h-8 text-forest-400 animate-spin" />
                    <span className="ml-2 text-forest-400 text-sm">Generazione…</span>
                  </div>
                )}
                {imageUrl && !generating && (
                  <img src={imageUrl} alt="anteprima condivisione" className="w-full h-full object-contain" />
                )}
              </div>
              {props.kind === 'activity' && actOpts.showMap && (
                <p className="text-[10px] text-stone-400 mt-1.5 text-center">
                  Mappa © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="underline hover:text-stone-600">OpenStreetMap</a> contributors
                </p>
              )}
            </div>

            {/* Options */}
            <div className="space-y-5">
              {/* Format */}
              <div>
                <p className="text-xs font-semibold text-stone-400 uppercase tracking-widest mb-2">Formato</p>
                <div className="flex gap-2">
                  {([
                    { f: '9:16', main: 'Storia',  sub: '9:16' },
                    { f: '1:1',  main: 'Post',    sub: '1:1'  },
                    { f: '16:9', main: 'Orizz.',  sub: '16:9' },
                  ] as { f: ShareFormat; main: string; sub: string }[]).map(({ f, main, sub }) => (
                    <button
                      key={f}
                      onClick={() => setFmt(f)}
                      className={`flex-1 py-2 rounded-lg border transition-all flex flex-col items-center leading-tight
                        ${fmt === f
                          ? 'bg-forest-50 border-forest-400 text-forest-700'
                          : 'bg-white border-stone-200 text-stone-500 hover:border-stone-300'}`}
                    >
                      <span className="text-sm font-semibold">{main}</span>
                      <span className="text-[10px] opacity-70">{sub}</span>
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-stone-400 mt-1.5">
                  Storia per Instagram / TikTok / WhatsApp Status · Post per il feed · Orizzontale per Facebook
                </p>
              </div>

              {/* Content */}
              <div>
                <p className="text-xs font-semibold text-stone-400 uppercase tracking-widest mb-3">Contenuto</p>
                {options()}
              </div>

              {/* Note */}
              <div className="bg-stone-50 border border-stone-200 rounded-xl p-3 text-xs text-stone-500 leading-relaxed space-y-1">
                <p><span className="font-semibold text-stone-700">Instagram:</span> scarica l&apos;immagine e condividila dal Feed o nelle Storie.</p>
                <p><span className="font-semibold text-stone-700">Facebook:</span> scarica e carica nel post, oppure usa il pulsante per condividere la pagina.</p>
              </div>

              {/* Actions */}
              <div className="space-y-2">
                {canNativeShare && (
                  <button
                    onClick={handleNativeShare}
                    disabled={!imageUrl || generating}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-forest-600 hover:bg-forest-700 text-white rounded-xl font-medium text-sm transition-colors disabled:opacity-40"
                  >
                    <Share2 className="w-4 h-4" /> Condividi
                  </button>
                )}
                <button
                  onClick={handleDownload}
                  disabled={!imageUrl || generating}
                  className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-medium text-sm transition-colors disabled:opacity-40
                    ${canNativeShare
                      ? 'bg-white border border-stone-200 text-stone-600 hover:border-stone-300'
                      : 'bg-forest-600 hover:bg-forest-700 text-white'}`}
                >
                  <Download className="w-4 h-4" /> Scarica immagine (.png)
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={handleFacebook}
                    className="flex items-center justify-center gap-2 py-2.5 bg-[#1877f2] hover:bg-[#1464d8] text-white rounded-xl text-sm font-medium transition-colors"
                  >
                    <Facebook className="w-4 h-4" /> Facebook
                  </button>
                  <button
                    onClick={handleCopy}
                    disabled={!imageUrl || generating}
                    className={`flex items-center justify-center gap-2 py-2.5 border rounded-xl text-sm font-medium transition-all disabled:opacity-40
                      ${copied
                        ? 'bg-forest-50 border-forest-300 text-forest-700'
                        : 'bg-white border-stone-200 text-stone-600 hover:border-stone-300'}`}
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copied ? 'Copiata!' : 'Copia immagine'}
                  </button>
                </div>
              </div>

              {/* Public link — activity only */}
              {props.kind === 'activity' && (
                <div className="border-t border-stone-100 pt-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Globe className="w-4 h-4 text-sky-600" />
                    <p className="text-xs font-semibold text-stone-700 uppercase tracking-widest">Link pubblico</p>
                  </div>
                  <p className="text-xs text-stone-500 leading-relaxed mb-3">
                    Crea un link condivisibile ovunque (WhatsApp, Telegram, X…): mostra un&apos;anteprima ricca con mappa, statistiche e TrailScore. Solo chi ha il link può vederlo.
                  </p>
                  {!shareToken ? (
                    <button
                      onClick={createLink}
                      disabled={linkBusy}
                      className="w-full flex items-center justify-center gap-2 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-40"
                    >
                      {linkBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
                      Crea link pubblico
                    </button>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 bg-stone-50 border border-stone-200 rounded-xl px-3 py-2">
                        <input
                          readOnly
                          value={publicUrl}
                          onFocus={e => e.target.select()}
                          className="flex-1 bg-transparent text-xs text-stone-600 outline-none min-w-0"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={copyLink}
                          className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all border
                            ${linkCopied
                              ? 'bg-sky-50 border-sky-300 text-sky-700'
                              : 'bg-sky-600 hover:bg-sky-700 text-white border-sky-600'}`}
                        >
                          {linkCopied ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
                          {linkCopied ? 'Copiato!' : canNativeShare ? 'Condividi link' : 'Copia link'}
                        </button>
                        <a
                          href={publicUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-center gap-2 py-2.5 border border-stone-200 rounded-xl text-sm font-medium text-stone-600 hover:border-stone-300 transition-colors"
                        >
                          <ExternalLink className="w-4 h-4" /> Apri
                        </a>
                      </div>
                      <button
                        onClick={revokeLink}
                        disabled={linkBusy}
                        className="w-full flex items-center justify-center gap-2 py-2 text-xs font-medium text-red-500 hover:text-red-600 transition-colors disabled:opacity-40"
                      >
                        {linkBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        Disattiva link pubblico
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
