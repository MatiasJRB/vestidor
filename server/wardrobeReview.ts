import { chmod, readFile, rename, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

type CandidateStatus = 'pending' | 'confirmed' | 'linked' | 'rejected'
type DecisionAction = 'confirm_new' | 'link_existing' | 'reject'

type ProposedItem = {
  id: string
  category: 'top' | 'bottom' | 'outerwear' | 'shoes' | 'accessory'
  type: string
  user_label?: string
  brand?: string
  colors: string[]
  style_tags: string[]
  season_tags: string[]
  material?: string
}

type ReviewCandidate = {
  id: string
  status: CandidateStatus
  kind: 'new_item' | 'existing_match'
  confidence: 'high' | 'medium' | 'low'
  suggested_existing_id?: string
  proposed_item: ProposedItem
  evidence_photos: string[]
  note: string
  resolved_at?: string
  resolution?: { action: DecisionAction; item_id?: string }
}

type ReviewQueue = {
  version: number
  generated_at: string
  source_session_id: string
  items: ReviewCandidate[]
}

type InventoryItem = ProposedItem & {
  status: 'confirmed'
  evidence: string
  seen_in: string[]
  primary_photo: string
  evidence_photos?: string[]
  classification_source: 'inferred' | 'confirmed'
  catalog_generation_status?: 'queued' | 'generating' | 'ready' | 'failed'
  [key: string]: unknown
}

type InventoryFile = {
  version: number
  updated_at: string
  items: InventoryItem[]
}

type ReviewDecision = {
  action: DecisionAction
  existingId?: string
  edits?: {
    userLabel?: string
    category?: ProposedItem['category']
    brand?: string
    colors?: string[]
  }
}

type SplitEvidenceRequest = {
  photo?: string
}

type CatalogGenerationJob = {
  id: string
  item_id: string
  status: 'queued' | 'generating' | 'completed' | 'failed'
  source_photos: string[]
  output_path: string
  requested_at: string
  attempts: number
}

type CatalogGenerationQueue = {
  version: number
  jobs: CatalogGenerationJob[]
}

class ReviewError extends Error {
  status: number
  code: string

  constructor(message: string, status = 400, code = 'INVALID_REVIEW') {
    super(message)
    this.status = status
    this.code = code
  }
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T
}

async function readJsonOr<T>(path: string, fallback: T): Promise<T> {
  try {
    return await readJson<T>(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fallback
    throw error
  }
}

async function writePrivateJson(path: string, value: unknown) {
  const temporary = `${path}.${process.pid}.tmp`
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
  await rename(temporary, path)
  await chmod(path, 0o600)
}

function sendJson(response: ServerResponse, status: number, value: unknown) {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.end(JSON.stringify(value))
}

function assertSameOrigin(request: IncomingMessage) {
  const origin = request.headers.origin
  if (!origin) return
  const host = request.headers.host
  if (!host || new URL(origin).host !== host) throw new ReviewError('Origen no permitido.', 403, 'INVALID_ORIGIN')
}

async function readBody<T>(request: IncomingMessage) {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > 32_768) throw new ReviewError('La decisión es demasiado grande.', 413, 'BODY_TOO_LARGE')
    chunks.push(buffer)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as T
  } catch {
    throw new ReviewError('No se pudo leer la decisión.', 400, 'INVALID_JSON')
  }
}

function nextSplitItemId(queue: ReviewQueue, itemId: string) {
  const root = itemId.replace(/-\d{3}$/, '')
  const used = new Set(queue.items.map((item) => item.proposed_item.id))
  let suffix = 2
  let candidate = `${root}-${String(suffix).padStart(3, '0')}`
  while (used.has(candidate)) {
    suffix += 1
    candidate = `${root}-${String(suffix).padStart(3, '0')}`
  }
  return candidate
}

export function splitCandidateEvidence(
  queue: ReviewQueue,
  candidateId: string,
  photo: string,
  now: string,
) {
  const index = queue.items.findIndex((item) => item.id === candidateId)
  if (index === -1) throw new ReviewError('No encontré esa propuesta.', 404, 'CANDIDATE_NOT_FOUND')
  const candidate = queue.items[index]
  if (candidate.status !== 'pending') throw new ReviewError('Esa propuesta ya fue resuelta.', 409, 'ALREADY_RESOLVED')
  if (!candidate.evidence_photos.includes(photo)) {
    throw new ReviewError('Esa foto no pertenece a la propuesta.', 400, 'PHOTO_NOT_IN_CANDIDATE')
  }
  if (candidate.evidence_photos.length < 2) {
    throw new ReviewError('La propuesta tiene una sola foto; no hay nada para separar.', 409, 'LAST_EVIDENCE_PHOTO')
  }

  const itemId = nextSplitItemId(queue, candidate.proposed_item.id)
  const created: ReviewCandidate = {
    id: `review-${itemId}`,
    status: 'pending',
    kind: 'new_item',
    confidence: 'medium',
    proposed_item: { ...candidate.proposed_item, id: itemId },
    evidence_photos: [photo],
    note: 'La separaste de otra propuesta porque es una prenda distinta. Revisá el nombre y los datos antes de agregarla.',
  }

  candidate.evidence_photos = candidate.evidence_photos.filter((candidatePhoto) => candidatePhoto !== photo)
  candidate.note = `Separaste una foto como otra prenda el ${now.slice(0, 10)}. Esta propuesta conserva ${candidate.evidence_photos.length === 1 ? 'la foto restante' : `las ${candidate.evidence_photos.length} fotos restantes`}.`
  queue.items.splice(index + 1, 0, created)

  return {
    candidate,
    created,
    pendingCount: queue.items.filter((item) => item.status === 'pending').length,
  }
}

function sightingId(photo: string) {
  return `import-${basename(photo).replace(/\.[^.]+$/, '')}`
}

function applyEdits(item: ProposedItem, edits: ReviewDecision['edits']) {
  if (!edits) return item
  const categories = new Set<ProposedItem['category']>(['top', 'bottom', 'outerwear', 'shoes', 'accessory'])
  if (edits.category && !categories.has(edits.category)) {
    throw new ReviewError('La categoría no es válida.', 400, 'INVALID_CATEGORY')
  }

  const userLabel = edits.userLabel?.trim()
  if (userLabel !== undefined && (userLabel.length < 2 || userLabel.length > 80)) {
    throw new ReviewError('El nombre debe tener entre 2 y 80 caracteres.', 400, 'INVALID_NAME')
  }
  const brand = edits.brand?.trim()
  if (brand && brand.length > 60) throw new ReviewError('La marca es demasiado larga.', 400, 'INVALID_BRAND')

  const colors = edits.colors?.map((color) => color.trim()).filter(Boolean)
  if (edits.colors && (!colors?.length || colors.length > 8 || colors.some((color) => color.length > 30))) {
    throw new ReviewError('Ingresá entre 1 y 8 colores válidos.', 400, 'INVALID_COLORS')
  }

  const edited = {
    ...item,
    ...(edits.category ? { category: edits.category } : {}),
    ...(userLabel !== undefined ? { user_label: userLabel } : {}),
    ...(colors ? { colors: [...new Set(colors)] } : {}),
  }
  if (edits.brand !== undefined) {
    if (brand) edited.brand = brand
    else delete edited.brand
  }
  return edited
}

export function applyCandidateDecision(
  queue: ReviewQueue,
  inventory: InventoryFile,
  candidateId: string,
  decision: ReviewDecision,
  now: string,
) {
  const candidate = queue.items.find((item) => item.id === candidateId)
  if (!candidate) throw new ReviewError('No encontré esa propuesta.', 404, 'CANDIDATE_NOT_FOUND')
  if (candidate.status !== 'pending') {
    const prior = candidate.resolution
    if (prior?.action === decision.action && (decision.action !== 'link_existing' || (decision.existingId ?? candidate.suggested_existing_id) === prior.item_id)) {
      return { candidateId, status: candidate.status, itemId: prior.item_id, inventoryCount: inventory.items.length, pendingCount: queue.items.filter(i => i.status === 'pending').length }
    }
    throw new ReviewError('Esa propuesta ya fue resuelta. Actualizá la revisión.', 409, 'ALREADY_RESOLVED')
  }

  if (!['confirm_new', 'link_existing', 'reject'].includes(decision.action)) {
    throw new ReviewError('La acción no es válida.', 400, 'INVALID_ACTION')
  }

  let resolvedItemId: string | undefined
  if (decision.action === 'confirm_new') {
    const proposed = applyEdits(candidate.proposed_item, decision.edits)
    candidate.proposed_item = proposed
    if (inventory.items.some((item) => item.id === proposed.id)) {
      throw new ReviewError('Esa prenda ya existe en el inventario.', 409, 'ITEM_ALREADY_EXISTS')
    }
    inventory.items.push({
      ...proposed,
      status: 'confirmed',
      evidence: 'Confirmada por la persona propietaria desde la revisión asistida de Google Fotos.',
      seen_in: candidate.evidence_photos.map(sightingId),
      primary_photo: candidate.evidence_photos[0],
      evidence_photos: candidate.evidence_photos,
      classification_source: 'confirmed',
      catalog_generation_status: 'queued',
    })
    candidate.status = 'confirmed'
    resolvedItemId = proposed.id
  }

  if (decision.action === 'link_existing') {
    const existingId = decision.existingId ?? candidate.suggested_existing_id
    if (!existingId) throw new ReviewError('Elegí con qué prenda existente vincularla.', 400, 'MISSING_EXISTING_ITEM')
    const existing = inventory.items.find((item) => item.id === existingId)
    if (!existing) throw new ReviewError('La prenda existente ya no está disponible.', 404, 'EXISTING_ITEM_NOT_FOUND')
    existing.evidence_photos = [...new Set([...(existing.evidence_photos ?? []), ...candidate.evidence_photos])]
    existing.seen_in = [...new Set([...existing.seen_in, ...candidate.evidence_photos.map(sightingId)])]
    candidate.status = 'linked'
    resolvedItemId = existing.id
  }

  if (decision.action === 'reject') candidate.status = 'rejected'

  candidate.resolved_at = now
  candidate.resolution = { action: decision.action, ...(resolvedItemId ? { item_id: resolvedItemId } : {}) }
  inventory.updated_at = now

  return {
    candidateId,
    status: candidate.status,
    itemId: resolvedItemId,
    inventoryCount: inventory.items.length,
    pendingCount: queue.items.filter((item) => item.status === 'pending').length,
  }
}

export function enqueueCatalogGeneration(
  generations: CatalogGenerationQueue,
  candidate: ReviewCandidate,
  itemId: string,
  now: string,
) {
  const active = generations.jobs.find((job) => job.item_id === itemId && ['queued', 'generating'].includes(job.status))
  if (active) return active
  const job: CatalogGenerationJob = {
    id: `catalog-${itemId}-${Date.now().toString(36)}`,
    item_id: itemId,
    status: 'queued',
    source_photos: candidate.evidence_photos,
    output_path: `public/items/${itemId}.webp`,
    requested_at: now,
    attempts: 0,
  }
  generations.jobs.push(job)
  return job
}

export function createWardrobeReviewHandler({ projectRoot }: { projectRoot: string }) {
  const queueFile = join(projectRoot, 'private/review-queue.json')
  const inventoryFile = join(projectRoot, 'private/inventory.json')
  const generationFile = join(projectRoot, 'private/catalog-generation-queue.json')

  async function handle(request: IncomingMessage, response: ServerResponse, next: () => void) {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1:4173')
    if (!url.pathname.startsWith('/api/wardrobe-review')) return next()

    try {
      assertSameOrigin(request)
      const queue = await readJson<ReviewQueue>(queueFile)

      const photoMatch = url.pathname.match(/^\/api\/wardrobe-review\/photo\/([^/]+)$/)
      if (photoMatch && request.method === 'GET') {
        const filename = decodeURIComponent(photoMatch[1])
        const photo = queue.items.flatMap((item) => item.evidence_photos).find((path) => basename(path) === filename)
        if (!photo) throw new ReviewError('No encontré esa foto de evidencia.', 404, 'PHOTO_NOT_FOUND')
        const bytes = await readFile(join(projectRoot, photo))
        response.statusCode = 200
        response.setHeader('Content-Type', filename.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg')
        response.setHeader('Content-Length', bytes.length)
        response.setHeader('Cache-Control', 'private, max-age=3600')
        response.end(bytes)
        return
      }

      if (url.pathname === '/api/wardrobe-review' && request.method === 'GET') {
        sendJson(response, 200, queue)
        return
      }

      if (url.pathname === '/api/wardrobe-review/inventory' && request.method === 'GET') {
        sendJson(response, 200, await readJson<InventoryFile>(inventoryFile))
        return
      }

      const splitMatch = url.pathname.match(/^\/api\/wardrobe-review\/([^/]+)\/split$/)
      if (splitMatch && request.method === 'POST') {
        const candidateId = decodeURIComponent(splitMatch[1])
        const body = await readBody<SplitEvidenceRequest>(request)
        if (!body.photo) throw new ReviewError('Elegí qué foto querés separar.', 400, 'MISSING_PHOTO')
        const result = splitCandidateEvidence(queue, candidateId, body.photo, new Date().toISOString())
        await writePrivateJson(queueFile, queue)
        sendJson(response, 200, result)
        return
      }

      const match = url.pathname.match(/^\/api\/wardrobe-review\/([^/]+)$/)
      if (match && request.method === 'POST') {
        const inventory = await readJson<InventoryFile>(inventoryFile)
        const generations = await readJsonOr<CatalogGenerationQueue>(generationFile, { version: 1, jobs: [] })
        const candidateId = decodeURIComponent(match[1])
        const candidate = queue.items.find((item) => item.id === candidateId)
        const decision = await readBody<ReviewDecision>(request)
        const now = new Date().toISOString()
        const wasPending = candidate?.status === 'pending'
        const result = applyCandidateDecision(queue, inventory, candidateId, decision, now)
        const generation = wasPending && decision.action === 'confirm_new' && result.itemId && candidate
          ? enqueueCatalogGeneration(generations, candidate, result.itemId, now)
          : undefined
        await writePrivateJson(inventoryFile, inventory)
        await writePrivateJson(queueFile, queue)
        await writePrivateJson(generationFile, generations)
        sendJson(response, 200, { ...result, generationStatus: generation?.status })
        return
      }

      sendJson(response, 404, { error: { code: 'NOT_FOUND', message: 'Ruta inexistente.' } })
    } catch (error) {
      const apiError = error instanceof ReviewError ? error : new ReviewError('No se pudo guardar la decisión.', 500, 'REVIEW_FAILED')
      if (!(error instanceof ReviewError) || error.status >= 500) console.error('[wardrobe-review]', error)
      sendJson(response, apiError.status, { error: { code: apiError.code, message: apiError.message } })
    }
  }

  return handle
}

export function wardrobeReviewPlugin({ projectRoot }: { projectRoot: string }): Plugin {
  const handle = createWardrobeReviewHandler({ projectRoot })
  return { name: 'wardrobe-review-local-api', configureServer(server) { server.middlewares.use(handle) }, configurePreviewServer(server) { server.middlewares.use(handle) } }
}
