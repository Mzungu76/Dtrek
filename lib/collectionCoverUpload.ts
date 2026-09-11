'use client'

// Copertina di una Raccolta — stesso trattamento di lib/diaryCoverUpload.ts (ridimensionamento
// prima di lasciare il dispositivo, upload nello stesso bucket foto), path proprio invece di
// riusare quello dei Diari: le due cose sono entità distinte con lo stesso concetto di copertina.

import { getBrowserSupabase } from './supabaseBrowser'

const BUCKET = 'dtrek-photos'
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

export async function uploadCollectionCover(userId: string, file: File, collectionId: string): Promise<string> {
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
  const path = `${userId}/collections/${collectionId}/cover.jpg`
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: 'image/jpeg',
    upsert: true,
  })
  if (error) throw error

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return `${data.publicUrl}?v=${Date.now()}`
}
