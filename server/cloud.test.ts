import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createCloudHandler, type Snapshot } from './cloud.ts'
import { hashPassword } from './auth.ts'

test('cloud login protects media, persists sessions across handlers, applies decisions atomically, revokes logout',async()=>{
 const password='cloud-test-fixture-password';process.env.ADMIN_PASSWORD_HASH=hashPassword(password)
 const files=new Map<string,unknown>()
 const snapshot:Snapshot={inventory:{version:1,updated_at:'now',items:[]},outfits:{outfits:[]},suggestions:{suggestions:[]},generation:{version:1,jobs:[]},review:{version:1,generated_at:'now',source_session_id:'test',items:[{id:'candidate',status:'pending',kind:'new_item',confidence:'high',proposed_item:{id:'test-top',category:'top',type:'remera',colors:['negro'],style_tags:['casual'],season_tags:['verano']},evidence_photos:['private/imports/test.jpg'],note:'fixture'}]}}
 files.set('state/wardrobe.json',snapshot)
 let reads=0
 const deps:any={
  readDocument:async(key:string,fallback:unknown)=>({value:structuredClone(files.get(key)??fallback),etag:'test'}),
  mutateDocument:async(key:string,fallback:unknown,fn:(v:any)=>unknown)=>{const value=structuredClone(files.get(key)??fallback);const result=fn(value);files.set(key,value);return result},
  get:async(key:string)=>{reads++;assert.equal(key,'public/items/test.webp');return{statusCode:200,stream:new Blob(['image-bytes']).stream(),blob:{contentType:'image/webp',etag:'etag'}}},
 }
 let handler=createCloudHandler(deps)
 const server=createServer((req,res)=>void handler(req,res));await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const port=(server.address()as any).port;const base=`http://127.0.0.1:${port}`,origin=`https://127.0.0.1:${port}`
 try{
  for(const path of ['/api/bootstrap','/api/wardrobe-review','/items/test.webp','/outfits/test.png','/media/photos/test.jpg'])assert.equal((await fetch(base+path)).status,401,path)
  assert.equal(reads,0)
  assert.match(await(await fetch(base+'/login')).text(),/Vestidor/)
  assert.equal((await fetch(base+'/auth/login',{method:'POST',body:'password='+password,redirect:'manual'})).status,403)
  const login=await fetch(base+'/auth/login',{method:'POST',headers:{origin},body:'password='+password,redirect:'manual'});assert.equal(login.status,303)
  const cookie=login.headers.get('set-cookie')!.split(';')[0];assert.match(cookie,/__Host-vestidor/)
  handler=createCloudHandler(deps) // a different serverless instance
  assert.equal((await fetch(base+'/api/bootstrap',{headers:{cookie}})).status,200)
  assert.equal(await(await fetch(base+'/items/test.webp',{headers:{cookie}})).text(),'image-bytes')
  const decision=await fetch(base+'/api/wardrobe-review/candidate',{method:'POST',headers:{cookie,origin,'content-type':'application/json'},body:JSON.stringify({action:'confirm_new',edits:{userLabel:'Mi remera'}})});assert.equal(decision.status,200)
  const stored=files.get('state/wardrobe.json')as Snapshot;assert.equal(stored.inventory.items.length,1);assert.equal(stored.review.items[0].status,'confirmed');assert.equal(stored.generation.jobs.length,1)
  assert.equal((await fetch(base+'/auth/logout',{method:'POST',headers:{cookie,origin},redirect:'manual'})).status,303)
  assert.equal((await fetch(base+'/api/bootstrap',{headers:{cookie}})).status,401)
 }finally{await new Promise<void>(r=>server.close(()=>r()));delete process.env.ADMIN_PASSWORD_HASH}
})
