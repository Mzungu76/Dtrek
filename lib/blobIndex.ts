import { put, list } from '@vercel/blob'
import type { ActivityMeta } from '@/lib/blobStore'

export const INDEX_PATH = 'activities/index.json'

function getToken(): string {
  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (!token) throw new Error('BLOB_READ_WRITE_TOKEN non configurato')
  return token
}

async function findBlob(pathname: string) {
  const { blobs } = await list({ prefix: pathname, token: getToken() })
  return blobs.find(b => b.pathname === pathname) ?? null
}

async function fetchDownload(downloadUrl: string): Promise<string | null> {
  const res = await fetch(downloadUrl, { cache: 'no-store' })
  if (!res.ok) return null
  return res.text()
}

export async function readIndex(): Promise<ActivityMeta[]> {
  try {
    const blob = await findBlob(INDEX_PATH)
    if (!blob) return []
    const text = await fetchDownload(blob.downloadUrl)
    if (!text) return []
    return JSON.parse(text) as ActivityMeta[]
  } catch {
    return []
  }
}

export async function writeIndex(index: ActivityMeta[]): Promise<void> {
  await put(INDEX_PATH, JSON.stringify(index), {
    access: 'private',
    addRandomSuffix: false,
    contentType: 'application/json',
    token: getToken(),
  })
}

export async function readBlobText(pathname: string): Promise<string | null> {
  try {
    const blob = await findBlob(pathname)
    if (!blob) return null
    return fetchDownload(blob.downloadUrl)
  } catch {
    return null
  }
}

export async function getBlobUrl(pathname: string): Promise<string | null> {
  try {
    const blob = await findBlob(pathname)
    return blob ? blob.url : null
  } catch {
    return null
  }
}
