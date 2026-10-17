import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm,readFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import sharp from 'sharp'
import {frameCatalogImage} from './catalogFraming.ts'
import {garmentFrameStyles} from '../src/garmentFrame.ts'
test('catalog framing removes empty canvas, preserves garment with safety margin, leaves source unchanged',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'vestidor-framing-')),file=join(dir,'fixture.png')
 try{
 await sharp({create:{width:1000,height:1000,channels:3,background:'white'}}).composite([{input:await sharp({create:{width:240,height:800,channels:3,background:'black'}}).png().toBuffer(),left:380,top:100}]).png().toFile(file)
 const before=await readFile(file),frame=(await frameCatalogImage(file,'fixture.png'))!
 assert(frame.width<400);assert(frame.height>800);assert(frame.left<380);assert(frame.top<100);assert(frame.left+frame.width>620);assert(frame.top+frame.height>900)
 assert.deepEqual(await readFile(file),before)
 const style=garmentFrameStyles(frame);assert.equal(style.container.aspectRatio,`${frame.width} / ${frame.height}`);assert.equal(style.image.maxWidth,'none');assert(parseFloat(style.image.width)>200)
 }finally{await rm(dir,{recursive:true,force:true})}
})
