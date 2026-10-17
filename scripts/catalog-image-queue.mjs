#!/usr/bin/env node
import { chmod, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import sharp from 'sharp'
import {frameCatalogImage} from '../server/catalogFraming.ts'

const root = resolve(process.env.DATA_DIR ?? 'data')
const queuePath = resolve(root, 'private/catalog-generation-queue.json')
const inventoryPath = resolve(root, 'private/inventory.json')

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

async function writeJson(path, value) {
  const temporary = `${path}.${process.pid}.tmp`
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
  await rename(temporary, path)
  await chmod(path, 0o600)
}

async function main() {
  const [command = 'list', jobId, value] = process.argv.slice(2)
  const queue = await readJson(queuePath)

  if (command === 'list') {
    console.log(JSON.stringify(queue.jobs.filter((job) => ['queued', 'generating', 'failed'].includes(job.status)), null, 2))
    return
  }

  if (command === 'claim') {
    const job = queue.jobs.find((candidate) => candidate.status === 'queued')
    if (!job) {
      console.log('NO_QUEUED_JOBS')
      return
    }
    job.status = 'generating'
    job.started_at = new Date().toISOString()
    job.attempts = (job.attempts ?? 0) + 1
    await writeJson(queuePath, queue)
    const inventory = await readJson(inventoryPath)
    const item = inventory.items.find((candidate) => candidate.id === job.item_id)
    if (item) {
      item.catalog_generation_status = 'generating'
      inventory.updated_at = new Date().toISOString()
      await writeJson(inventoryPath, inventory)
    }
    console.log(JSON.stringify({ ...job, source_photos: job.source_photos.map((photo) => resolve(root, photo)), output_path: resolve(root, job.output_path) }, null, 2))
    return
  }

  const job = queue.jobs.find((candidate) => candidate.id === jobId)
  if (!job) throw new Error(`No existe el job ${jobId ?? '(sin id)'}.`)

  if (command === 'complete') {
    if (!value) throw new Error('Falta la ruta de la imagen generada.')
    await stat(value)
    const output = resolve(root, job.output_path)
    await mkdir(dirname(output), { recursive: true })
    await sharp(value)
      .resize({ width: 1200, height: 1500, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 92 })
      .toFile(output)

    const inventory = await readJson(inventoryPath)
    const item = inventory.items.find((candidate) => candidate.id === job.item_id)
    if (!item) throw new Error(`No existe la prenda ${job.item_id}.`)
    item.catalog_image = basename(output)
    item.gallery_frame = await frameCatalogImage(output, item.catalog_image)
    item.catalog_image_kind = 'ai_isolation_from_real_photo'
    item.catalog_image_review = 'pending_human_review'
    item.catalog_image_caution = 'Imagen reconstruida con IA. Validá logos, estampas, color y proporciones contra las fotos originales.'
    item.catalog_generation_status = 'ready'
    inventory.updated_at = new Date().toISOString()

    job.status = 'completed'
    job.completed_at = new Date().toISOString()
    job.generated_from = value
    await writeJson(inventoryPath, inventory)
    await writeJson(queuePath, queue)
    console.log(JSON.stringify({ completed: job.id, item_id: job.item_id, output }, null, 2))
    return
  }

  if (command === 'fail') {
    const message = (value ?? 'Falló la generación').slice(0, 500)
    job.status = 'failed'
    job.failed_at = new Date().toISOString()
    job.error = message
    const inventory = await readJson(inventoryPath)
    const item = inventory.items.find((candidate) => candidate.id === job.item_id)
    if (item) item.catalog_generation_status = 'failed'
    inventory.updated_at = new Date().toISOString()
    await writeJson(inventoryPath, inventory)
    await writeJson(queuePath, queue)
    console.log(JSON.stringify({ failed: job.id, error: message }, null, 2))
    return
  }

  if (command === 'requeue') {
    job.status = 'queued'
    delete job.error
    delete job.failed_at
    await writeJson(queuePath, queue)
    console.log(JSON.stringify({ queued: job.id }, null, 2))
    return
  }

  throw new Error(`Comando desconocido: ${command}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
