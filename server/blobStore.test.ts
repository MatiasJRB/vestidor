import test from 'node:test'
import assert from 'node:assert/strict'
import { isConditionalConflict } from './blobStore.ts'
test('Blob conditional operation conflicts are retryable, unrelated errors are not',()=>{
 assert(isConditionalConflict(new Error('Vercel Blob: The conditional request cannot succeed due to a conflicting operation against this resource.')))
 assert(isConditionalConflict(new Error('Blob already exists')))
 assert(isConditionalConflict(new Error('Precondition failed')))
 assert(!isConditionalConflict(new Error('Invalid token')))
 assert(!isConditionalConflict(new Error('Network unavailable')))
})

import { readDocument } from './blobStore.ts'
test('large JSON reads request identity encoding: weak compressed ETags cannot be used for CAS',async()=>{
 const large={items:Array.from({length:500},()=>({label:'Fixture without personal data'}))}
 const fakeGet:any=async(_key:string,options:any)=>{assert.equal(options.headers['Accept-Encoding'],'identity');assert.equal(options.useCache,false);return {statusCode:200,stream:new Blob([JSON.stringify(large)]).stream(),blob:{etag:'"strong-original"'}}}
 const result=await readDocument('fixture',undefined,fakeGet);assert.deepEqual(result.value,large);assert.equal(result.etag,'"strong-original"')
 await assert.rejects(()=>readDocument('fixture',undefined,(async()=>({statusCode:200,stream:new Blob(['{}']).stream(),blob:{etag:'W/"compressed"'}}))as any),/strong ETag/)
})
