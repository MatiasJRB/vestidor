import { parseItem, sanitizePhoto, addItem, uploadFingerprint, archiveOutfit } from './wardrobeActions.ts'
import type { Snapshot } from './cloud.ts'
import { renderLogin } from './login.ts'
import { createServer } from 'node:http'
import { readFile, mkdir, copyFile, stat, realpath, writeFile, rename } from 'node:fs/promises'
import { resolve, join, extname, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createReadStream } from 'node:fs'
import { createAuth } from './auth.ts'
import { createWardrobeReviewHandler } from './wardrobeReview.ts'
import { createGooglePhotosPickerHandler } from './googlePhotosPicker.ts'

const loginPage = (message = '') => renderLogin({ message, google: process.env.AUTH_MODE === 'google', googleUrl: process.env.GOOGLE_LOGIN_URL ?? '/auth/google', configured: Boolean(process.env.GOOGLE_LOGIN_URL || process.env.GOOGLE_CLIENT_ID) })

export async function createApp(options: { dataDir?: string; passwordHash: string; secure?: boolean; publicOrigin?: string; dev?: boolean; distDir?: string }) {
  const dataDir = resolve(options.dataDir ?? process.env.DATA_DIR ?? './data')
  const privateDir = join(dataDir, 'private')
  await mkdir(privateDir, { recursive: true, mode: 0o700 })
  for (const file of ['inventory.json', 'outfits.json', 'suggestions.json', 'review-queue.json', 'catalog-generation-queue.json']) {
    try { await copyFile(resolve('examples', file), join(privateDir, file), 1) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error }
  }
  const auth = createAuth({ passwordHash: options.passwordHash, secure: options.secure ?? true })
  const review = createWardrobeReviewHandler({ projectRoot: dataDir })
  const google = createGooglePhotosPickerHandler({ projectRoot: dataDir, oauthFile: process.env.GOOGLE_PHOTOS_OAUTH_FILE, redirectUri: process.env.GOOGLE_PHOTOS_REDIRECT_URI, tokenFile: join(privateDir, 'google-photos-token.json'), importDir: join(privateDir, 'imports') })
  const vite = options.dev ? await (await import('vite')).createServer({ server: { middlewareMode: true }, appType: 'spa' }) : null
  let sequence = Promise.resolve()
  const serialReview = (req: Parameters<typeof review>[0], res: Parameters<typeof review>[1]) => {
    sequence = sequence.then(() => review(req, res, () => json(res, 404, { error: 'Not found' }))).catch(() => { if (!res.writableEnded) json(res, 500, { error: 'No se pudo guardar' }) })
    return sequence
  }
  const server = createServer(async (req, res) => {
    try {
      res.setHeader('Cache-Control', 'private, no-store')
      res.setHeader('X-Content-Type-Options', 'nosniff')
      res.setHeader('Referrer-Policy', 'no-referrer')
      res.setHeader('X-Frame-Options', 'DENY')
      res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
      if (options.secure ?? true) res.setHeader('Strict-Transport-Security', 'max-age=31536000')
      res.setHeader('Content-Security-Policy', (options.dev ? "script-src 'self' 'unsafe-inline'; connect-src 'self' ws:; " : "script-src 'self'; connect-src 'self'; ") + "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
      const url = new URL(req.url ?? '/', 'http://localhost')
      if (url.pathname === '/healthz' && req.method === 'GET') return json(res, 200, { ok: true })
      // Require browser same-origin for every mutation, including login/logout.
      if (!['GET', 'HEAD'].includes(req.method ?? 'GET')) {
        const expected = options.publicOrigin ?? `${options.secure ?? true ? 'https' : 'http'}://${req.headers.host}`
        if (req.headers.origin !== expected) return json(res, 403, { error: 'Origen no permitido' })
      }
      if (url.pathname === '/login' && req.method === 'GET') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(loginPage()); return }
      if (url.pathname === '/auth/login' && req.method === 'POST') {
        let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 4096) { json(res, 413, { error: 'Solicitud demasiado grande' }); return } }
        const result = auth.login(new URLSearchParams(body).get('password') ?? '', res)
        if (result === 200) { res.writeHead(303, { Location: '/' }); res.end(); return }
        res.statusCode = result; res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(loginPage(result === 429 ? 'Demasiados intentos. Esperá 15 minutos.' : 'La contraseña no es correcta.')); return
      }
      if (!auth.authenticated(req)) {
        if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/media/') || url.pathname.startsWith('/items/') || url.pathname.startsWith('/outfits/') || url.pathname.startsWith('/assets/')) return json(res, 401, { error: 'Iniciá sesión' })
        res.writeHead(303, { Location: '/login' }); res.end(); return
      }
      if (url.pathname === '/auth/logout' && req.method === 'POST') { auth.logout(req, res); res.writeHead(303, { Location: '/login' }); res.end(); return }
      if (url.pathname === '/api/admin/import-file' && req.method === 'POST') {
        if (process.env.ALLOW_DATA_IMPORT !== 'true') return json(res, 404, { error: 'Not found' })
        const relative = req.headers['x-file-path']
        if (typeof relative !== 'string' || !/^(private\/(inventory|outfits|suggestions|review-queue|catalog-generation-queue)\.json|private\/(photos|imports)\/[A-Za-z0-9_.-]+\.(jpg|jpeg|png|webp|heic|json)|public\/(items|outfits)\/[A-Za-z0-9_.-]+\.(webp|jpg|jpeg|png))$/.test(relative)) return json(res, 400, { error: 'Ruta no permitida' })
        const chunks: Buffer[] = []; let size = 0
        for await (const chunk of req) { size += chunk.length; if (size > 12 * 1024 * 1024) return json(res, 413, { error: 'Archivo demasiado grande' }); chunks.push(chunk) }
        const target = join(dataDir, relative)
        await mkdir(resolve(target, '..'), { recursive: true, mode: 0o700 })
        await writeFile(target + '.upload', Buffer.concat(chunks), { mode: 0o600 })
        await rename(target + '.upload', target)
        return json(res, 200, { ok: true })
      }
      const outfitAction = url.pathname.match(/^\/api\/outfits\/([^/]+)$/)
      if ((url.pathname === '/api/wardrobe-items' && req.method === 'POST') || (outfitAction && req.method === 'PATCH')) {
        let text = ''; for await (const chunk of req) { text += chunk; if (text.length > 3_200_000) return json(res,413,{error:'Foto demasiado grande'}) }
        let input: any; try { input = JSON.parse(text) } catch { return json(res,400,{error:'Solicitud inválida'}) }
        // Share the local mutation lock with review, so concurrent uploads cannot replace newer edits.
        sequence = sequence.then(async () => {
          try {
            const names = ['inventory','review-queue','catalog-generation-queue','outfits','suggestions']
            const [inventory,review,generation,outfits,suggestions] = await Promise.all(names.map(async name=>JSON.parse(await readFile(join(privateDir,name+'.json'),'utf8'))))
            const state: Snapshot = {inventory,review,generation,outfits,suggestions}
            let result: unknown
            if (outfitAction) result=archiveOutfit(state,decodeURIComponent(outfitAction[1]),input,new Date().toISOString())
            else {
              const parsed=parseItem(input),photo=await sanitizePhoto(input.photo),fingerprint=uploadFingerprint(parsed,photo)
              const key=`private/photos/${parsed.id}-${fingerprint.slice(0,16)}.jpg`
              result=addItem(state,parsed,new Date().toISOString(),key,fingerprint)
              await mkdir(join(privateDir,'photos'),{recursive:true,mode:0o700})
              try{await writeFile(join(dataDir,key),photo,{mode:0o600,flag:'wx'})}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e}
            }
            const changed=outfitAction?['outfits','suggestions']:['inventory','catalog-generation-queue']
            for(const name of changed){const value=name==='inventory'?state.inventory:name==='catalog-generation-queue'?state.generation:name==='outfits'?state.outfits:state.suggestions;const target=join(privateDir,name+'.json');await writeFile(target+'.tmp',JSON.stringify(value,null,2),{mode:0o600});await rename(target+'.tmp',target)}
            json(res,200,result)
          }catch(error){json(res,typeof error==='object'&&error&&'status'in error?Number(error.status):500,{error:error instanceof Error?error.message:'No pude guardar'})}
        }).catch(()=>{if(!res.writableEnded)json(res,500,{error:'No pude guardar'})})
        await sequence; return
      }
      if (url.pathname === '/api/bootstrap' && req.method === 'GET') {
        const [inventory, outfits, suggestions, review] = await Promise.all(['inventory', 'outfits', 'suggestions', 'review-queue'].map(async name => JSON.parse(await readFile(join(privateDir, `${name}.json`), 'utf8'))))
        return json(res, 200, { inventory, outfits, suggestions, review })
      }
      if (url.pathname.startsWith('/api/wardrobe-review')) return await serialReview(req, res)
      if (url.pathname.startsWith('/api/google-photos') || (url.pathname === '/' && url.searchParams.has('state'))) return await google(req, res, () => json(res, 404, { error: 'Not found' }))
      if (!['GET', 'HEAD'].includes(req.method ?? '')) return json(res, 405, { error: 'Método no permitido' })
      const mapping = [['/media/photos/', join(privateDir, 'photos')], ['/items/', join(dataDir, 'public/items')], ['/outfits/', join(dataDir, 'public/outfits')]]
      for (const [prefix, directory] of mapping) if (url.pathname.startsWith(prefix)) return await sendFile(res, directory, decodeURIComponent(url.pathname.slice(prefix.length)), req.method === 'HEAD')
      if (url.pathname.startsWith('/api/')) return json(res, 404, { error: 'Not found' })
      if (vite) return vite.middlewares(req, res)
      const dist = options.distDir ?? resolve('dist')
      return await sendFile(res, dist, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1)), req.method === 'HEAD')
    } catch (error) {
      if (!res.headersSent) json(res, 500, { error: 'No se pudo completar la operación' })
      else res.end()
      console.error('[request]', error instanceof Error ? error.message : 'error')
    }
  })
  server.requestTimeout = 30_000
  server.headersTimeout = 15_000
  return { server, close: async () => { await vite?.close(); await new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done())) } }
}
function json(res: import('node:http').ServerResponse, status: number, value: unknown) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)) }
async function sendFile(res: import('node:http').ServerResponse, directory: string, name: string, head = false) {
  try {
    const root = await realpath(directory), file = await realpath(resolve(root, name))
    if (!file.startsWith(root + sep) || !(await stat(file)).isFile()) return json(res, 404, { error: 'Not found' })
    const types: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml' }
    res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' })
    if (head) res.end(); else createReadStream(file).pipe(res)
  } catch { json(res, 404, { error: 'Not found' }) }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const dev = process.argv.includes('--dev')
  const app = await createApp({ passwordHash: process.env.ADMIN_PASSWORD_HASH ?? '', secure: !dev, publicOrigin: process.env.PUBLIC_ORIGIN || undefined, dev })
  app.server.listen(Number(process.env.PORT ?? 4180), dev ? '127.0.0.1' : '0.0.0.0', () => console.log('Vestidor listening'))
}
