import { useEffect, useMemo, useState, useRef } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle,
  LinkSimple,
  PencilSimple,
  Scissors,
  SpinnerGap,
  X,
} from '@phosphor-icons/react'
import { ColorPicker, colorPalette } from './ColorPicker'
import {
  categoryLabels,
  itemName,
  photoUrl,
  reviewQueue as initialReviewQueue,
  type ReviewCandidate,
  type WardrobeItem,
} from './data'

type DecisionAction = 'confirm_new' | 'link_existing' | 'reject'

type ReviewResponse = {
  candidateId: string
  status: ReviewCandidate['status']
  itemId?: string
  inventoryCount: number
  pendingCount: number
}

type ItemEdits = {
  userLabel: string
  category: ReviewCandidate['proposed_item']['category']
  brand: string
  colors: string[]
}

type SplitResponse = {
  candidate: ReviewCandidate
  created: ReviewCandidate
  pendingCount: number
}

async function decide(candidateId: string, action: DecisionAction, existingId?: string, edits?: ItemEdits) {
  const response = await fetch(`/api/wardrobe-review/${encodeURIComponent(candidateId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, existingId, edits }),
    signal: AbortSignal.timeout(25000),
  })
  if (response.status === 401) { window.location.assign('/login'); throw new Error('Tu sesión venció. Volvé a entrar.') }
  const body = await response.json() as ReviewResponse & { error?: { message?: string } }
  if (!response.ok) throw new Error(body.error?.message ?? 'No pude guardar la decisión.')
  return body
}

async function splitPhoto(candidateId: string, photo: string) {
  const response = await fetch(`/api/wardrobe-review/${encodeURIComponent(candidateId)}/split`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ photo }),
  })
  const body = await response.json() as SplitResponse & { error?: { message?: string } }
  if (!response.ok) throw new Error(body.error?.message ?? 'No pude separar esa foto.')
  return body
}

function confidenceLabel(confidence: ReviewCandidate['confidence']) {
  if (confidence === 'high') return 'Bastante segura'
  if (confidence === 'medium') return 'Revisar detalle'
  return 'Dudosa'
}

export function WardrobeReview({
  inventoryItems,
  onInventoryChanged,
  onPendingChange,
}: {
  inventoryItems: WardrobeItem[]
  onInventoryChanged: () => Promise<void>
  onPendingChange: (count: number) => void
}) {
  const saving = useRef(false)
  const [queue, setQueue] = useState(initialReviewQueue)
  const [position, setPosition] = useState(0)
  const [photoIndex, setPhotoIndex] = useState(0)
  const [busy, setBusy] = useState<DecisionAction | 'split' | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [linkTarget, setLinkTarget] = useState(inventoryItems[0]?.id ?? '')
  const [draft, setDraft] = useState<ItemEdits>({ userLabel: '', category: 'top', brand: '', colors: [] })

  const pending = useMemo(() => queue.filter((candidate) => candidate.status === 'pending'), [queue])
  const candidate = pending[position]
  const resolved = queue.length - pending.length

  useEffect(() => onPendingChange(pending.length), [onPendingChange, pending.length])

  useEffect(() => {
    fetch('/api/wardrobe-review', { headers: { Accept: 'application/json' } })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((body: { items: ReviewCandidate[] }) => setQueue(body.items))
      .catch(() => setError('No pude actualizar las propuestas. Recargá la página para intentar de nuevo.'))
  }, [])

  useEffect(() => {
    setPhotoIndex(0)
    setError('')
    setNotice('')
    setLinkTarget(candidate?.suggested_existing_id ?? inventoryItems[0]?.id ?? '')
    if (candidate) {
      setDraft({
        userLabel: candidate.proposed_item.user_label ?? [candidate.proposed_item.brand, candidate.proposed_item.type].filter(Boolean).join(' '),
        category: candidate.proposed_item.category,
        brand: candidate.proposed_item.brand ?? '',
        colors: candidate.proposed_item.colors,
      })
    }
  }, [candidate?.id])

  async function save(action: DecisionAction, existingId?: string) {
    if (!candidate || saving.current) return
    saving.current = true
    setBusy(action)
    setError('')
    try {
      const result = await decide(candidate.id, action, existingId, action === 'confirm_new' ? draft : undefined)
      setQueue((current) => current.map((item) => item.id === candidate.id ? { ...item, status: result.status } : item))
      const nextPendingCount = pending.length - 1
      void onInventoryChanged().catch(() => setNotice('Guardado. El inventario se actualizará al recargar.'))
      onPendingChange(result.pendingCount)
      setPosition((current) => nextPendingCount === 0 ? 0 : Math.min(current, nextPendingCount - 1))
    } catch (caught) {
      setError(caught instanceof Error ? (caught.name === 'TimeoutError' ? 'La respuesta tardó demasiado. Podés reintentar: no se duplicará la prenda.' : caught.message) : 'No pude guardar la decisión.')
    } finally {
      saving.current = false
      setBusy(null)
    }
  }

  async function separateSelectedPhoto() {
    if (!candidate || busy || candidate.evidence_photos.length < 2) return
    const selectedIndex = candidate.evidence_photos[photoIndex] ? photoIndex : 0
    const selectedPhoto = candidate.evidence_photos[selectedIndex]
    setBusy('split')
    setError('')
    setNotice('')
    try {
      const result = await splitPhoto(candidate.id, selectedPhoto)
      setQueue((current) => {
        const index = current.findIndex((item) => item.id === candidate.id)
        if (index === -1) return current
        const next = [...current]
        next.splice(index, 1, result.candidate, result.created)
        return next
      })
      setPhotoIndex(0)
      setNotice(`Listo: la foto ${selectedIndex + 1} quedó como una propuesta aparte.`)
      onPendingChange(result.pendingCount)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No pude separar esa foto.')
    } finally {
      setBusy(null)
    }
  }

  if (!candidate) {
    return (
      <section className="review-empty">
        <CheckCircle weight="fill" />
        <h2>Placard al día</h2>
        <p>Ya revisaste las {queue.length} propuestas de este lote.</p>
      </section>
    )
  }

  const proposed = candidate.proposed_item
  const selectedPhoto = candidate.evidence_photos[photoIndex] ?? candidate.evidence_photos[0]
  const selectedPhotoNumber = Math.max(0, candidate.evidence_photos.indexOf(selectedPhoto)) + 1
  const suggestedExisting = candidate.suggested_existing_id
    ? inventoryItems.find((item) => item.id === candidate.suggested_existing_id)
    : undefined

  return (
    <section className="review-shell" aria-live="polite">
      <div className="review-progress-copy">
        <p><strong>{pending.length}</strong> por revisar</p>
        <span>{resolved} de {queue.length} resueltas</span>
      </div>
      <div className="review-progress" aria-hidden="true">
        <span style={{ width: `${queue.length ? (resolved / queue.length) * 100 : 100}%` }} />
      </div>

      <article className="review-card">
        <div className="review-visual">
          <img src={photoUrl(selectedPhoto)} alt={`Foto real de ${proposed.type}`} />
          <span className={`confidence confidence-${candidate.confidence}`}>{confidenceLabel(candidate.confidence)}</span>
          {candidate.evidence_photos.length > 1 && (
            <div className="review-thumbnails" aria-label="Otras apariciones">
              {candidate.evidence_photos.map((photo, index) => (
                <button key={photo} className={index === photoIndex ? 'active' : ''} onClick={() => setPhotoIndex(index)} aria-label={`Ver aparición ${index + 1}`}>
                  <img src={photoUrl(photo)} alt="" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="review-copy">
          <p className="review-category">{categoryLabels[proposed.category]}</p>
          <h2>{draft.userLabel || [proposed.brand, proposed.type].filter(Boolean).join(' ')}</h2>
          <div className="tags review-tags">
            {proposed.colors.map((color) => <span key={color}>{color}</span>)}
            <span>{candidate.evidence_photos.length} {candidate.evidence_photos.length === 1 ? 'foto' : 'fotos'}</span>
          </div>
          <p className="review-note">{candidate.note}</p>

          {candidate.evidence_photos.length > 1 && (
            <button className="review-split" disabled={Boolean(busy)} onClick={separateSelectedPhoto}>
              {busy === 'split' ? <SpinnerGap className="spin" /> : <Scissors />}
              La foto {selectedPhotoNumber} es otra prenda
            </button>
          )}

          <details className="review-edit">
            <summary><PencilSimple /> Editar nombre y datos</summary>
            <div className="review-form">
              <label className="review-field-wide">
                <span>Nombre visible</span>
                <input value={draft.userLabel} maxLength={80} onChange={(event) => setDraft((current) => ({ ...current, userLabel: event.target.value }))} />
              </label>
              <label>
                <span>Categoría</span>
                <select value={draft.category} onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value as ItemEdits['category'] }))}>
                  <option value="top">Top</option>
                  <option value="bottom">Pantalón / short</option>
                  <option value="outerwear">Abrigo</option>
                  <option value="shoes">Calzado</option>
                  <option value="accessory">Accesorio</option>
                </select>
              </label>
              <label>
                <span>Marca</span>
                <input value={draft.brand} maxLength={60} placeholder="Opcional" onChange={(event) => setDraft((current) => ({ ...current, brand: event.target.value }))} />
              </label>
              <fieldset className="review-field-wide" disabled={Boolean(busy)} style={{border:0,padding:0,margin:0}}>
                <legend>Colores</legend>
                <ColorPicker values={[...new Set([...Object.keys(colorPalette),...draft.colors])]} selected={draft.colors} onChange={colors => setDraft(current => ({...current,colors}))} multiple/>
              </fieldset>
            </div>
          </details>

          {suggestedExisting ? (
            <div className="review-match">
              <div>
                <p>Posible repetida</p>
                <strong>{itemName(suggestedExisting)}</strong>
              </div>
              <img src={photoUrl(suggestedExisting.primary_photo)} alt="" />
            </div>
          ) : null}

          {notice && <p className="review-notice">{notice}</p>}
          {error && <p className="review-error">{error}</p>}

          <div className="review-actions">
            {suggestedExisting ? (
              <>
                <button className="review-primary" disabled={Boolean(busy)} onClick={() => save('link_existing', suggestedExisting.id)}>
                  {busy === 'link_existing' ? <SpinnerGap className="spin" /> : <LinkSimple />} Sí, es la misma
                </button>
                <button disabled={Boolean(busy)} onClick={() => save('confirm_new')}>
                  {busy === 'confirm_new' ? <SpinnerGap className="spin" /> : <Check />} No, es otra
                </button>
              </>
            ) : (
              <>
                <button className="review-primary" disabled={Boolean(busy)} onClick={() => save('confirm_new')}>
                  {busy === 'confirm_new' ? <SpinnerGap className="spin" /> : <Check />} Agregar al placard
                </button>
                <details className="review-link-existing">
                  <summary>Ya la tengo</summary>
                  <div>
                    <select value={linkTarget} onChange={(event) => setLinkTarget(event.target.value)} aria-label="Elegir prenda existente">
                      {inventoryItems.map((item) => <option key={item.id} value={item.id}>{itemName(item)}</option>)}
                    </select>
                    <button disabled={Boolean(busy) || !linkTarget} onClick={() => save('link_existing', linkTarget)}>
                      {busy === 'link_existing' ? <SpinnerGap className="spin" /> : <LinkSimple />} Vincular
                    </button>
                  </div>
                </details>
              </>
            )}
            <button className="review-reject" disabled={Boolean(busy)} onClick={() => save('reject')}>
              {busy === 'reject' ? <SpinnerGap className="spin" /> : <X />} No inventariar
            </button>
          </div>
        </div>
      </article>

      <div className="review-navigation">
        <button disabled={position === 0 || Boolean(busy)} onClick={() => setPosition((current) => current - 1)}><ArrowLeft /> Anterior</button>
        <span>{position + 1} / {pending.length}</span>
        <button disabled={position >= pending.length - 1 || Boolean(busy)} onClick={() => setPosition((current) => current + 1)}>Siguiente <ArrowRight /></button>
      </div>
    </section>
  )
}
