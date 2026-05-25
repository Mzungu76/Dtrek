import { put, list, get } from '@vercel/blob'
import type { ActivityMeta } from '@/lib/blobStore'

export const INDEX_PATH = 'activities/index.json'

async function streamToText(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  const chunks: string[] = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) chunks.push(decoder.decode(value, { stream: true }))
  }
  chunks.push(decoder.decode())
  return chunks.join('')
}

export async function readIndex(): Promise<ActivityMeta[]> {
  try {
    const result = await get(INDEX_PATH, { access: 'private' })
    if (!result || result.statusCode !== 200 || !result.stream) return []
    const text = await streamToText(result.stream)
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
  })
}

export async function readBlobAsText(pathname: string): Promise<string | null> {
  try {
    const result = await get(pathname, { access: 'private' })
    if (!result || result.statusCode !== 200 || !result.stream) return null
    return await streamToText(result.stream)
  } catch {
    return null
  }
}
