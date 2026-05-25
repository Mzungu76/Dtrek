import { put, head } from '@vercel/blob'
import type { ActivityMeta } from '@/lib/blobStore'

export const INDEX_PATH = 'activities/index.json'

export async function readIndex(): Promise<ActivityMeta[]> {
  try {
    const meta = await head(INDEX_PATH)
    const res = await fetch(meta.url, { cache: 'no-store' })
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
