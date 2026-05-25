import { put, list } from '@vercel/blob'
import type { ActivityMeta } from '@/lib/blobStore'

export const INDEX_PATH = 'activities/index.json'

function getToken(): string {
  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (!token) throw new Error('BLOB_READ_WRITE_TOKEN non configurato')
  return token
}

async function fetchPrivateBlob(url: string): Promise<string | null> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${getToken()}` },
    cache: 'no-store',
  })
  if (!res.ok) return null
  return res.text()
}

async function getBlobUrl(pathname: string): Promise<string | null> {
  try {
    const { blobs } = await list({ prefix: pathname, token: getToken() })
    const match = blobs.find(b => b.pathname === pathname)
    return match ? match.url : null
  } catch {
    return null
  }
}

export async function readIndex(): Promise<ActivityMeta[]> {
  try {
    const url = await getBlobUrl(INDEX_PATH)
    if (!url) return []
    const text = await fetchPrivateBlob(url)
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
    const url = await getBlobUrl(pathname)
    if (!url) return null
    return fetchPrivateBlob(url)
  } catch {
    return null
  }
}

export { getBlobUrl }
