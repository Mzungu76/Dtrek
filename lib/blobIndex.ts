import { put, list, head } from '@vercel/blob'
import type { ActivityMeta } from '@/lib/blobStore'

export const INDEX_PATH = 'activities/index.json'

export async function readIndex(): Promise<ActivityMeta[]> {
  try {
    const { blobs } = await list({ prefix: INDEX_PATH })
    if (!blobs.length) return []
    const res = await fetch(blobs[0].url, { cache: 'no-store' })
    if (!res.ok) return []
    return (await res.json()) as ActivityMeta[]
  } catch {
    return []
  }
}

export async function writeIndex(index: ActivityMeta[]): Promise<void> {
  await put(INDEX_PATH, JSON.stringify(index), {
    access: 'public',
    addRandomSuffix: false,
    contentType: 'application/json',
  })
}

export async function blobExists(pathname: string): Promise<string | null> {
  try {
    const { blobs } = await list({ prefix: pathname })
    const match = blobs.find(b => b.pathname === pathname)
    return match ? match.url : null
  } catch {
    return null
  }
}
