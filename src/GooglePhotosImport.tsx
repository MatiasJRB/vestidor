import { useEffect, useRef, useState } from 'react'
import { ArrowClockwise, Check, CloudArrowDown, GooglePhotosLogo, LockSimple, WarningCircle } from '@phosphor-icons/react'
import { googlePhotosApi, GooglePhotosApiError, type GooglePhotosStatus, type ImportResult } from './googlePhotos'

type Stage = 'checking' | 'idle' | 'opening' | 'waiting' | 'importing' | 'done' | 'error'

function wait(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const abort = () => {
      window.clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    const timer = window.setTimeout(() => {
      signal.removeEventListener('abort', abort)
      resolve()
    }, milliseconds)
    signal.addEventListener('abort', abort, { once: true })
  })
}

function errorMessage(error: unknown) {
  if (error instanceof GooglePhotosApiError) {
    if (error.code === 'NOT_CONNECTED' || error.code === 'RECONNECT_REQUIRED') return 'La conexión venció. Volvé a conectar tu cuenta.'
    if (error.status === 403) return 'Google rechazó el permiso. Revisá que Photos Picker esté habilitada para este proyecto.'
    if (error.status === 429) return 'Google pidió bajar el ritmo. Esperá un minuto y probá otra vez.'
    return error.message
  }
  return 'No pudimos completar la importación. Probá otra vez.'
}

export function GooglePhotosImport() {
  const [status, setStatus] = useState<GooglePhotosStatus | null>(null)
  const [stage, setStage] = useState<Stage>('checking')
  const [message, setMessage] = useState('Revisando la conexión…')
  const [result, setResult] = useState<ImportResult | null>(null)
  const [pickerUri, setPickerUri] = useState<string | null>(null)
  const operation = useRef<AbortController | null>(null)
  const pickerWindow = useRef<Window | null>(null)
  const activeSessionId = useRef<string | null>(null)

  async function refreshStatus() {
    operation.current?.abort()
    const controller = new AbortController()
    operation.current = controller
    setStage('checking')
    setMessage('Revisando la conexión…')
    try {
      const next = await googlePhotosApi.status(controller.signal)
      setStatus(next)
      setStage('idle')
      setMessage(next.localOnly ? 'La importación se hace desde tu instalación local.' : next.connected ? 'Google Fotos conectado' : next.configured ? 'Falta autorizar tu cuenta una sola vez' : 'Falta la credencial OAuth local')
    } catch (error) {
      if (controller.signal.aborted) return
      setStage('error')
      setMessage(errorMessage(error))
    }
  }

  useEffect(() => {
    const query = new URLSearchParams(window.location.search)
    const oauthResult = query.get('googlePhotos')
    if (oauthResult) window.history.replaceState({}, '', window.location.pathname)
    void (async () => {
      await refreshStatus()
      if (oauthResult === 'cancelled') {
        setStage('error')
        setMessage('La conexión se canceló. No se leyó ninguna foto.')
      }
    })()
    return () => {
      operation.current?.abort()
      pickerWindow.current?.close()
      const sessionId = activeSessionId.current
      activeSessionId.current = null
      if (sessionId) void googlePhotosApi.cancelSession(sessionId).catch(() => undefined)
    }
  }, [])

  function cancelWaiting() {
    const sessionId = activeSessionId.current
    operation.current?.abort()
    pickerWindow.current?.close()
    pickerWindow.current = null
    activeSessionId.current = null
    setPickerUri(null)
    if (sessionId) void googlePhotosApi.cancelSession(sessionId).catch(() => undefined)
    setStage('idle')
    setMessage('Importación cancelada. No se descargó ninguna foto.')
  }

  async function startImport() {
    const controller = new AbortController()
    operation.current?.abort()
    operation.current = controller
    setResult(null)
    setPickerUri(null)
    setStage('opening')
    setMessage('Preparando el selector seguro de Google…')
    pickerWindow.current = window.open('', 'google-photos-picker', 'popup,width=1080,height=760')
    if (!pickerWindow.current) {
      setStage('error')
      setMessage('El navegador bloqueó el selector. Permití ventanas emergentes para este sitio y probá otra vez.')
      return
    }
    try {
      const session = await googlePhotosApi.createSession(controller.signal)
      activeSessionId.current = session.id
      setPickerUri(session.pickerUri)
      pickerWindow.current.location.href = session.pickerUri
      setStage('waiting')
      setMessage('Elegí las fotos de los últimos 7 días y tocá Listo en Google Fotos.')
      const deadline = Date.now() + Math.min(session.timeoutMs || 5 * 60_000, 10 * 60_000)
      let pollAfterMs = session.pollAfterMs
      while (!controller.signal.aborted && Date.now() < deadline) {
        await wait(pollAfterMs, controller.signal)
        const current = await googlePhotosApi.sessionStatus(session.id, controller.signal)
        if (current.ready) {
          setStage('importing')
          setMessage('Descargando y quitando repetidas…')
          const imported = await googlePhotosApi.importSession(session.id, controller.signal)
          activeSessionId.current = null
          pickerWindow.current = null
          setPickerUri(null)
          setResult(imported)
          setStage('done')
          setMessage(imported.imported > 0
            ? `${imported.imported} ${imported.imported === 1 ? 'foto nueva quedó lista' : 'fotos nuevas quedaron listas'} para revisar.`
            : 'No había fotos nuevas: todo lo elegido ya estaba procesado.')
          return
        }
        pollAfterMs = current.pollAfterMs
      }
      throw new GooglePhotosApiError('El selector venció sin recibir una selección. Podés intentarlo de nuevo.', 'PICKER_TIMEOUT', 408)
    } catch (error) {
      if (controller.signal.aborted) return
      const sessionId = activeSessionId.current
      pickerWindow.current?.close()
      pickerWindow.current = null
      activeSessionId.current = null
      setPickerUri(null)
      if (sessionId) void googlePhotosApi.cancelSession(sessionId).catch(() => undefined)
      if (error instanceof GooglePhotosApiError && ['NOT_CONNECTED', 'RECONNECT_REQUIRED'].includes(error.code)) {
        setStatus((current) => current ? { ...current, connected: false } : current)
      }
      setStage('error')
      setMessage(errorMessage(error))
    }
  }

  const busy = ['checking', 'opening', 'waiting', 'importing'].includes(stage)
  const configured = status?.configured ?? false
  const connected = status?.connected ?? false

  return (
    <section className={`photo-import ${stage === 'error' ? 'has-error' : ''}`} aria-labelledby="photo-import-title" aria-busy={busy}>
      <div className="photo-import-lead">
        <span className="photo-import-icon"><GooglePhotosLogo weight="fill" /></span>
        <div>
          <h2 id="photo-import-title">{status?.localOnly ? 'Tu historial de outfits.' : 'Traé esta semana desde Google Fotos.'}</h2>
          <p>{status?.localOnly ? 'Consultá tus fotos acá. Para sumar nuevas, importalas desde tu instalación local y sincronizá el ropero.' : 'Elegís varias fotos, las descargamos en privado y sacamos las repetidas antes de inventariar.'}</p>
        </div>
      </div>
      <div className="photo-import-action">
        <p className="photo-import-status" aria-live="polite">
          {stage === 'done' ? <Check weight="bold" /> : stage === 'error' ? <WarningCircle weight="fill" /> : <CloudArrowDown />}
          <span>{message}</span>
        </p>
        {status?.localOnly ? <small>El login con Google sólo sirve para entrar: no conecta tu biblioteca de fotos.</small> : !configured ? (
          <>
            <button onClick={refreshStatus} disabled={busy}><ArrowClockwise /> Revisar configuración</button>
            <small className="photo-import-setup">Primero ejecutá <code>npm run setup:google-photos -- /ruta/client_secret.json</code> en este proyecto.</small>
          </>
        ) : !connected ? (
          <a className="photo-import-button" href="/api/google-photos/connect"><GooglePhotosLogo weight="fill" /> Conectar Google Fotos</a>
        ) : (
          stage === 'waiting' ? (
            <>
              {pickerUri && (
                <a className="photo-import-button" href={pickerUri} target="_blank" rel="noreferrer">
                  <GooglePhotosLogo weight="fill" /> Abrir Google Fotos
                </a>
              )}
              <button className="photo-import-cancel" onClick={cancelWaiting}>Cancelar espera</button>
            </>
          ) : (
            <button onClick={startImport} disabled={busy}>
              {busy ? <ArrowClockwise className="spin" /> : <GooglePhotosLogo weight="fill" />}
              {stage === 'importing' ? 'Importando fotos' : 'Elegir fotos de esta semana'}
            </button>
          )
        )}
        {result && (result.duplicates > 0 || result.videosSkipped > 0) && (
          <small>{result.duplicates > 0 ? `${result.duplicates} repetidas omitidas. ` : ''}{result.videosSkipped > 0 ? `${result.videosSkipped} videos ignorados.` : ''}</small>
        )}
        <small className="photo-import-privacy"><LockSimple weight="fill" /> Sólo lectura. Google Fotos no se modifica.</small>
      </div>
    </section>
  )
}
