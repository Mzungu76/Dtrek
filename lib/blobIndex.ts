import { put, list } from '@vercel/blob'
import type { ActivityMeta } from '@/lib/blobStore'

export const INDEX_PATH = 'activities/index.json'

function getToken(): string {
  const token = process.env.blob2dtrek_READ_WRITE_TOKEN ?? process.env.BLOB_READ_WRITE_TOKEN
  if (!token) throw new Error('blob2dtrek_READ_WRITE_TOKEN non configurato')
  return token
}

async function findBlobUrl(pathname: string): Promise<string | null> {
  try {
    const { blobs } = await list({ prefix: pathname, token: getToken() })
    const match = blobs.find(b => b.pathname === pathname)
    return match?.url ?? null
  } catch {
    return null
  }
}

export async function readIndex(): Promise<ActivityMeta[]> {
  try {
    const url = await findBlobUrl(INDEX_PATH)
    if (!url) return []
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return []
    return JSON.parse(await res.text()) as ActivityMeta[]
  } catch {
    return []
  }
}

export async function writeIndex(index: ActivityMeta[]): Promise<void> {
  await put(INDEX_PATH, JSON.stringify(index), {
    access: 'public',
    token: getToken(),
    addRandomSuffix: false,
    contentType: 'application/json',
  })
}

export async function readBlobText(pathname: string): Promise<string | null> {
  try {
    const url = await findBlobUrl(pathname)
    if (!url) return null
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return null
    return res.text()
  } catch {
    return null
  }
}

export async function getBlobUrl(pathname: string): Promise<string | null> {
  return findBlobUrl(pathname)
}
