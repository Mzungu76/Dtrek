'use client'

// Copertina del Diario, caricata su Supabase Storage invece che tenuta in localStorage.
//
// Prima `handleCoverUpload` in app/diario/page.tsx leggeva il file con FileReader e salvava il
// data URL risultante direttamente in `localStorage.setItem('dtrek_diary_cover', url)`, senza
// alcun ridimensionamento né `try/catch`. Una foto da smartphone (3-8 MB) diventa 4-11 MB in
// base64, contro un quota di ~5 MB per origine: `QuotaExceededError` non gestito dentro un
// callback `onload`, e a seconda del browser il resto del localStorage dell'app poteva finire
// corrotto. Qui il file viene ridimensionato PRIMA di lasciare il dispositivo, e il risultato
// finisce nello Storage bucket già usato per le foto delle escursioni — non nel browser.

import { getBrowserSupabase } from './supabaseBrowser'

const BUCKET = 'dtrek-photos'
// La copertina riempie una pagina A4 da 794px di larghezza; 1600px dà margine per densità
// retina senza portarsi dietro l'intera risoluzione nativa di una foto da smartphone (spesso
// 3000-4000px di lato, inutile qui e solo più lenta da caricare e servire).
const MAX_WIDTH = 1600

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Immagine non leggibile'))
    img.src = src
  })
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error('Lettura del file fallita'))
    reader.readAsDataURL(file)
  })
}

export async function uploadDiaryCover(userId: string, file: File): Promise<string> {
  const dataUrl = await readAsDataUrl(file)
  const img = await loadImage(dataUrl)

  const scale = Math.min(1, MAX_WIDTH / img.naturalWidth)
  const w = Math.max(1, Math.round(img.naturalWidth * scale))
  const h = Math.max(1, Math.round(img.naturalHeight * scale))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, w, h)

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(b => b ? resolve(b) : reject(new Error("Impossibile codificare l'immagine")), 'image/jpeg', 0.85)
  })

  const supabase = getBrowserSupabase()
  const path = `${userId}/diary-cover.jpg`
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: 'image/jpeg',
    upsert: true,
  })
  if (error) throw error

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  // Il percorso è fisso (upsert): senza cache-bust il browser/CDN continuerebbe a servire la
  // copertina precedente dopo un cambio, perché l'URL pubblico resta identico.
  return `${data.publicUrl}?v=${Date.now()}`
}
