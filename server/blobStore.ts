import { get, put, BlobPreconditionFailedError } from '@vercel/blob'
export type Versioned<T> = { value: T; etag?: string }
export async function readDocument<T>(key: string, fallback?: T, getBlob: typeof get = get): Promise<Versioned<T>> {
  const blob = await getBlob(key, { access: 'private', useCache: false, headers: { 'Accept-Encoding': 'identity' } })
  if (!blob || blob.statusCode !== 200 || !blob.stream) {
    if (fallback !== undefined) return { value: structuredClone(fallback) }
    throw new Error('Missing private document')
  }
  // Compression turns the storage ETag into a weak validator; If-Match needs the strong original.
  if (!blob.blob.etag || blob.blob.etag.startsWith('W/')) throw new Error('Storage did not return a strong ETag')
  return { value: JSON.parse(await new Response(blob.stream).text()), etag: blob.blob.etag }
}
export async function writeDocument<T>(key: string, value: T, etag?: string) {
  return put(key, JSON.stringify(value), { access: 'private', addRandomSuffix: false, allowOverwrite: Boolean(etag), ...(etag ? { ifMatch: etag } : {}), contentType: 'application/json', cacheControlMaxAge: 60 })
}
export function isConditionalConflict(error: unknown) {
  return error instanceof BlobPreconditionFailedError || /already exists|precondition|conditional request.*conflicting operation/i.test(error instanceof Error ? error.message : '')
}
export async function mutateDocument<T, R>(key: string, fallback: T | undefined, apply: (value: T) => R): Promise<R> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const current = await readDocument(key, fallback)
    const result = apply(current.value)
    try { await writeDocument(key, current.value, current.etag); return result }
    catch (error) {
      const conflict = isConditionalConflict(error)
      if (!conflict || attempt === 5) throw error
      await new Promise(resolve => setTimeout(resolve, 100 * 2 ** attempt + Math.random() * 100))
    }
  }
  throw new Error('Concurrent update failed')
}
