import { put, list, get } from '@vercel/blob'
import type { ActivityMeta } from '@/lib/blobStore'

export const INDEX_PATH = 'activities/index.json'

function getToken(): string {
  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (!token) throw new Error('BLOB_READ_WRITE_TOKEN non configurato')
  return token
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const PRIVATE = 'private' as any

async function readBlobContent(pathname: string): Promise<string | null> {
  const result = await get(pathname, { access: PRIVATE, token: getToken() })
  if (!result || result.statusCode !== 200) return null
  return new Response(result.stream).text()
}

export async function readIndex(): Promise<ActivityMeta[]> {
  try {
    const text = await readBlobContent(INDEX_PATH)
    if (!text) return []
    return JSON.parse(text) as ActivityMeta[]
  } catch {
    return []
  }
}

export async function writeIndex(index: ActivityMeta[]): Promise<void> {
  await put(INDEX_PATH, JSON.stringify(index), {
    access: PRIVATE,
    addRandomSuffix: false,
    contentType: 'application/json',
    token: getToken(),
  })
}

export async function readBlobText(pathname: string): Promise<string | null> {
  try {
    return readBlobContent(pathname)
  } catch {
    return null
  }
}

export async function getBlobUrl(pathname: string): Promise<string | null> {
  try {
    const { blobs } = await list({ prefix: pathname, token: getToken() })
    const match = blobs.find(b => b.pathname === pathname)
    return match ? match.url : null
  } catch {
    return null
  }
}
