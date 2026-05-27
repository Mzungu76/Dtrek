import { put, list, del } from '@vercel/blob'
import type { PlannedHikeMeta } from '@/lib/plannedStore'

const PLANNED_INDEX = 'planned/index.json'

function getToken(): string {
  const token = process.env.blob2dtrek_READ_WRITE_TOKEN
  if (!token) throw new Error('blob2dtrek_READ_WRITE_TOKEN non configurato')
  return token
}

async function findBlobUrl(pathname: string): Promise<string | null> {
  try {
    const { blobs } = await list({ prefix: pathname, token: getToken() })
    return blobs.find(b => b.pathname === pathname)?.url ?? null
  } catch {
    return null
  }
}

export async function readPlannedIndex(): Promise<PlannedHikeMeta[]> {
  try {
    const url = await findBlobUrl(PLANNED_INDEX)
    if (!url) return []
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return []
    return JSON.parse(await res.text()) as PlannedHikeMeta[]
  } catch {
    return []
  }
}

export async function writePlannedIndex(index: PlannedHikeMeta[]): Promise<void> {
  await put(PLANNED_INDEX, JSON.stringify(index), {
    access: 'public', token: getToken(), addRandomSuffix: false, contentType: 'application/json',
  })
}

export async function readPlannedBlobText(pathname: string): Promise<string | null> {
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

export async function deletePlannedBlob(pathname: string): Promise<void> {
  const url = await findBlobUrl(pathname)
  if (url) await del(url, { token: getToken() })
}
