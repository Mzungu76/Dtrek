'use client'
import { useState, useEffect, useRef } from 'react'
import { X, Download, Facebook, Copy, Check, Share2, Loader2, Globe, ExternalLink, Trash2, Images, Image as ImageIcon, ChevronLeft, ChevronRight } from 'lucide-react'

const KIND_TITLE: Record<string, string> = {
  activity:   'La mia escursione',
  stats:      'Le mie statistiche di trekking',
  comparison: 'Confronto escursioni',
  map:        'Le mie escursioni',
}
import {
  ShareFormat, FORMAT_DIMS,
  ActivityShareOpts, StatsShareOpts, ComparisonShareOpts, MapShareOpts,
  CarouselOpts, CarouselSlide,
  generateActivityImage, generateStatsImage, generateComparisonImage, generateMapImage, generateCarousel,
} from '@/utils/shareImage'
import { ActivityMeta } from '@/lib/blobStore'
import type { RoutePhoto } from '@/lib/activityPhotos'

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

interface ActivityShareProps { kind: 'activity';    activity: ActivityMeta; photos?: RoutePhoto[]; onClose: () => void }
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

  // ── Modalità carosello (solo per la condivisione di una singola escursione con foto) ─────────
  const availablePhotos = props.kind === 'activity' ? (props.photos ?? []) : []
  const [mode, setMode] = useState<'single' | 'carousel'>('single')
  const [includeIds, setIncludeIds] = useState<string[]>(() => availablePhotos.map(p => p.id))
  const [captionOverrides, setCaptionOverrides] = useState<Record<string, string>>({})
  const [showDataSlide, setShowDataSlide] = useState(true)
  const [carouselSlides, setCarouselSlides] = useState<CarouselSlide[]>([])
  const [carouselIndex, setCarouselIndex] = useState(0)

  // Volutamente solo su `.length`: `availablePhotos` è derivato da props ad ogni render (nuova
  // identità di array ogni volta), includerlo risincronizzerebbe la selezione ad ogni render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setIncludeIds(availablePhotos.map(p => p.id)) }, [availablePhotos.length])

  const togglePhoto = (id: string) => setIncludeIds(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id])

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

  const createLink = async (): Promise<string | null> => {
    if (!activityId) return null
    setLinkBusy(true)
    try {
      const res = await fetch('/api/share', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: activityId }),
      })
      const d = await res.json()
      if (res.ok && d.token) { setShareToken(d.token); return d.token as string }
      return null
    } finally { setLinkBusy(false) }
  }

  // Il link pubblico `/s/{token}` è l'unico URL che ha senso condividere fuori dall'app: la pagina
  // del modale stessa è privata e autenticata. Lo crea al volo se non esiste ancora — prima questo
  // mancava del tutto e Facebook/Copia condividevano `window.location.href`, che per chi apre il
  // link dal feed è una pagina di login.
  const getShareUrl = async (): Promise<string | null> => {
    if (props.kind !== 'activity') return null
    if (publicUrl) return publicUrl
    const token = await createLink()
    return token ? `${window.location.origin}/s/${token}` : null
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
    showProfile: true,
  })
  const [statsOpts, setStatsOpts] = useState<StatsShareOpts>({
    showTotals: true, showStreaks: true, showRecords: true,
  })
  const [cmpOpts, setCmpOpts] = useState<ComparisonShareOpts>({
    showDistance: true, showElevation: true, showDuration: true,
    showHR: true, showCalories: true, showPace: false,
  })
  const [mapOpts, setMapOpts] = useState<MapShareOpts>({ showCount: true })

  // Regenerate image (o la sequenza del carosello) whenever anything relevant changes
  useEffect(() => {
    cancelRef.current = false
    setGen(true)
    setImageUrl('')
    setCarouselSlides([])
    setCarouselIndex(0)

    const run = async () => {
      try {
        if (props.kind === 'activity' && mode === 'carousel') {
          const opts: CarouselOpts = { mapOpts: actOpts, includePhotoIds: includeIds, captions: captionOverrides, showDataSlide }
          const slides = await generateCarousel(props.activity, availablePhotos, opts, fmt)
          if (!cancelRef.current) { setCarouselSlides(slides); setGen(false) }
          return
        }
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
    fmt, actOpts, statsOpts, cmpOpts, mapOpts, props.kind, mode, includeIds, captionOverrides, showDataSlide,
    (props as ActivityShareProps).activity?.id,
    (props as StatsShareProps).activities?.length,
  ])

  // URL della scheda attualmente mostrata/azionabile: quella singola, o la scheda del carosello
  // messa a fuoco nell'anteprima.
  const currentImageUrl = mode === 'carousel' ? (carouselSlides[carouselIndex]?.url ?? '') : imageUrl
  const hasContent = mode === 'carousel' ? carouselSlides.length > 0 : !!imageUrl

  const handleDownload = () => {
    if (!currentImageUrl) return
    const a = document.createElement('a')
    a.href = currentImageUrl
    a.download = mode === 'carousel'
      ? `dtrek-carosello-${carouselIndex + 1}-${Date.now()}.png`
      : `dtrek-${props.kind}-${Date.now()}.png`
    a.click()
  }

  const handleDownloadAll = async () => {
    if (carouselSlides.length === 0) return
    const { zipSync } = await import('fflate')
    const files: Record<string, Uint8Array> = {}
    carouselSlides.forEach((s, i) => {
      const b64 = s.url.split(',')[1]
      const bin = atob(b64)
      const bytes = new Uint8Array(bin.length)
      for (let j = 0; j < bin.length; j++) bytes[j] = bin.charCodeAt(j)
      files[`dtrek-${String(i + 1).padStart(2, '0')}-${s.kind}.png`] = bytes
    })
    const blob = new Blob([zipSync(files)], { type: 'application/zip' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `dtrek-carosello-${Date.now()}.zip`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleNativeShare = async () => {
    if (mode === 'carousel') {
      if (carouselSlides.length === 0) return
      try {
        const files = await Promise.all(carouselSlides.map(async (s, i) => {
          const blob = await fetch(s.url).then(r => r.blob())
          return new File([blob], `dtrek-${i + 1}-${s.kind}.png`, { type: 'image/png' })
        }))
        if (navigator.canShare && navigator.canShare({ files })) {
          await navigator.share({ files, title: KIND_TITLE.activity, text: `${KIND_TITLE.activity} · tracciato con DTrek 🥾` })
        } else {
          await handleDownloadAll()
        }
      } catch { /* utente ha annullato la condivisione — nessuna azione */ }
      return
    }
    if (!currentImageUrl) return
    try {
      const blob = await fetch(currentImageUrl).then(r => r.blob())
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

  // Solo il link pubblico ha senso qui: la pagina del modale è privata e autenticata, condividerla
  // manda chi clicca dal feed su una schermata di login (vedi getShareUrl).
  const handleFacebook = async () => {
    const url = await getShareUrl()
    if (!url) return
    window.open(
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
      '_blank', 'width=600,height=400,noopener',
    )
  }

  const handleCopy = async () => {
    try {
      const blob = await fetch(currentImageUrl).then(r => r.blob())
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    } catch {
      const url = await getShareUrl()
      if (url) await navigator.clipboard.writeText(url).catch(() => {})
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2200)
  }

  const options = () => {
    if (props.kind === 'activity') {
      const hasPolyline = !!(props.activity.routePolyline && props.activity.routePolyline.length > 1)
      const hasProfile  = !!(props.activity.elevationProfile && props.activity.elevationProfile.length > 3)
      return (
        <div className="space-y-2.5">
          {hasPolyline && (
            <>
              <Toggle label="Mappa geografica" checked={actOpts.showMap}     onChange={v => setActOpts(o => ({ ...o, showMap: v, showRoute: v ? false : o.showRoute }))} />
              {!actOpts.showMap && (
                <Toggle label="Percorso (astratto)"   checked={actOpts.showRoute}   onChange={v => setActOpts(o => ({ ...o, showRoute: v }))} />
              )}
            </>
          )}
          {hasProfile && <Toggle label="Profilo altimetrico" checked={actOpts.showProfile} onChange={v => setActOpts(o => ({ ...o, showProfile: v }))} />}
          <Toggle label="Data"               checked={actOpts.showDate}      onChange={v => setActOpts(o => ({ ...o, showDate: v }))} />
          <Toggle label="Distanza"           checked={actOpts.showDistance}  onChange={v => setActOpts(o => ({ ...o, showDistance: v }))} />
          <Toggle label="Dislivello"         checked={actOpts.showElevation} onChange={v => setActOpts(o => ({ ...o, showElevation: v }))} />
          <Toggle label="Durata"             checked={actOpts.showDuration}  onChange={v => setActOpts(o => ({ ...o, showDuration: v }))} />
          <Toggle label="Frequenza cardiaca" checked={actOpts.showHR}        onChange={v => setActOpts(o => ({ ...o, showHR: v }))} />
          <Toggle label="Calorie"            checked={actOpts.showCalories}  onChange={v => setActOpts(o => ({ ...o, showCalories: v }))} />

          {mode === 'carousel' && (
            <div className="pt-3 mt-1 border-t border-stone-100 space-y-2.5">
              <Toggle label="Scheda dati (numeri o altimetria)" checked={showDataSlide} onChange={setShowDataSlide} />
              <p className="text-xs font-semibold text-stone-400 uppercase tracking-widest pt-1">
                Foto ({includeIds.length}/{availablePhotos.length})
              </p>
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {availablePhotos.map(p => {
                  const included = includeIds.includes(p.id)
                  return (
                    <div key={p.id} className={`flex gap-2 p-1.5 rounded-lg border transition-colors ${included ? 'border-forest-200 bg-forest-50/40' : 'border-stone-100 opacity-60'}`}>
                      <button
                        onClick={() => togglePhoto(p.id)}
                        className="shrink-0 w-14 h-14 rounded-md overflow-hidden relative"
                        title={included ? 'Escludi dal carosello' : 'Includi nel carosello'}
                      >
                        <img src={p.url} alt="" className="w-full h-full object-cover" />
                        {!included && <span className="absolute inset-0 bg-black/50 flex items-center justify-center text-white text-[10px] font-semibold">Escl.</span>}
                      </button>
                      <input
                        value={captionOverrides[p.id] ?? p.caption ?? ''}
                        onChange={e => setCaptionOverrides(c => ({ ...c, [p.id]: e.target.value }))}
                        placeholder="Didascalia…"
                        disabled={!included}
                        className="flex-1 min-w-0 text-xs bg-white border border-stone-200 rounded-md px-2 py-1 disabled:opacity-50"
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          )}
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
                  aspectRatio: `${FORMAT_DIMS[fmt][0]} / ${FORMAT_DIMS[fmt][1]}`,
                  maxHeight: '56vh',
                  width: fmt === '9:16' || fmt === '4:5' ? 'auto' : '100%',
                }}
              >
                {generating && (
                  <div className="absolute inset-0 flex items-center justify-center bg-[#1a3c26]">
                    <Loader2 className="w-8 h-8 text-forest-400 animate-spin" />
                    <span className="ml-2 text-forest-400 text-sm">Generazione…</span>
                  </div>
                )}
                {!generating && mode === 'single' && imageUrl && (
                  <img src={imageUrl} alt="anteprima condivisione" className="w-full h-full object-contain" />
                )}
                {!generating && mode === 'carousel' && carouselSlides[carouselIndex] && (
                  <>
                    <img src={carouselSlides[carouselIndex].url} alt={`scheda ${carouselIndex + 1} del carosello`} className="w-full h-full object-contain" />
                    {carouselSlides.length > 1 && (
                      <>
                        <button
                          onClick={() => setCarouselIndex(i => (i - 1 + carouselSlides.length) % carouselSlides.length)}
                          className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center transition-colors"
                        >
                          <ChevronLeft className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => setCarouselIndex(i => (i + 1) % carouselSlides.length)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center transition-colors"
                        >
                          <ChevronRight className="w-5 h-5" />
                        </button>
                        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
                          {carouselSlides.map((_, i) => (
                            <button
                              key={i}
                              onClick={() => setCarouselIndex(i)}
                              className={`w-1.5 h-1.5 rounded-full transition-all ${i === carouselIndex ? 'bg-white w-4' : 'bg-white/40'}`}
                            />
                          ))}
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Options */}
            <div className="space-y-5">
              {/* Mode — solo per la condivisione di una singola escursione con foto disponibili */}
              {props.kind === 'activity' && availablePhotos.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-stone-400 uppercase tracking-widest mb-2">Modalità</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setMode('single')}
                      className={`flex-1 py-2 rounded-lg border transition-all flex items-center justify-center gap-1.5 text-sm font-medium
                        ${mode === 'single' ? 'bg-forest-50 border-forest-400 text-forest-700' : 'bg-white border-stone-200 text-stone-500 hover:border-stone-300'}`}
                    >
                      <ImageIcon className="w-4 h-4" /> Scheda singola
                    </button>
                    <button
                      onClick={() => setMode('carousel')}
                      className={`flex-1 py-2 rounded-lg border transition-all flex items-center justify-center gap-1.5 text-sm font-medium
                        ${mode === 'carousel' ? 'bg-forest-50 border-forest-400 text-forest-700' : 'bg-white border-stone-200 text-stone-500 hover:border-stone-300'}`}
                    >
                      <Images className="w-4 h-4" /> Carosello
                    </button>
                  </div>
                </div>
              )}

              {/* Format */}
              <div>
                <p className="text-xs font-semibold text-stone-400 uppercase tracking-widest mb-2">Formato</p>
                <div className="flex gap-2">
                  {([
                    { f: '9:16', main: 'Storia',  sub: '9:16' },
                    { f: '1:1',  main: 'Post',    sub: '1:1'  },
                    { f: '4:5',  main: 'Feed',    sub: '4:5'  },
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
                  Storia per Instagram / TikTok / WhatsApp Status · Post quadrato · Feed è il formato più efficiente per il carosello Instagram · Orizzontale per Facebook
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
                <p><span className="font-semibold text-stone-700">Facebook:</span> scarica e carica nel post, oppure usa il pulsante per condividere il link pubblico (lo crea al volo se non esiste ancora).</p>
              </div>

              {/* Actions */}
              <div className="space-y-2">
                {canNativeShare && (
                  <button
                    onClick={handleNativeShare}
                    disabled={!hasContent || generating}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-forest-600 hover:bg-forest-700 text-white rounded-xl font-medium text-sm transition-colors disabled:opacity-40"
                  >
                    <Share2 className="w-4 h-4" /> Condividi
                  </button>
                )}
                <button
                  onClick={handleDownload}
                  disabled={!hasContent || generating}
                  className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-medium text-sm transition-colors disabled:opacity-40
                    ${canNativeShare
                      ? 'bg-white border border-stone-200 text-stone-600 hover:border-stone-300'
                      : 'bg-forest-600 hover:bg-forest-700 text-white'}`}
                >
                  <Download className="w-4 h-4" />
                  {mode === 'carousel' ? `Scarica questa scheda (${carouselIndex + 1}/${carouselSlides.length})` : 'Scarica immagine (.png)'}
                </button>
                {mode === 'carousel' && carouselSlides.length > 1 && (
                  <button
                    onClick={handleDownloadAll}
                    disabled={!hasContent || generating}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-white border border-stone-200 text-stone-600 hover:border-stone-300 rounded-xl font-medium text-sm transition-colors disabled:opacity-40"
                  >
                    <Images className="w-4 h-4" /> Scarica tutte ({carouselSlides.length}) come .zip
                  </button>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={handleFacebook}
                    disabled={props.kind !== 'activity' || linkBusy}
                    title={props.kind !== 'activity' ? 'Disponibile solo per la condivisione di un’escursione' : undefined}
                    className="flex items-center justify-center gap-2 py-2.5 bg-[#1877f2] hover:bg-[#1464d8] text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-40"
                  >
                    <Facebook className="w-4 h-4" /> Facebook
                  </button>
                  <button
                    onClick={handleCopy}
                    disabled={!hasContent || generating}
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
