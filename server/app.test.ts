import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp } from './app.ts'
import { hashPassword } from './auth.ts'

test('private runtime protects ALL data and assets, enforces login, CSRF, logout', async () => {
 const dir=await mkdtemp(join(tmpdir(),'placard-test-'))
 const password='private-test-password-long'
 const app=await createApp({dataDir:dir,passwordHash:hashPassword(password),secure:false})
 await new Promise<void>(resolve=>app.server.listen(0,'127.0.0.1',resolve))
 const address=app.server.address() as {port:number};const origin=`http://127.0.0.1:${address.port}`
 try {
 for(const path of ['/api/bootstrap','/api/wardrobe-review/inventory','/api/google-photos/status','/items/secret.webp','/outfits/private.png','/media/photos/private.jpg','/assets/index.js'])assert.equal((await fetch(origin+path,{redirect:'manual'})).status,401,path)
 assert.equal((await fetch(origin+'/',{redirect:'manual'})).status,303)
 assert.equal((await fetch(origin+'/healthz')).status,200)
 assert(!(await (await fetch(origin+'/login')).text()).includes('Matías'))
 assert.equal((await fetch(origin+'/auth/login',{method:'POST',body:'password='+password,redirect:'manual'})).status,403)
 assert.equal((await fetch(origin+'/auth/login',{method:'POST',headers:{origin},body:'password=wrong',redirect:'manual'})).status,401)
 const login=await fetch(origin+'/auth/login',{method:'POST',headers:{origin},body:'password='+password,redirect:'manual'});assert.equal(login.status,303)
 const raw=login.headers.get('set-cookie')!;assert.match(raw,/HttpOnly/);assert.match(raw,/SameSite=Lax/);const cookie=raw.split(';')[0]
 assert.equal((await fetch(origin+'/api/bootstrap',{headers:{cookie}})).status,200)
 assert.equal((await fetch(origin+'/api/admin/import-file',{method:'POST',headers:{cookie,origin,'x-file-path':'private/inventory.json'},body:'{}'})).status,404)
 process.env.ALLOW_DATA_IMPORT='true'
 assert.equal((await fetch(origin+'/api/admin/import-file',{method:'POST',headers:{cookie,origin,'x-file-path':'../secret.json'},body:'{}'})).status,400)
 assert.equal((await fetch(origin+'/api/admin/import-file',{method:'POST',headers:{cookie,origin,'x-file-path':'public/items/test.webp'},body:'test-image'})).status,200)
 assert.equal(await (await fetch(origin+'/items/test.webp',{headers:{cookie}})).text(),'test-image')
 delete process.env.ALLOW_DATA_IMPORT

 await mkdir(join(dir,'public/items'),{recursive:true});await writeFile(join(dir,'public/items/private.webp'),'private-bytes')
 assert.equal(await (await fetch(origin+'/items/private.webp',{headers:{cookie}})).text(),'private-bytes')
 assert.equal((await fetch(origin+'/items/%2e%2e%2f%2e%2e%2fprivate/inventory.json',{headers:{cookie}})).status,404)
 assert.equal((await fetch(origin+'/auth/logout',{method:'POST',headers:{cookie,origin:'https://evil.example'},redirect:'manual'})).status,403)
 assert.equal((await fetch(origin+'/auth/logout',{method:'POST',headers:{cookie,origin},redirect:'manual'})).status,303)
 assert.equal((await fetch(origin+'/api/bootstrap',{headers:{cookie}})).status,401)
 } finally {await app.close();await rm(dir,{recursive:true,force:true})}
})
test('login limiter and Secure host cookie',async()=>{
 const {createAuth}=await import('./auth.ts');const auth=createAuth({passwordHash:hashPassword('long valid password'),secure:true});const headers=new Map();const res={setHeader:(key:string,value:string)=>headers.set(key,value)} as any
 assert.equal(auth.login('long valid password',res),200);assert.match(headers.get('Set-Cookie'),/__Host-placard=.*Secure/)
 for(let i=0;i<19;i++)assert.equal(auth.login('wrong',res),401)
 assert.equal(auth.login('wrong',res),429)
})
