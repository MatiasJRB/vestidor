import { makeFlow, matchesState, exchangeGoogleCode, type OAuthFlow } from './googleLogin.ts'
import { renderLogin } from './login.ts'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createHash, randomBytes } from 'node:crypto'
import { Readable } from 'node:stream'
import { get as blobGet } from '@vercel/blob'
import { verifyPassword } from './auth.ts'
import { readDocument as blobReadDocument, mutateDocument as blobMutateDocument } from './blobStore.ts'
import { applyCandidateDecision, splitCandidateEvidence, enqueueCatalogGeneration } from './wardrobeReview.ts'

export type Snapshot = {
 inventory: Parameters<typeof applyCandidateDecision>[1]
 review: Parameters<typeof applyCandidateDecision>[0]
 generation: Parameters<typeof enqueueCatalogGeneration>[0]
 outfits: { outfits: unknown[] }
 suggestions: { suggestions: unknown[] }
}
type AuthState = { attempts: number[]; sessions: Record<string, number>; oauth?: Record<string, OAuthFlow> }
const emptyAuth: AuthState = { attempts: [], sessions: {} }
const sessionDuration = 12 * 60 * 60_000
const keyOf = (token: string) => createHash('sha256').update(token).digest('hex')
export function readSessionToken(request: IncomingMessage) {
 return (request.headers.cookie ?? '').split(';').map(c => c.trim()).find(c => c.startsWith('__Host-vestidor='))?.split('=')[1] ?? ''
}
export function sameOrigin(request: IncomingMessage) {
 const origin=request.headers.origin
 if (!origin) return false
 const host=request.headers['x-forwarded-host'] ?? request.headers.host
 return origin === `https://${host}` || (process.env.PUBLIC_ORIGIN !== undefined && origin === process.env.PUBLIC_ORIGIN)
}
const loginHtml = (message='') => renderLogin({ message, google: process.env.AUTH_MODE === 'google', configured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) })
function json(res: ServerResponse, code: number, data: unknown) {res.writeHead(code,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data))}
function redirect(res: ServerResponse, path: string) {res.writeHead(303,{Location:path});res.end()}
async function body(req: IncomingMessage & {body?: unknown}) {
 if(req.body !== undefined) return typeof req.body === 'string' ? req.body : req.body
 let text='';for await(const chunk of req){text+=chunk;if(text.length>64*1024)throw new Error('Request body too large')}return text
}
function parseJson(value: unknown) {return typeof value==='string' ? JSON.parse(value) : value}
export function createCloudHandler(overrides: { readDocument?: typeof blobReadDocument; mutateDocument?: typeof blobMutateDocument; get?: typeof blobGet } = {}) {
const readDocument = overrides.readDocument ?? blobReadDocument
const mutateDocument = overrides.mutateDocument ?? blobMutateDocument
const get = overrides.get ?? blobGet
async function authenticated(req: IncomingMessage) {
 const token=readSessionToken(req)
 if(!/^[a-f0-9]{64}$/.test(token))return false
 const {value}=await readDocument<AuthState>('state/auth.json',emptyAuth)
 return (value.sessions[keyOf(token)] ?? 0)>Date.now()
}
async function handleCloud(req: IncomingMessage & {body?: unknown},res: ServerResponse) {
 res.setHeader('Cache-Control','private, no-store')
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Strict-Transport-Security','max-age=31536000')
 res.setHeader('Content-Security-Policy',"default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'")
 try {
  const url=new URL(req.url ?? '/','https://localhost')
  const path=url.searchParams.get('route') ?? url.pathname
  if(path==='/healthz')return json(res,200,{ok:true})
  if(!['GET','HEAD'].includes(req.method ?? 'GET')&&!sameOrigin(req))return json(res,403,{error:'Origen no permitido'})
  if(path==='/login'&&req.method==='GET'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(loginHtml(url.searchParams.get('error')==='account'?'Esa cuenta no tiene acceso a este Vestidor.':url.searchParams.has('error')?'El inicio de sesión venció o se canceló. Probá de nuevo.':''));return}
  if(path==='/auth/google'&&req.method==='GET'){
   const clientId=process.env.GOOGLE_CLIENT_ID,clientSecret=process.env.GOOGLE_CLIENT_SECRET,canonical=process.env.PUBLIC_ORIGIN,allowed=process.env.ALLOWED_GOOGLE_EMAIL
   if(!clientId||!clientSecret||!canonical||!allowed)return json(res,503,{error:'Google todavía no está configurado'})
   const host=req.headers['x-forwarded-host']??req.headers.host
   if(`https://${host}`!==canonical)return redirect(res,canonical+'/auth/google')
   const {state,flow,challenge}=makeFlow()
   const permitted=await mutateDocument<AuthState,boolean>('state/auth.json',emptyAuth,value=>{
    const now=Date.now();value.attempts=value.attempts.filter(t=>t>now-15*60_000)
    if(value.attempts.length>=20)return false
    value.attempts.push(now);value.oauth??={}
    for(const key in value.oauth)if(value.oauth[key].expires<now)delete value.oauth[key]
    value.oauth[keyOf(state)]=flow;return true
   })
   if(!permitted)return json(res,429,{error:'Demasiados intentos. Esperá 15 minutos.'})
   res.setHeader('Set-Cookie',`__Host-vestidor-oauth=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`)
   const authorization=new URL('https://accounts.google.com/o/oauth2/v2/auth')
   authorization.search=new URLSearchParams({client_id:clientId,redirect_uri:canonical+'/auth/google/callback',response_type:'code',scope:'openid email profile',state,nonce:flow.nonce,code_challenge:challenge,code_challenge_method:'S256',prompt:'select_account',login_hint:allowed}).toString()
   return redirect(res,authorization.toString())
  }
  if(path==='/auth/google/callback'&&req.method==='GET'){
   const state=url.searchParams.get('state')??''
   const bound=(req.headers.cookie??'').split(';').map(c=>c.trim()).find(c=>c.startsWith('__Host-vestidor-oauth='))?.split('=')[1]??''
   if(!matchesState(state,bound)||!url.searchParams.get('code'))return redirect(res,'/login?error=google')
   const flow=await mutateDocument<AuthState,OAuthFlow|undefined>('state/auth.json',emptyAuth,value=>{const item=value.oauth?.[keyOf(state)];if(value.oauth)delete value.oauth[keyOf(state)];return item})
   const clear='__Host-vestidor-oauth=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0'
   if(!flow||flow.expires<Date.now()){res.setHeader('Set-Cookie',clear);return redirect(res,'/login?error=google')}
   try{
    await exchangeGoogleCode(url.searchParams.get('code')!,flow,{clientId:process.env.GOOGLE_CLIENT_ID!,clientSecret:process.env.GOOGLE_CLIENT_SECRET!,redirectUri:process.env.PUBLIC_ORIGIN!+'/auth/google/callback',allowedEmail:process.env.ALLOWED_GOOGLE_EMAIL!})
   }catch{res.setHeader('Set-Cookie',clear);return redirect(res,'/login?error=account')}
   const token=randomBytes(32).toString('hex')
   await mutateDocument<AuthState,void>('state/auth.json',emptyAuth,value=>{for(const key in value.sessions)if(value.sessions[key]<Date.now())delete value.sessions[key];value.sessions[keyOf(token)]=Date.now()+sessionDuration})
   res.setHeader('Set-Cookie',[clear,`__Host-vestidor=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${sessionDuration/1000}`]);return redirect(res,'/')
  }
  if(path==='/auth/login'&&req.method==='POST'){
   if(process.env.AUTH_MODE==='google')return json(res,404,{error:'Usá Google para entrar'})
   if(!process.env.ADMIN_PASSWORD_HASH)return json(res,503,{error:'Acceso no configurado'})
   const raw=await body(req)
   const password=typeof raw==='string'?new URLSearchParams(raw).get('password')??'':String((raw as {password?:string})?.password??'')
   if(password.length>256)return json(res,400,{error:'Contraseña inválida'})
   const token=randomBytes(32).toString('hex')
   const result=await mutateDocument<AuthState,number>('state/auth.json',emptyAuth,state=>{
    const now=Date.now();state.attempts=state.attempts.filter(t=>t>now-15*60_000)
    for(const key of Object.keys(state.sessions))if(state.sessions[key]<now)delete state.sessions[key]
    if(state.attempts.length>=20)return 429
    state.attempts.push(now)
    if(!verifyPassword(password,process.env.ADMIN_PASSWORD_HASH!))return 401
    state.sessions[keyOf(token)]=now+sessionDuration;return 200
   })
   if(result===200){res.setHeader('Set-Cookie',`__Host-vestidor=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${sessionDuration/1000}`);return redirect(res,'/')}
   res.statusCode=result;if(result===429)res.setHeader('Retry-After','900');res.setHeader('Content-Type','text/html; charset=utf-8');res.end(loginHtml(result===429?'Demasiados intentos. Esperá 15 minutos.':'La contraseña no es correcta.'));return
  }
  if(!await authenticated(req)){
   if(path==='/'||path==='/auth/logout')return redirect(res,'/login')
   return json(res,401,{error:'Iniciá sesión'})
  }
  if(path==='/auth/logout'&&req.method==='POST'){
   await mutateDocument<AuthState,void>('state/auth.json',emptyAuth,state=>{delete state.sessions[keyOf(readSessionToken(req))]})
   res.setHeader('Set-Cookie','__Host-vestidor=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');res.setHeader('Clear-Site-Data','"cache"');return redirect(res,'/login')
  }
  const media=path.match(/^\/(items|outfits|media\/photos)\/([A-Za-z0-9_.-]+)$/)
  const evidence=path.match(/^\/api\/wardrobe-review\/photo\/([A-Za-z0-9_.-]+)$/)
  if((media||evidence)&&req.method==='GET'){
   let key=''
   if(media)key=(media[1]==='media/photos'?'private/photos/':`public/${media[1]}/`)+media[2]
   if(evidence){const {value}=await readDocument<Snapshot>('state/wardrobe.json');const photo=value.review.items.flatMap(i=>i.evidence_photos).find(p=>p.split('/').at(-1)===evidence[1]);if(!photo)return json(res,404,{error:'Foto no encontrada'});key=photo}
   const blob=await get(key,{access:'private'})
   if(!blob||blob.statusCode!==200||!blob.stream)return json(res,404,{error:'Foto no encontrada'})
   res.writeHead(200,{'Content-Type':blob.blob.contentType,'Cache-Control':'private, no-cache','ETag':blob.blob.etag})
   Readable.fromWeb(blob.stream as import('node:stream/web').ReadableStream).pipe(res);return
  }
  if(path==='/api/bootstrap'&&req.method==='GET'){const {value}=await readDocument<Snapshot>('state/wardrobe.json');return json(res,200,{inventory:value.inventory,outfits:value.outfits,suggestions:value.suggestions,review:value.review})}
  if(path==='/api/wardrobe-review/inventory'&&req.method==='GET'){const {value}=await readDocument<Snapshot>('state/wardrobe.json');return json(res,200,value.inventory)}
  if(path==='/api/wardrobe-review'&&req.method==='GET'){const {value}=await readDocument<Snapshot>('state/wardrobe.json');return json(res,200,value.review)}
  const split=path.match(/^\/api\/wardrobe-review\/([^/]+)\/split$/)
  const decision=path.match(/^\/api\/wardrobe-review\/([^/]+)$/)
  if(req.method==='POST'&&(split||decision)){
   const data=parseJson(await body(req))
   const result=await mutateDocument<Snapshot,unknown>('state/wardrobe.json',undefined,state=>{
    const now=new Date().toISOString()
    if(split)return splitCandidateEvidence(state.review,decodeURIComponent(split[1]),data.photo,now)
    const id=decodeURIComponent(decision![1]);const candidate=state.review.items.find(i=>i.id===id)
    const result=applyCandidateDecision(state.review,state.inventory,id,data,now)
    const job=data.action==='confirm_new'&&result.itemId&&candidate?enqueueCatalogGeneration(state.generation,candidate,result.itemId,now):undefined
    return {...result,generationStatus:job?.status}
   });return json(res,200,result)
  }
  if(path==='/api/google-photos/status'&&req.method==='GET')return json(res,200,{configured:false,connected:false,localOnly:true,reason:'La importación de Google Fotos se realiza desde tu instalación local y se sincroniza a la web.'})
  return json(res,404,{error:'Ruta no disponible'})
 }catch(error){const status=typeof error==='object'&&error!==null&&'status'in error?Number(error.status):500;console.error('[vestidor-cloud]',error instanceof Error?error.name:'error');return json(res,status>=400&&status<500?status:503,{error:{message:status>=400&&status<500&&error instanceof Error?error.message:'No pude conectar con tu ropero. Intentá de nuevo.'}})}
}

return handleCloud
}
export const handleCloud = createCloudHandler()
