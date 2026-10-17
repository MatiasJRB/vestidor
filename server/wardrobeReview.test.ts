import assert from 'node:assert/strict'
import test from 'node:test'
import { applyCandidateDecision, enqueueCatalogGeneration, splitCandidateEvidence } from './wardrobeReview.ts'

function fixture(kind: 'new_item' | 'existing_match' = 'new_item') {
  const queue = {
    version: 2,
    generated_at: '2026-09-10T00:00:00Z',
    source_session_id: 'session',
    items: [{
      id: 'review-new',
      status: 'pending' as const,
      kind,
      confidence: 'high' as const,
      suggested_existing_id: kind === 'existing_match' ? 'existing' : undefined,
      proposed_item: {
        id: 'new',
        category: 'top' as const,
        type: 'remera',
        colors: ['negro'],
        style_tags: ['casual'],
        season_tags: ['todo el año'],
      },
      evidence_photos: ['private/imports/one.jpg', 'private/imports/two.jpg'],
      note: 'prueba',
    }],
  }
  const inventory = {
    version: 1,
    updated_at: 'before',
    items: [{
      id: 'existing',
      status: 'confirmed' as const,
      category: 'top' as const,
      type: 'remera existente',
      colors: ['negro'],
      style_tags: ['casual'],
      season_tags: ['todo el año'],
      evidence: 'previa',
      seen_in: ['old'],
      primary_photo: 'old.jpg',
      classification_source: 'confirmed' as const,
    }],
  }
  return { queue, inventory }
}

test('confirma una propuesta nueva y conserva sus fotos como evidencia', () => {
  const { queue, inventory } = fixture()
  const result = applyCandidateDecision(queue, inventory, 'review-new', { action: 'confirm_new' }, 'now')
  assert.equal(result.status, 'confirmed')
  assert.equal(result.inventoryCount, 2)
  assert.deepEqual(inventory.items[1].evidence_photos, ['private/imports/one.jpg', 'private/imports/two.jpg'])
  assert.equal(inventory.items[1].classification_source, 'confirmed')
  assert.equal(inventory.items[1].catalog_generation_status, 'queued')
})

test('aplica nombre, categoría, marca y colores editados antes de confirmar', () => {
  const { queue, inventory } = fixture()
  applyCandidateDecision(queue, inventory, 'review-new', {
    action: 'confirm_new',
    edits: {
      userLabel: 'Mi remera favorita',
      category: 'outerwear',
      brand: 'Marca nueva',
      colors: ['verde', ' crema ', 'verde'],
    },
  }, 'now')
  assert.equal(inventory.items[1].user_label, 'Mi remera favorita')
  assert.equal(inventory.items[1].category, 'outerwear')
  assert.equal(inventory.items[1].brand, 'Marca nueva')
  assert.deepEqual(inventory.items[1].colors, ['verde', 'crema'])
})

test('acepta accesorios como categoría al confirmar', () => {
  const { queue, inventory } = fixture()
  applyCandidateDecision(queue, inventory, 'review-new', {
    action: 'confirm_new',
    edits: {
      userLabel: 'Lentes negros con marrón',
      category: 'accessory',
      colors: ['negro', 'marrón'],
    },
  }, 'now')
  assert.equal(inventory.items[1].category, 'accessory')
  assert.equal(inventory.items[1].user_label, 'Lentes negros con marrón')
})

test('vincula evidencia nueva sin duplicar una prenda existente', () => {
  const { queue, inventory } = fixture('existing_match')
  const result = applyCandidateDecision(queue, inventory, 'review-new', { action: 'link_existing' }, 'now')
  assert.equal(result.status, 'linked')
  assert.equal(result.inventoryCount, 1)
  assert.equal(inventory.items[0].evidence_photos?.length, 2)
  assert.equal(inventory.items[0].seen_in.length, 3)
})

test('descarta una propuesta sin tocar el inventario', () => {
  const { queue, inventory } = fixture()
  const result = applyCandidateDecision(queue, inventory, 'review-new', { action: 'reject' }, 'now')
  assert.equal(result.status, 'rejected')
  assert.equal(result.inventoryCount, 1)
})

test('encola un solo recorte por prenda confirmada', () => {
  const { queue } = fixture()
  const generations = { version: 1, jobs: [] }
  const first = enqueueCatalogGeneration(generations, queue.items[0], 'new', 'now')
  const repeated = enqueueCatalogGeneration(generations, queue.items[0], 'new', 'later')
  assert.equal(first, repeated)
  assert.equal(generations.jobs.length, 1)
  assert.equal(first.status, 'queued')
  assert.equal(first.output_path, 'public/items/new.webp')
})

test('separa una foto mezclada en una propuesta nueva sin resolver la original', () => {
  const { queue } = fixture()
  const result = splitCandidateEvidence(queue, 'review-new', 'private/imports/two.jpg', '2026-09-10T23:45:00Z')

  assert.equal(queue.items.length, 2)
  assert.deepEqual(result.candidate.evidence_photos, ['private/imports/one.jpg'])
  assert.deepEqual(result.created.evidence_photos, ['private/imports/two.jpg'])
  assert.equal(result.created.proposed_item.id, 'new-002')
  assert.equal(result.created.status, 'pending')
  assert.equal(result.created.kind, 'new_item')
  assert.equal(result.pendingCount, 2)
})

test('no permite separar la última foto de una propuesta', () => {
  const { queue } = fixture()
  queue.items[0].evidence_photos = ['private/imports/one.jpg']
  assert.throws(
    () => splitCandidateEvidence(queue, 'review-new', 'private/imports/one.jpg', 'now'),
    /una sola foto/,
  )
})
