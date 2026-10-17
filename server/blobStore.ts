import { get, put, BlobPreconditionFailedError } from '@vercel/blob'
export type Versioned<T> = { value: T; etag?: string }
export async function readDocument<T>(key: string, fallback?: T): Promise<Versioned<T>> {
  const blob = await get(key, { access: 'private', useCache: false })
  if (!blob || blob.statusCode !== 200 || !blob.stream) {
    if (fallback !== undefined) return { value: structuredClone(fallback) }
    throw new Error('Missing private document')
  }
  return { value: JSON.parse(await new Response(blob.stream).text()), etag: blob.blob.etag }
}
export async function writeDocument<T>(key: string, value: T, etag?: string) {
  return put(key, JSON.stringify(value), { access: 'private', addRandomSuffix: false, allowOverwrite: Boolean(etag), ...(etag ? { ifMatch: etag } : {}), contentType: 'application/json', cacheControlMaxAge: 60 })
}
export async function mutateDocument<T, R>(key: string, fallback: T | undefined, apply: (value: T) => R): Promise<R> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const current = await readDocument(key, fallback)
    const result = apply(current.value)
    try { await writeDocument(key, current.value, current.etag); return result }
    catch (error) {
      const conflict = error instanceof BlobPreconditionFailedError || /already exists|precondition/i.test(error instanceof Error ? error.message : '')
      if (!conflict || attempt === 5) throw error
      await new Promise(resolve => setTimeout(resolve, 30 + Math.random() * 100))
    }
  }
  throw new Error('Concurrent update failed')
}
