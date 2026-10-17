import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, extname, join, resolve } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

const PHOTOS_SCOPE = 'https://www.googleapis.com/auth/photospicker.mediaitems.readonly'
const PICKER_API = 'https://photospicker.googleapis.com/v1'
const OAUTH_AUTHORIZE = 'https://accounts.google.com/o/oauth2/v2/auth'
const OAUTH_TOKEN = 'https://oauth2.googleapis.com/token'

type OAuthClient = { client_id: string; client_secret: string }
type StoredToken = {
  access_token: string
  refresh_token?: string
  expires_at: number
  scope?: string
  token_type?: string
}
type PickingSession = {
  id: string
  pickerUri: string
  expireTime?: string
  mediaItemsSet?: boolean
  pollingConfig?: { pollInterval?: string; timeoutIn?: string }
}
type PickedMediaItem = {
  id: string
  createTime?: string
  type?: 'PHOTO' | 'VIDEO' | 'TYPE_UNSPECIFIED'
  mediaFile?: { baseUrl?: string; mimeType?: string; filename?: string }
}
type ImportRecord = {
  id: string
  sha256: string
  sourceFilename: string
  createTime?: string
  importedAt: string
  path: string
}
type PendingOAuth = { verifier: string; expiresAt: number }

class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(message: string, status = 500, code = 'INTERNAL_ERROR') {
    super(message)
    this.status = status
    this.code = code
  }
}

export type GooglePhotosPickerOptions = {
  projectRoot: string
  oauthFile?: string
  redirectUri?: string
  tokenFile?: string
  importDir?: string
}

function resolveHome(path: string) {
  return path.startsWith('~/') ? join(homedir(), path.slice(2)) : resolve(path)
}

function parseGoogleDuration(value?: string, fallbackMs = 2_000) {
  if (!value?.endsWith('s')) return fallbackMs
  const seconds = Number(value.slice(0, -1))
  return Number.isFinite(seconds) ? Math.max(1_000, seconds * 1_000) : fallbackMs
}

function extensionFor(mimeType = '', filename = '') {
  const original = extname(filename).toLowerCase()
  if (/^\.[a-z0-9]{2,5}$/.test(original)) return original
  const known: Record<string, string> = {
    'image/avif': '.avif',
    'image/heic': '.heic',
    'image/heif': '.heif',
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
  }
  return known[mimeType] ?? '.jpg'
}

function safeTimestamp(createTime?: string) {
  const parsed = createTime ? new Date(createTime) : new Date()
  const value = Number.isNaN(parsed.getTime()) ? new Date() : parsed
  return value.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)
}

function appendPickerAutoclose(pickerUri: string) {
  const url = new URL(pickerUri)
  url.pathname = `${url.pathname.replace(/\/$/, '')}/autoclose`
  return url.toString()
}

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fallback
    throw error
  }
}

async function writePrivateJson(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.${process.pid}.tmp`
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
  await rename(temporary, path)
  await chmod(path, 0o600)
}

async function readOAuthClient(path?: string): Promise<OAuthClient | null> {
  if (!path) return null
  const payload = await readJson<Record<string, { client_id?: string; client_secret?: string }>>(resolveHome(path), {})
  const client = payload.installed ?? payload.web
  if (!client?.client_id || !client.client_secret) {
    throw new ApiError('El archivo OAuth de Google no tiene un cliente válido.', 500, 'INVALID_OAUTH_FILE')
  }
  return { client_id: client.client_id, client_secret: client.client_secret }
}

async function responseJson<T>(response: Response): Promise<T> {
  const text = await response.text()
  const payload = text ? JSON.parse(text) as Record<string, unknown> : {}
  if (!response.ok) {
    const nested = payload.error as { message?: string; status?: string } | undefined
    throw new ApiError(nested?.message ?? `Google respondió HTTP ${response.status}.`, response.status, nested?.status ?? 'GOOGLE_API_ERROR')
  }
  return payload as T
}

function sendJson(response: ServerResponse, status: number, payload: unknown) {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.end(JSON.stringify(payload))
}

function assertSameOrigin(request: IncomingMessage) {
  const origin = request.headers.origin
  if (!origin) return
  if (!['http://127.0.0.1:4173', 'http://localhost:4173'].includes(origin)) {
    throw new ApiError('Origen no permitido.', 403, 'INVALID_ORIGIN')
  }
}

export function createGooglePhotosPickerHandler(options: GooglePhotosPickerOptions) {
  const redirectUri = options.redirectUri ?? 'http://127.0.0.1:4173'
  const tokenFile = resolveHome(options.tokenFile ?? '~/.config/mi-placard/google-photos-token.json')
  const importDir = resolve(options.importDir ?? join(options.projectRoot, 'private/imports'))
  const importIndexFile = join(importDir, 'index.json')
  const pendingOAuth = new Map<string, PendingOAuth>()

  const getClient = () => readOAuthClient(options.oauthFile)
  const getStoredToken = () => readJson<StoredToken | null>(tokenFile, null)

  async function getAccessToken() {
    const client = await getClient()
    const stored = await getStoredToken()
    if (!client) throw new ApiError('Falta configurar el cliente OAuth de Google.', 503, 'NOT_CONFIGURED')
    if (!stored) throw new ApiError('Primero conectá tu cuenta de Google Fotos.', 401, 'NOT_CONNECTED')
    if (stored.expires_at > Date.now() + 60_000) return stored.access_token
    if (!stored.refresh_token) throw new ApiError('La conexión venció. Volvé a conectar Google Fotos.', 401, 'RECONNECT_REQUIRED')

    const body = new URLSearchParams({
      client_id: client.client_id,
      client_secret: client.client_secret,
      refresh_token: stored.refresh_token,
      grant_type: 'refresh_token',
    })
    const refreshed = await responseJson<{ access_token: string; expires_in: number; scope?: string; token_type?: string }>(
      await fetch(OAUTH_TOKEN, { method: 'POST', body }),
    )
    await writePrivateJson(tokenFile, { ...stored, ...refreshed, expires_at: Date.now() + refreshed.expires_in * 1_000 })
    return refreshed.access_token
  }

  async function googleRequest<T>(path: string, init: RequestInit = {}) {
    const accessToken = await getAccessToken()
    return responseJson<T>(await fetch(`${PICKER_API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    }))
  }

  async function oauthCallback(url: URL, response: ServerResponse) {
    const state = url.searchParams.get('state') ?? ''
    const pending = pendingOAuth.get(state)
    pendingOAuth.delete(state)
    if (!pending || pending.expiresAt < Date.now()) {
      throw new ApiError('La conexión venció antes de completarse. Probá de nuevo.', 400, 'INVALID_OAUTH_STATE')
    }
    if (url.searchParams.get('error')) {
      response.statusCode = 302
      response.setHeader('Location', 'http://127.0.0.1:4173/?googlePhotos=cancelled')
      response.end()
      return
    }
    const code = url.searchParams.get('code')
    const client = await getClient()
    if (!code || !client) throw new ApiError('Google no devolvió un código válido.', 400, 'INVALID_OAUTH_CALLBACK')

    const current = await getStoredToken()
    const body = new URLSearchParams({
      code,
      client_id: client.client_id,
      client_secret: client.client_secret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code_verifier: pending.verifier,
    })
    const token = await responseJson<{ access_token: string; refresh_token?: string; expires_in: number; scope?: string; token_type?: string }>(
      await fetch(OAUTH_TOKEN, { method: 'POST', body }),
    )
    await writePrivateJson(tokenFile, {
      ...token,
      refresh_token: token.refresh_token ?? current?.refresh_token,
      expires_at: Date.now() + token.expires_in * 1_000,
    })
    response.statusCode = 302
    response.setHeader('Location', 'http://127.0.0.1:4173/?googlePhotos=connected')
    response.end()
  }

  async function importSelected(sessionId: string) {
    const selected: PickedMediaItem[] = []
    let pageToken: string | undefined
    do {
      const params = new URLSearchParams({ sessionId, pageSize: '100' })
      if (pageToken) params.set('pageToken', pageToken)
      const page = await googleRequest<{ mediaItems?: PickedMediaItem[]; nextPageToken?: string }>(`/mediaItems?${params}`)
      selected.push(...(page.mediaItems ?? []))
      pageToken = page.nextPageToken
    } while (pageToken)

    const previous = await readJson<{ items: ImportRecord[]; seenIds?: string[] }>(importIndexFile, { items: [] })
    const outfits = await readJson<{ outfits?: Array<{ google_photo_id?: string; sha256?: string }> }>(join(options.projectRoot, 'private/outfits.json'), {})
    const knownIds = new Set([
      ...previous.items.map((item) => item.id),
      ...(previous.seenIds ?? []),
      ...(outfits.outfits ?? []).flatMap((outfit) => outfit.google_photo_id ? [outfit.google_photo_id] : []),
    ])
    const knownHashes = new Set([
      ...previous.items.map((item) => item.sha256),
      ...(outfits.outfits ?? []).flatMap((outfit) => outfit.sha256 ? [outfit.sha256] : []),
    ])
    const imported: ImportRecord[] = []
    const seenIds = new Set(previous.seenIds ?? [])
    let duplicates = 0
    let videosSkipped = 0
    const accessToken = await getAccessToken()
    const runDirectory = join(importDir, new Date().toISOString().slice(0, 10))
    await mkdir(runDirectory, { recursive: true })

    for (const item of selected) {
      if (item.type !== 'PHOTO' || !item.mediaFile?.baseUrl) {
        videosSkipped += 1
        continue
      }
      if (knownIds.has(item.id)) {
        duplicates += 1
        continue
      }
      const download = await fetch(`${item.mediaFile.baseUrl}=d`, { headers: { Authorization: `Bearer ${accessToken}` } })
      if (!download.ok) throw new ApiError(`No se pudo descargar ${item.mediaFile.filename ?? 'una foto'}.`, download.status, 'DOWNLOAD_FAILED')
      const bytes = Buffer.from(await download.arrayBuffer())
      const sha256 = createHash('sha256').update(bytes).digest('hex')
      if (knownHashes.has(sha256)) {
        duplicates += 1
        knownIds.add(item.id)
        seenIds.add(item.id)
        continue
      }
      const extension = extensionFor(item.mediaFile.mimeType, item.mediaFile.filename)
      const filename = `${safeTimestamp(item.createTime)}-${item.id.slice(0, 10)}${extension}`
      const absolutePath = join(runDirectory, filename)
      await writeFile(absolutePath, bytes, { mode: 0o600 })
      const record: ImportRecord = {
        id: item.id,
        sha256,
        sourceFilename: item.mediaFile.filename ?? filename,
        createTime: item.createTime,
        importedAt: new Date().toISOString(),
        path: absolutePath.slice(options.projectRoot.length + 1),
      }
      imported.push(record)
      knownIds.add(item.id)
      knownHashes.add(sha256)
    }

    await writePrivateJson(importIndexFile, {
      version: 1,
      items: [...previous.items, ...imported],
      seenIds: [...seenIds].sort(),
    })
    await writePrivateJson(join(runDirectory, `session-${sessionId}.json`), {
      version: 1,
      sessionId,
      selected: selected.length,
      imported,
      duplicates,
      videosSkipped,
      completedAt: new Date().toISOString(),
    })
    try {
      await googleRequest(`/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' })
    } catch {
      // La importación ya quedó persistida; una limpieza fallida no debe perder el resultado.
    }
    return { selected: selected.length, imported: imported.length, duplicates, videosSkipped, items: imported }
  }

  async function handle(request: IncomingMessage, response: ServerResponse, next: () => void) {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1:4173')
    const state = url.searchParams.get('state') ?? ''
    const isOAuthCallback = url.pathname === '/' && Boolean(state) && (url.searchParams.has('code') || url.searchParams.has('error'))
    if (!url.pathname.startsWith('/api/google-photos') && !isOAuthCallback) return next()

    try {
      if (isOAuthCallback) {
        await oauthCallback(url, response)
        return
      }
      assertSameOrigin(request)

      if (url.pathname === '/api/google-photos/status' && request.method === 'GET') {
        const client = await getClient()
        const token = await getStoredToken()
        sendJson(response, 200, {
          configured: Boolean(client),
          connected: Boolean(token?.refresh_token || (token?.access_token && token.expires_at > Date.now())),
          scope: PHOTOS_SCOPE,
        })
        return
      }
      if (url.pathname === '/api/google-photos/connect' && request.method === 'GET') {
        const client = await getClient()
        if (!client) throw new ApiError('Falta configurar el cliente OAuth de Google.', 503, 'NOT_CONFIGURED')
        for (const [key, value] of pendingOAuth) if (value.expiresAt < Date.now()) pendingOAuth.delete(key)
        const stateValue = randomUUID()
        const verifier = randomBytes(48).toString('base64url')
        const challenge = createHash('sha256').update(verifier).digest('base64url')
        pendingOAuth.set(stateValue, { verifier, expiresAt: Date.now() + 10 * 60_000 })
        const authorization = new URL(OAUTH_AUTHORIZE)
        authorization.search = new URLSearchParams({
          client_id: client.client_id,
          redirect_uri: redirectUri,
          response_type: 'code',
          scope: PHOTOS_SCOPE,
          access_type: 'offline',
          include_granted_scopes: 'true',
          prompt: 'consent',
          state: stateValue,
          code_challenge: challenge,
          code_challenge_method: 'S256',
        }).toString()
        response.statusCode = 302
        response.setHeader('Location', authorization.toString())
        response.end()
        return
      }
      if (url.pathname === '/api/google-photos/sessions' && request.method === 'POST') {
        const session = await googleRequest<PickingSession>('/sessions', {
          method: 'POST',
          body: JSON.stringify({ pickingConfig: { maxItemCount: '100' } }),
        })
        sendJson(response, 201, {
          id: session.id,
          pickerUri: appendPickerAutoclose(session.pickerUri),
          pollAfterMs: parseGoogleDuration(session.pollingConfig?.pollInterval),
          timeoutMs: parseGoogleDuration(session.pollingConfig?.timeoutIn, 5 * 60_000),
        })
        return
      }
      const sessionMatch = url.pathname.match(/^\/api\/google-photos\/sessions\/([A-Za-z0-9_-]+)$/)
      if (sessionMatch && request.method === 'GET') {
        const session = await googleRequest<PickingSession>(`/sessions/${encodeURIComponent(sessionMatch[1])}`)
        sendJson(response, 200, {
          ready: Boolean(session.mediaItemsSet),
          pollAfterMs: parseGoogleDuration(session.pollingConfig?.pollInterval),
          timeoutMs: parseGoogleDuration(session.pollingConfig?.timeoutIn, 5 * 60_000),
        })
        return
      }
      if (sessionMatch && request.method === 'DELETE') {
        await googleRequest(`/sessions/${encodeURIComponent(sessionMatch[1])}`, { method: 'DELETE' })
        sendJson(response, 200, { cancelled: true })
        return
      }
      const importMatch = url.pathname.match(/^\/api\/google-photos\/sessions\/([A-Za-z0-9_-]+)\/import$/)
      if (importMatch && request.method === 'POST') {
        sendJson(response, 200, await importSelected(importMatch[1]))
        return
      }
      sendJson(response, 404, { error: { code: 'NOT_FOUND', message: 'Ruta inexistente.' } })
    } catch (error) {
      const apiError = error instanceof ApiError ? error : new ApiError('No se pudo completar la operación.')
      if (!(error instanceof ApiError) || error.status >= 500) console.error('[google-photos-picker]', error)
      sendJson(response, apiError.status, { error: { code: apiError.code, message: apiError.message } })
    }
  }

  return handle
}

export function googlePhotosPickerPlugin(options: GooglePhotosPickerOptions): Plugin {
  const handle = createGooglePhotosPickerHandler(options)
  return { name: 'google-photos-picker-local-api', configureServer(server) { server.middlewares.use(handle) }, configurePreviewServer(server) { server.middlewares.use(handle) } }
}

export const googlePhotosPickerInternals = { appendPickerAutoclose, extensionFor, parseGoogleDuration, safeTimestamp }
