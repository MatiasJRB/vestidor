import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import sharp from 'sharp'
import {createApp} from './app.ts'
import {hashPassword} from './auth.ts'
test('local HTTP mobile upload persists image and inventory; retries once, CSRF blocked, trash restores',async()=>{
 const dataDir=await mkdtemp(join(tmpdir(),'vestidor-http-')),password='test-only-long-password'
 const app=await createApp({dataDir,passwordHash:hashPassword(password),secure:false});await new Promise<void>(r=>app.server.listen(0,'127.0.0.1',r))
 const origin=`http://127.0.0.1:${(app.server.address()as any).port}`
 try{
 const photo='data:image/jpeg;base64,'+(await sharp({create:{width:16,height:16,channels:3,background:'blue'}}).jpeg().toBuffer()).toString('base64')
 const body=JSON.stringify({requestId:'22222222-2222-4222-8222-222222222222',name:'Remera azul test',category:'top',colors:['azul'],photo,queueImage:true})
 assert.equal((await fetch(origin+'/api/wardrobe-items',{method:'POST',headers:{origin},body})).status,401)
 const login=await fetch(origin+'/auth/login',{method:'POST',headers:{origin},body:'password='+password,redirect:'manual'}),cookie=login.headers.get('set-cookie')!.split(';')[0],headers={origin,cookie,'content-type':'application/json'}
 assert.equal((await fetch(origin+'/api/wardrobe-items',{method:'POST',headers:{...headers,origin:'https://evil.test'},body})).status,403)
 for(let i=0;i<2;i++)assert.equal((await fetch(origin+'/api/wardrobe-items',{method:'POST',headers,body})).status,200)
 const data=await(await fetch(origin+'/api/bootstrap',{headers:{cookie}})).json();assert.equal(data.inventory.items.length,1)
 const item=data.inventory.items[0];assert.equal(item.catalog_generation_status,'queued')
 const media=await fetch(origin+'/media/photos/'+item.primary_photo.split('/').at(-1),{headers:{cookie}});assert.equal(media.status,200);assert.equal(media.headers.get('content-type'),'image/jpeg')
 assert.equal(JSON.parse(await readFile(join(dataDir,'private/catalog-generation-queue.json'),'utf8')).jobs.length,1)
 await writeFile(join(dataDir,'private/outfits.json'),JSON.stringify({outfits:[{id:'fixture-outfit'}]}))
 for(const archived of [true,false]){
 assert.equal((await fetch(origin+'/api/outfits/fixture-outfit',{method:'PATCH',headers,body:JSON.stringify({kind:'outfit',archived})})).status,200)
 const stored=JSON.parse(await readFile(join(dataDir,'private/outfits.json'),'utf8'));assert.equal(Boolean(stored.outfits[0].archived_at),archived)
 }
 }finally{await app.close();await rm(dataDir,{recursive:true,force:true})}
})
