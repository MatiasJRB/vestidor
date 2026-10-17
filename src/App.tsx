import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowsDownUp,
  Check,
  CoatHanger,
  Plus,
  Trash,
  ArrowCounterClockwise,
  Eyeglasses,
  ImageSquare,
  ListChecks,
  MagnifyingGlass,
  ShirtFolded,
  Sneaker,
  SpinnerGap,
  Sparkle,
  SquaresFour,
  X,
} from '@phosphor-icons/react'
import {
  categoryLabels,
  inventory,
  inventoryUpdatedAt,
  itemImage,
  itemName,
  outfitById,
  outfits,
  photoUrl,
  reviewQueue,
  suggestions,
  type Category,
  type WardrobeItem,
} from './data'
import { AddGarment } from './AddGarment'
import { ColorPicker } from './ColorPicker'
import { api } from './api'
import { GooglePhotosImport } from './GooglePhotosImport'
import { WardrobeReview } from './WardrobeReview'

type View = 'items' | 'outfits' | 'review'
type Sort = 'used' | 'name' | 'category'

const inventoryUpdatedLabel = new Intl.DateTimeFormat('es-AR', { dateStyle: 'long' }).format(new Date(inventoryUpdatedAt))


const categories = ['all', 'top', 'bottom', 'outerwear', 'shoes', 'accessory'] as const
const categoryIcons = {
  top: ShirtFolded,
  bottom: CoatHanger,
  outerwear: CoatHanger,
  shoes: Sneaker,
  accessory: Eyeglasses,
}

function App() {
  const [outfitCount, setOutfitCount] = useState(outfits.filter(o => !o.archived_at && o.completeness !== 'not_an_outfit').length)
  const [adding, setAdding] = useState(false)
  const [imageFilter, setImageFilter] = useState(false)
  const [view, setView] = useState<View>('items')
  const [category, setCategory] = useState<'all' | Category>('all')
  const [style, setStyle] = useState('all')
  const [color, setColor] = useState('all')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<Sort>('used')
  const [selected, setSelected] = useState<WardrobeItem | null>(null)
  const [wardrobeItems, setWardrobeItems] = useState(inventory)
  const [pendingReviewCount, setPendingReviewCount] = useState(reviewQueue.filter((item) => item.status === 'pending').length)

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [view])

  const refreshInventory = useCallback(async () => {
    const response = await fetch('/api/wardrobe-review/inventory', { headers: { Accept: 'application/json' } })
    if (response.status === 401) { window.location.replace('/login'); return }
    if (!response.ok) return
    const body = await response.json() as { items: WardrobeItem[] }
    setWardrobeItems(body.items)
  }, [])

  useEffect(() => {
    void refreshInventory().catch(() => {})
    const interval = window.setInterval(() => void refreshInventory().catch(() => {}), 60_000)
    return () => window.clearInterval(interval)
  }, [refreshInventory])

  const styles = useMemo(
    () => [...new Set(wardrobeItems.flatMap((item) => item.style_tags))].sort(),
    [wardrobeItems],
  )
  const colors = useMemo(
    () => [...new Set(wardrobeItems.flatMap((item) => item.colors))].sort(),
    [wardrobeItems],
  )

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('es')
    return wardrobeItems
      .filter((item) => !imageFilter || !item.catalog_image)
      .filter((item) => category === 'all' || item.category === category)
      .filter((item) => style === 'all' || item.style_tags.includes(style))
      .filter((item) => color === 'all' || item.colors.includes(color))
      .filter((item) => {
        if (!needle) return true
        return [itemName(item), item.type, item.brand, ...item.colors, ...item.style_tags]
          .filter(Boolean)
          .join(' ')
          .toLocaleLowerCase('es')
          .includes(needle)
      })
      .sort((a, b) => {
        if (sort === 'used') return b.seen_in.length - a.seen_in.length
        if (sort === 'category') return a.category.localeCompare(b.category) || itemName(a).localeCompare(itemName(b))
        return itemName(a).localeCompare(itemName(b))
      })
  }, [category, color, query, sort, style, wardrobeItems, imageFilter])

  const generatedCount = wardrobeItems.filter((item) => item.catalog_image).length
  const currentItemById = useMemo(() => new Map(wardrobeItems.map((item) => [item.id, item])), [wardrobeItems])
  const activeFilters = Number(category !== 'all') + Number(style !== 'all') + Number(color !== 'all') + Number(Boolean(query))

  function clearFilters() {
    setImageFilter(false)
    setCategory('all')
    setStyle('all')
    setColor('all')
    setQuery('')
  }

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Vestidor, inicio">
          <span className="brand-mark"><CoatHanger weight="bold" /></span>
          <span>Vestidor</span>
        </a>
        <form className="logout-form" action="/auth/logout" method="post"><button type="submit">Salir</button></form>
        <nav className="view-switch" aria-label="Vista principal" role="tablist">
          <button role="tab" aria-selected={view === 'items'} className={view === 'items' ? 'active' : ''} onClick={() => setView('items')}>
            <SquaresFour /> Prendas
          </button>
          <button role="tab" aria-selected={view === 'outfits'} className={view === 'outfits' ? 'active' : ''} onClick={() => setView('outfits')}>
            <ImageSquare /> Outfits
          </button>
          <button role="tab" aria-selected={view === 'review'} className={view === 'review' ? 'active' : ''} onClick={() => setView('review')}>
            <ListChecks /> Revisar {pendingReviewCount > 0 && <span className="review-count">{pendingReviewCount}</span>}
          </button>
        </nav>
      </header>

      <section className={view === 'outfits' ? 'intro outfit-intro' : 'intro'} id="top">
        <div>
          <h1>{view === 'review' ? 'Revisá las prendas antes de sumarlas.' : view === 'outfits' ? 'Tus looks. Nuevas ideas.' : 'Tu ropa. Nuevas combinaciones.'}</h1>
        </div>
        {view !== 'outfits' && <div className="summary" aria-label="Resumen del inventario">
          <div><strong>{wardrobeItems.length}</strong><span>prendas</span></div>
          <div><strong>{outfitCount}</strong><span>outfits</span></div>
          <div><strong>{generatedCount}</strong><span>recortes</span></div>
        </div>}
      </section>

      {view !== 'outfits' && <div className="wardrobe-actions"><button className="primary-action" onClick={() => {setAdding(!adding);setView('items')}}><Plus/> Agregar prenda</button><button className="secondary-action" aria-pressed={imageFilter} onClick={() => {setImageFilter(!imageFilter);setView('items');setAdding(false)}}>Sin imagen de catálogo · {wardrobeItems.filter(i => !i.catalog_image).length}</button></div>}
      {adding && <AddGarment onAdded={refreshInventory} onClose={() => setAdding(false)}/>}
      {!adding && (view === 'items' ? (
        <>
          <section className="toolbar" aria-label="Filtros del inventario">
            <label className="search">
              <MagnifyingGlass aria-hidden="true" />
              <span className="sr-only">Buscar prendas</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar prenda, color o marca" />
              {query && <button onClick={() => setQuery('')} aria-label="Limpiar búsqueda"><X /></button>}
            </label>
            <label className="select-wrap">
              <ArrowsDownUp aria-hidden="true" />
              <span className="sr-only">Ordenar</span>
              <select value={sort} onChange={(event) => setSort(event.target.value as Sort)}>
                <option value="used">Más usadas</option>
                <option value="name">Nombre</option>
                <option value="category">Categoría</option>
              </select>
            </label>
          </section>

          <section className="filter-block">
            <div className="filter-row category-row" aria-label="Filtrar por categoría">
              {categories.map((value) => {
                const Icon = value === 'all' ? SquaresFour : categoryIcons[value]
                return (
                  <button key={value} className={category === value ? 'active' : ''} onClick={() => setCategory(value)}>
                    <Icon /> {value === 'all' ? 'Todo' : categoryLabels[value]}
                  </button>
                )
              })}
            </div>
            <details className="visual-filters"><summary>Colores y estilos{activeFilters > 0 ? ` · ${activeFilters} filtros` : ''}</summary>
              <div><h3>Color</h3><ColorPicker values={colors} selected={color === 'all' ? [] : [color]} onChange={values => setColor(values[0] ?? 'all')}/></div>
              <div><h3>Estilo</h3><div className="style-options">{styles.map(value => {const example = wardrobeItems.find(i => i.style_tags.includes(value));return <button key={value} aria-pressed={style === value} onClick={() => setStyle(style === value ? 'all' : value)}>{example && <img src={itemImage(example)} alt={`Ejemplo de ${value}`} loading="lazy"/>}<span>{value}</span></button>})}</div></div>
              {activeFilters > 0 && <button className="secondary-action" onClick={clearFilters}>Limpiar filtros</button>}
            </details>
          </section>

          <div className="results-line">
            <p>{filtered.length} {filtered.length === 1 ? 'prenda' : 'prendas'}</p>
            <span>Las etiquetas de estilo todavía son sugeridas.</span>
          </div>

          {filtered.length ? (
            <section className="wardrobe-grid" aria-live="polite">
              {filtered.map((item) => <ItemCard key={item.id} item={item} onOpen={() => setSelected(item)} />)}
            </section>
          ) : (
            <section className="empty-state">
              <MagnifyingGlass />
              <h2>No aparece nada con esos filtros</h2>
              <p>Probá otra combinación o limpiá la búsqueda.</p>
              <button onClick={clearFilters}>Ver todo el placard</button>
            </section>
          )}
        </>
      ) : view === 'outfits' ? (
        <OutfitGrid itemMap={currentItemById} onCountChange={setOutfitCount} />
      ) : (
        <WardrobeReview inventoryItems={wardrobeItems} onInventoryChanged={refreshInventory} onPendingChange={setPendingReviewCount} />
      ))}

      <footer>
        <span>Tu inventario privado</span>
        <span>Actualizado el {inventoryUpdatedLabel}</span>
      </footer>

      {selected && <ItemDetail item={selected} onClose={() => setSelected(null)} />}
    </main>
  )
}

function ItemCard({ item, onOpen }: { item: WardrobeItem; onOpen: () => void }) {
  const generated = Boolean(item.catalog_image)
  const generationStatus = item.catalog_generation_status
  const generating = generationStatus === 'queued' || generationStatus === 'generating'
  return (
    <article className="item-card">
      <button className="item-image" onClick={onOpen} aria-label={`Ver detalle de ${itemName(item)}`}>
        <img src={itemImage(item)} alt={itemName(item)} />
        <span className={generated || generating ? 'image-label generated' : generationStatus === 'failed' ? 'image-label failed' : 'image-label'}>
          {generationStatus === 'generating' ? <SpinnerGap className="spin" /> : generationStatus === 'queued' ? <Sparkle/> : generated ? <Sparkle weight="fill" /> : generationStatus === 'failed' ? <X /> : <ImageSquare />}
          {generationStatus === 'queued' ? 'Imagen IA pendiente' : generationStatus === 'generating' ? 'Generando recorte' : generated ? 'IA por revisar' : generationStatus === 'failed' ? 'Falló el recorte' : 'Foto real'}
        </span>
      </button>
      <div className="item-copy">
        <div className="item-heading">
          <div>
            <p>{categoryLabels[item.category]}</p>
            <h2>{itemName(item)}</h2>
          </div>
          <span className="use-count" title="Cantidad de apariciones">{item.seen_in.length}×</span>
        </div>
        <div className="tags">
          {item.colors.slice(0, 2).map((value) => <span key={value}>{value}</span>)}
          {item.style_tags.slice(0, 1).map((value) => <span key={value}>{value}</span>)}
        </div>
      </div>
    </article>
  )
}

function ItemDetail({ item, onClose }: { item: WardrobeItem; onClose: () => void }) {
  const catalogViews = item.catalog_views ?? []
  const [activeSide, setActiveSide] = useState<'front' | 'back'>(catalogViews[0]?.side ?? 'front')
  const activeCatalogView = catalogViews.find((view) => view.side === activeSide)
  const heroImage = activeCatalogView ? `/items/${activeCatalogView.image}` : itemImage(item)

  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', close)
    document.body.classList.add('modal-open')
    return () => {
      window.removeEventListener('keydown', close)
      document.body.classList.remove('modal-open')
    }
  }, [onClose])

  const sightings = item.seen_in.map((id) => outfitById.get(id)).filter(Boolean)
  const directEvidence = item.evidence_photos ?? []
  return (
    <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="detail-title" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="detail-panel">
        <button className="close-button" onClick={onClose} aria-label="Cerrar detalle"><X /></button>
        <div className="detail-hero">
          <img src={heroImage} alt={`${itemName(item)}${activeCatalogView ? `, vista ${activeSide === 'front' ? 'del frente' : 'de la espalda'}` : ''}`} />
          {catalogViews.length > 1 && (
            <div className="garment-view-switch" role="group" aria-label="Vista de la prenda">
              {catalogViews.map((view) => (
                <button
                  key={view.side}
                  type="button"
                  aria-pressed={activeSide === view.side}
                  onClick={() => setActiveSide(view.side)}
                >
                  {view.side === 'front' ? 'Frente' : 'Espalda'}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="detail-copy">
          <p className="detail-category">{categoryLabels[item.category]}</p>
          <h2 id="detail-title">{itemName(item)}</h2>
          <div className="status"><Check weight="bold" /> Confirmada</div>

          {item.catalog_image && (
            <div className="image-caution">
              <Sparkle weight="fill" />
              <p>{item.catalog_image_caution ?? 'Imagen reconstruida con IA. Validá el calce y los detalles con las fotos originales.'}</p>
            </div>
          )}
          {(item.catalog_generation_status === 'queued' || item.catalog_generation_status === 'generating') && (
            <div className="image-caution generation-pending">
              <SpinnerGap className="spin" />
              <p>{item.catalog_generation_status === 'queued' ? 'Recorte IA en cola. La foto real ya está disponible. Tu agente puede procesar esta cola; no hay generación automática en la web.' : 'Generando el recorte IA desde la mejor foto real.'}</p>
            </div>
          )}
          {item.catalog_generation_status === 'failed' && (
            <div className="image-caution generation-failed">
              <X />
              <p>No se pudo generar el recorte. La foto real sigue guardada y se puede reintentar.</p>
            </div>
          )}

          <dl>
            <div><dt>Color</dt><dd>{item.colors.join(', ')}</dd></div>
            {item.brand && <div><dt>Marca</dt><dd>{item.brand}</dd></div>}
            {item.material && <div><dt>Material</dt><dd>{item.material}</dd></div>}
            <div><dt>Estilo</dt><dd>{item.style_tags.join(', ')}</dd></div>
            <div><dt>Temporada</dt><dd>{item.season_tags.join(', ')}</dd></div>
            <div><dt>Apariciones</dt><dd>{item.seen_in.length}</dd></div>
          </dl>

          <div className="evidence">
            <h3>Fotos originales</h3>
            <div className="evidence-strip">
              {sightings.map((outfit) => outfit && (
                <a key={outfit.id} href={photoUrl(outfit.photo)} target="_blank" rel="noreferrer">
                  <img src={photoUrl(outfit.photo)} alt={`Aparición del ${new Date(outfit.captured_at).toLocaleDateString('es-AR')}`} />
                </a>
              ))}
              {directEvidence.map((photo) => (
                <a key={photo} href={photoUrl(photo)} target="_blank" rel="noreferrer">
                  <img src={photoUrl(photo)} alt="Aparición importada desde Google Fotos" />
                </a>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

function OutfitGrid({ itemMap, onCountChange }: { itemMap: Map<string, WardrobeItem>; onCountChange:(count:number)=>void }) {
  const [entries, setEntries] = useState(outfits)
  const [ideas, setIdeas] = useState(suggestions)
  const [trash, setTrash] = useState(false)
  const [collection, setCollection] = useState<'generated'|'worn'>('generated')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  useEffect(() => onCountChange(entries.filter(o => !o.archived_at && o.completeness !== 'not_an_outfit').length),[entries,onCountChange])
  const realOutfits = entries.filter(o => o.completeness !== 'not_an_outfit' && Boolean(o.archived_at) === trash)
  const generatedOutfits = ideas.filter(o => Boolean(o.archived_at) === trash)
  async function archive(id:string,kind:'outfit'|'suggestion',archived:boolean){
    if(busy || (archived && !window.confirm('¿Mover este outfit a la papelera? Vas a poder restaurarlo.')))return
    setBusy(id);setError('')
    try{await api(`/api/outfits/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify({archived,kind})});
      const update=<T extends {id:string;archived_at?:string},>(items:T[])=>items.map(i=>i.id===id?{...i,archived_at:archived?new Date().toISOString():undefined}:i)
      if(kind==='outfit'){const next=update(entries);outfits.splice(0,outfits.length,...next);setEntries(next)}else{const next=update(ideas);suggestions.splice(0,suggestions.length,...next);setIdeas(next)}
    }catch(e){setError((e as Error).message)}finally{setBusy('')}
  }
  function deleteButton(id:string,kind:'outfit'|'suggestion'){return <button className="secondary-action" disabled={Boolean(busy)} onClick={()=>void archive(id,kind,!trash)}>{trash?<ArrowCounterClockwise/>:<Trash/>}{busy===id?'Guardando…':trash?'Restaurar':'Borrar outfit'}</button>}

  return (
    <section className="outfit-section">
      <div className="outfit-collections" role="tablist" aria-label="Colecciones de outfits">
        <button role="tab" aria-selected={collection === 'generated'} onClick={() => {setCollection('generated');setTrash(false)}}><Sparkle/> Generados por tu agente <span>{ideas.filter(i => !i.archived_at).length}</span></button>
        <button role="tab" aria-selected={collection === 'worn'} onClick={() => {setCollection('worn');setTrash(false)}}><ImageSquare/> Que usaste <span>{entries.filter(o => !o.archived_at && o.completeness !== 'not_an_outfit').length}</span></button>
      </div>
      {collection === 'worn' && <GooglePhotosImport />}
      <div className="outfit-heading"><p>{trash ? 'Papelera' : collection === 'generated' ? 'Ideas para volver a combinar tu ropa' : 'Tus looks, en fotos reales'}</p><button className="secondary-action" onClick={()=>setTrash(!trash)}>{trash?'Volver a la colección':'Ver papelera'}</button></div>
      {error && <p role="alert" className="form-error">{error}</p>}
      {collection === 'generated' ? <>
        {!generatedOutfits.length && <section className="empty-state"><Sparkle/><h2>{trash?'La papelera está vacía':'Tu próxima combinación empieza acá'}</h2><p>{trash?'Los outfits que borres se pueden restaurar desde acá.':'Las propuestas que tu agente guarde en Vestidor van a aparecer en esta colección. No se generan automáticamente.'}</p></section>}
        <div className="outfit-grid generated-outfits">
          {generatedOutfits.map(idea => <article className="outfit-card generated-outfit" key={idea.id}>
            <a className="outfit-image-link" href={`/${idea.image}`} target="_blank" rel="noreferrer" aria-label={`Abrir imagen de ${idea.occasion}`}><img src={`/${idea.image}`} alt={`Outfit sugerido: ${idea.occasion}`} loading="lazy"/></a>
            <div><p className="generated-note"><Sparkle/> Propuesta IA · prendas de tu inventario</p><h2>{idea.occasion}</h2><p>{idea.reason}</p>
              <details className="outfit-recipe"><summary>Ver prendas y cómo usarlo</summary><ul>{idea.item_ids.map(id => {const item=itemMap.get(id);return item?<li key={id}>{itemName(item)}</li>:null})}</ul><p>{idea.styling}</p>{idea.weather_assumption && <p>{idea.weather_assumption}</p>}</details>
              {deleteButton(idea.id,'suggestion')}
            </div>
          </article>)}
        </div>
      </> : <>
        {!realOutfits.length && <section className="empty-state"><ImageSquare/><h2>{trash?'La papelera está vacía':'Todavía no hay outfits registrados'}</h2><p>{trash?'Podés recuperar los outfits que borres desde esta colección.':'Acá van tus fotos de looks usados. Las propuestas IA están en Generados por tu agente.'}</p></section>}
        <div className="outfit-grid">
          {realOutfits.map(outfit => <article key={outfit.id} className="outfit-card">
            <a className="outfit-image-link" href={photoUrl(outfit.photo)} target="_blank" rel="noreferrer"><img src={photoUrl(outfit.photo)} alt={`Outfit del ${new Date(outfit.captured_at).toLocaleDateString('es-AR')}`} loading="lazy"/></a>
            <div><time>{new Date(outfit.captured_at).toLocaleDateString('es-AR',{day:'numeric',month:'short'})}</time><h2>{outfit.context.replace('/',' + ')}</h2><p>{outfit.confirmed_items.map(id => itemMap.get(id)).filter(Boolean).map(item => item && itemName(item)).join(' · ')}</p>{deleteButton(outfit.id,'outfit')}</div>
          </article>)}
        </div>
      </>}

    </section>
  )
}

export default App
