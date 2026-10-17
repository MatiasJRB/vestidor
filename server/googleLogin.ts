import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose'
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto'
const jwks = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'))
export type OAuthFlow = { verifier: string; nonce: string; expires: number }
export function makeFlow() {
 const state = randomBytes(32).toString('hex'), verifier = randomBytes(48).toString('base64url'), nonce = randomBytes(32).toString('hex')
 return {state, flow:{verifier,nonce,expires:Date.now()+10*60_000},challenge:createHash('sha256').update(verifier).digest('base64url')}
}
export function matchesState(state: string, cookie: string) {
 return /^[a-f0-9]{64}$/.test(state) && /^[a-f0-9]{64}$/.test(cookie) && timingSafeEqual(Buffer.from(state),Buffer.from(cookie))
}
export function validateIdentity(payload: JWTPayload, nonce: string, allowedEmail: string) {
 if(payload.nonce!==nonce||payload.email_verified!==true||typeof payload.email!=='string'||!payload.sub||payload.email.toLowerCase()!==allowedEmail.toLowerCase())throw new Error('Unauthorized identity')
 return {sub:payload.sub,email:payload.email.toLowerCase()}
}
export async function exchangeGoogleCode(code: string, flow: OAuthFlow, config: {clientId:string;clientSecret:string;redirectUri:string;allowedEmail:string}) {
 const result=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:config.clientId,client_secret:config.clientSecret,code,code_verifier:flow.verifier,redirect_uri:config.redirectUri,grant_type:'authorization_code'}),signal:AbortSignal.timeout(15_000)})
 if(!result.ok)throw new Error('Google code exchange failed')
 const data=await result.json() as {id_token?:string}
 if(!data.id_token)throw new Error('Missing identity token')
 const {payload}=await jwtVerify(data.id_token,jwks,{issuer:['https://accounts.google.com','accounts.google.com'],audience:config.clientId,algorithms:['RS256']})
 return validateIdentity(payload,flow.nonce,config.allowedEmail)
}
