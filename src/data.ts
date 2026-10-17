import type { GarmentFrame } from './garmentFrame'
export type Category = 'top' | 'bottom' | 'outerwear' | 'shoes' | 'accessory'

export type WardrobeItem = {
  id: string
  status: 'confirmed'
  category: Category
  type: string
  brand?: string
  model?: string | null
  colors: string[]
  user_label?: string
  evidence: string
  seen_in: string[]
  primary_photo: string
  evidence_photos?: string[]
  gallery_frame?: GarmentFrame
  catalog_image?: string
  catalog_views?: Array<{
    side: 'front' | 'back'
    image: string
  }>
  catalog_image_kind?: 'ai_isolation_from_real_photo'
  catalog_image_review?: 'pending_human_review' | 'approved'
  catalog_image_caution?: string
  catalog_generation_status?: 'queued' | 'generating' | 'ready' | 'failed'
  style_tags: string[]
  season_tags: string[]
  material?: string
  classification_source: 'inferred' | 'confirmed'
}

export type ReviewCandidate = {
  id: string
  status: 'pending' | 'confirmed' | 'linked' | 'rejected'
  kind: 'new_item' | 'existing_match'
  confidence: 'high' | 'medium' | 'low'
  suggested_existing_id?: string
  proposed_item: Pick<WardrobeItem, 'id' | 'category' | 'type' | 'user_label' | 'brand' | 'colors' | 'style_tags' | 'season_tags' | 'material'>
  evidence_photos: string[]
  note: string
}

export type Outfit = {
  archived_at?: string
  id: string
  captured_at: string
  photo: string
  context: string
  completeness: string
  confirmed_items: string[]
  notes: string
}

export type OutfitSuggestion = {
  archived_at?: string
  id: string
  for_date: string
  occasion: string
  status: 'suggested'
  image: string
  preview_image?: string
  image_kind: 'ai_composite_from_inventory'
  item_ids: string[]
  styling: string
  reason: string
  weather_assumption: string
}

export let inventory: WardrobeItem[] = []
export let inventoryUpdatedAt = new Date().toISOString()
export let outfits: Outfit[] = []
export let suggestions: OutfitSuggestion[] = []
export let reviewQueue: ReviewCandidate[] = []
export const itemById = new Map<string, WardrobeItem>()
export const outfitById = new Map<string, Outfit>()

export async function loadWardrobe() {
  const response = await fetch('/api/bootstrap', { cache: 'no-store' })
  if (response.status === 401) { window.location.replace('/login'); throw new Error('Sesión vencida') }
  if (!response.ok) throw new Error('No pude cargar tu ropero. Probá de nuevo.')
  const data = await response.json()
  inventory = data.inventory.items
  inventoryUpdatedAt = data.inventory.updated_at
  outfits = data.outfits.outfits
  suggestions = data.suggestions.suggestions
  reviewQueue = data.review.items
  inventory.forEach(item => itemById.set(item.id, item))
  outfits.forEach(outfit => outfitById.set(outfit.id, outfit))
}

export function photoUrl(photo: string) {
  const filename = photo.split('/').at(-1)
  if (!filename) return ''
  return photo.includes('imports/') ? `/api/wardrobe-review/photo/${encodeURIComponent(filename)}` : `/media/photos/${encodeURIComponent(filename)}`
}

export function itemImage(item: WardrobeItem) {
  const front = item.catalog_views?.find((view) => view.side === 'front')
  const catalogImage = front?.image ?? item.catalog_image
  return catalogImage ? `/items/${catalogImage}` : photoUrl(item.primary_photo)
}

export function itemName(item: WardrobeItem) {
  if (item.user_label && item.user_label.length > 4 && item.user_label.toLowerCase() !== item.brand?.toLowerCase()) {
    return item.user_label
  }
  return [item.brand, item.type].filter(Boolean).join(' ')
}

export const categoryLabels: Record<Category, string> = {
  top: 'Tops',
  bottom: 'Pantalones',
  outerwear: 'Abrigos',
  shoes: 'Calzado',
  accessory: 'Accesorios',
}
