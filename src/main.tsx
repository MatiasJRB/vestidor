import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { loadWardrobe } from './data'
import './styles.css'
import './brand.css'
const root = createRoot(document.getElementById('root')!)
root.render(<div className="app-loading" role="status">Abriendo tu placard…</div>)
async function start() {
  try {
    await loadWardrobe()
    const { default: App } = await import('./App')
    root.render(<StrictMode><App /></StrictMode>)
  } catch (error) {
    root.render(<div className="app-loading" role="alert"><h1>No pude abrir tu placard</h1><p>{error instanceof Error ? error.message : 'Intentá de nuevo.'}</p><button onClick={() => window.location.reload()}>Reintentar</button></div>)
  }
}
void start()
