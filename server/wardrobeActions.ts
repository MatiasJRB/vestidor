import { createHash } from 'node:crypto'
import type { Snapshot } from './cloud.ts'
import { enqueueCatalogGeneration } from './wardrobeReview.ts'

export function invalid(message: string, status = 400): never { throw Object.assign(new Error(message), { status }) }
export function parseItem(input: any) {
 if (!input || typeof input.requestId !== 'string' || !/^[a-f0-9-]{36}$/i.test(input.requestId)) invalid('Solicitud inválida. Volvé a abrir la carga.')
 const name = typeof input.name === 'string' ? input.name.trim() : ''
 if (name.length < 2 || name.length > 80) invalid('El nombre debe tener entre 2 y 80 caracteres.')
 if (!['top','bottom','outerwear','shoes','accessory'].includes(input.category)) invalid('Elegí una categoría válida.')
 if (!Array.isArray(input.colors) || !input.colors.length || input.colors.length > 8 || input.colors.some((c: unknown) => typeof c !== 'string' || c.length > 30 || !c.trim())) invalid('Elegí al menos un color.')
 const brand = typeof input.brand === 'string' ? input.brand.trim() : ''
 if (brand.length > 60) invalid('La marca es demasiado larga.')
 if (input.queueImage !== undefined && typeof input.queueImage !== 'boolean') invalid('Opción de generación inválida.')
 const id = 'upload-' + input.requestId.toLowerCase()
 return {id,name,category:input.category,colors:[...new Set(input.colors.map((c:string)=>c.trim()))] as string[],brand,queueImage:input.queueImage===true}
}
export async function sanitizePhoto(data: unknown) {
 if (typeof data !== 'string' || data.length > 3_000_000 || !/^data:image\/(jpeg|png|webp);base64,/.test(data)) invalid('Elegí una foto JPG, PNG o WebP de hasta 2 MB.')
 const bytes=Buffer.from((data as string).split(',')[1],'base64')
 try { const sharp=(await import('sharp')).default; return await sharp(bytes,{limitInputPixels:40_000_000}).rotate().resize(1600,1600,{fit:'inside',withoutEnlargement:true}).jpeg({quality:82}).toBuffer() }
 catch { return invalid('No pude leer esa imagen. Probá con otra foto.') }
}
export function addItem(state: Snapshot, input: ReturnType<typeof parseItem>, now: string, photo: string, fingerprint: string) {
 const found=state.inventory.items.find(i=>i.id===input.id)
 if(found){if(found.upload_fingerprint!==fingerprint)invalid('Esta carga ya se usó con otros datos. Abrí una nueva.',409);return {item:found,duplicate:true}}
 const item:Snapshot['inventory']['items'][number]={id:input.id,status:'confirmed',category:input.category,type:input.name,user_label:input.name,brand:input.brand||undefined,colors:input.colors,style_tags:[],season_tags:[],evidence:'Cargada y confirmada desde Vestidor.',primary_photo:photo,evidence_photos:[photo],seen_in:[],classification_source:'confirmed',...(input.queueImage?{catalog_generation_status:'queued' as const}:{}),upload_fingerprint:fingerprint}
 state.inventory.items.push(item);state.inventory.updated_at=now
 if(input.queueImage)enqueueCatalogGeneration(state.generation,{id:input.id,status:'confirmed',kind:'new_item',confidence:'high',proposed_item:item,evidence_photos:[photo],note:''},input.id,now)
 return {item,duplicate:false}
}
export function uploadFingerprint(input: ReturnType<typeof parseItem>, photo: Buffer){return createHash('sha256').update(JSON.stringify(input)).update(photo).digest('hex')}
export function archiveOutfit(state: Snapshot, id: string, input: any, now: string) {
 if(typeof input?.archived!=='boolean'||!['outfit','suggestion'].includes(input.kind))invalid('Acción inválida.')
 const collection=input.kind==='outfit'?state.outfits.outfits:state.suggestions.suggestions
 const entry=collection.find((x:any)=>x.id===id) as {archived_at?:string}|undefined
 if(!entry)invalid('No encontré ese outfit.',404)
 if(input.archived)entry!.archived_at=now;else delete entry!.archived_at
 return {id,archived:input.archived,kind:input.kind}
}
