import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex')
  return `scrypt:${salt}:${scryptSync(password, salt, 64).toString('hex')}`
}
export function verifyPassword(password: string, encoded: string) {
  const [algorithm, salt, hash] = encoded.split(':')
  if (algorithm !== 'scrypt' || !/^[a-f0-9]{32}$/.test(salt ?? '') || !/^[a-f0-9]{128}$/.test(hash ?? '')) return false
  const actual = scryptSync(password, salt, 64)
  return timingSafeEqual(actual, Buffer.from(hash, 'hex'))
}
const lifetime = 12 * 60 * 60 * 1000
export function createAuth({ passwordHash, secure }: { passwordHash: string; secure: boolean }) {
  if (!passwordHash || !verifyPassword('configuration-check', passwordHash) && !/^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(passwordHash)) throw new Error('ADMIN_PASSWORD_HASH must be a valid scrypt hash; refusing to start')
  const sessions = new Map<string, number>()
  let attempts: number[] = []
  const name = secure ? '__Host-placard' : 'placard-local'
  const cookie = (value: string, age: number) => `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${secure ? '; Secure' : ''}`
  function token(request: IncomingMessage) {
    return (request.headers.cookie ?? '').split(';').map(c => c.trim()).find(c => c.startsWith(`${name}=`))?.slice(name.length + 1) ?? ''
  }
  return {
    authenticated(request: IncomingMessage) {
      const key = token(request), expires = sessions.get(key)
      if (!expires) return false
      if (expires < Date.now()) { sessions.delete(key); return false }
      return true
    },
    login(password: string, response: ServerResponse) {
      const now = Date.now()
      attempts = attempts.filter(t => t > now - 15 * 60_000)
      // Global limiter cannot be bypassed by spoofing proxy headers.
      if (attempts.length >= 20) { response.setHeader('Retry-After', '900'); return 429 }
      attempts.push(now)
      if (!verifyPassword(password, passwordHash)) return 401
      for (const [key, expires] of sessions) if (expires < now) sessions.delete(key)
      const key = randomBytes(32).toString('hex')
      sessions.set(key, now + lifetime)
      response.setHeader('Set-Cookie', cookie(key, lifetime / 1000))
      return 200
    },
    logout(request: IncomingMessage, response: ServerResponse) {
      sessions.delete(token(request))
      response.setHeader('Set-Cookie', cookie('', 0))
    },
  }
}
