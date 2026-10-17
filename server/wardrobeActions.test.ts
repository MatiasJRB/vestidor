import test from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import {parseItem,sanitizePhoto,addItem,uploadFingerprint,archiveOutfit} from './wardrobeActions.ts'
import {applyCandidateDecision} from './wardrobeReview.ts'
import type {Snapshot} from './cloud.ts'
function fixture():Snapshot{return {inventory:{version:1,updated_at:'',items:[]},review:{version:1,generated_at:'',source_session_id:'',items:[]},generation:{version:1,jobs:[]},outfits:{outfits:[{id:'outfit'}]},suggestions:{suggestions:[{id:'idea'}]}}}
const input={requestId:'11111111-1111-4111-8111-111111111111',name:'Remera de prueba',category:'top',colors:['negro'],queueImage:true}
test('manual upload validates image, is confirmed immediately and queues optional image once',async()=>{
 const photo=await sharp({create:{width:10,height:10,channels:3,background:'black'}}).jpeg().toBuffer()
 const safe=await sanitizePhoto('data:image/jpeg;base64,'+photo.toString('base64'));assert.equal((await sharp(safe).metadata()).format,'jpeg')
 const parsed=parseItem(input),state=fixture(),fingerprint=uploadFingerprint(parsed,safe)
 const result=addItem(state,parsed,'now','private/photos/fixture.jpg',fingerprint);assert.equal(result.item.status,'confirmed');assert.equal(state.generation.jobs.length,1)
 assert.equal(addItem(state,parsed,'later','private/photos/fixture.jpg',fingerprint).duplicate,true);assert.equal(state.inventory.items.length,1);assert.equal(state.generation.jobs.length,1)
 assert.throws(()=>addItem(state,parsed,'now','private/photos/other.jpg','different'),/otros datos/)
 await assert.rejects(()=>sanitizePhoto('data:image/svg+xml;base64,foo'),/foto/)
 await assert.rejects(()=>sanitizePhoto('data:image/jpeg;base64,aW52YWxpZA=='),/leer/)
 for(const changes of [{name:'x'},{colors:[]},{category:'bad'},{queueImage:'true'}])assert.throws(()=>parseItem({...input,...changes}))
 const manual=fixture();addItem(manual,parseItem({...input,queueImage:false}),'now','photo','fingerprint');assert.equal(manual.generation.jobs.length,0)
})
test('outfit and suggestion deletion is reversible and does not remove clothing',()=>{
 const s=fixture();archiveOutfit(s,'outfit',{kind:'outfit',archived:true},'now');assert.equal((s.outfits.outfits[0]as any).archived_at,'now')
 archiveOutfit(s,'outfit',{kind:'outfit',archived:false},'later');assert.equal((s.outfits.outfits[0]as any).archived_at,undefined)
 archiveOutfit(s,'idea',{kind:'suggestion',archived:true},'now');assert.equal(s.suggestions.suggestions.length,1)
 assert.throws(()=>archiveOutfit(s,'unknown',{kind:'outfit',archived:true},'now'),/encontré/)
})
test('same review decision can be retried after a lost response without duplicate clothing',()=>{
 const s=fixture();s.review.items.push({id:'candidate',status:'pending',kind:'new_item',confidence:'high',proposed_item:{id:'top',category:'top',type:'remera',colors:['negro'],style_tags:[],season_tags:[]},evidence_photos:['private/photos/test.jpg'],note:''})
 const first=applyCandidateDecision(s.review,s.inventory,'candidate',{action:'confirm_new'},'now')
 assert.deepEqual(applyCandidateDecision(s.review,s.inventory,'candidate',{action:'confirm_new'},'later'),first);assert.equal(s.inventory.items.length,1)
 assert.throws(()=>applyCandidateDecision(s.review,s.inventory,'candidate',{action:'reject'},'now'),/resuelta/)
})
