import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { get, put } from '@vercel/blob'
if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error('Set BLOB_READ_WRITE_TOKEN privately; never commit it')
const source=resolve(process.argv[2]??'.deploy/web-data'), replace=process.argv.includes('--replace')
const existing=await get('state/wardrobe.json',{access:'private',useCache:false,headers:{'Accept-Encoding':'identity'}})
if(existing&&!replace)throw new Error('Remote wardrobe exists. Review remote changes before --replace; a backup will be saved locally.')
if(existing?.statusCode===200&&existing.stream){await mkdir('.deploy',{recursive:true});await writeFile(`.deploy/remote-backup-${Date.now()}.json`,await new Response(existing.stream).text(),{mode:0o600})}
const pending=[]
async function walk(relative=''){
 for(const item of await readdir(join(source,relative),{withFileTypes:true})){
  const path=join(relative,item.name)
  if(item.isDirectory())await walk(path)
  else if(item.isFile()&&!/^private\/[^/]+\.json$/.test(path))pending.push(path)
 }
}
await walk();let completed=0
async function worker(){while(pending.length){const path=pending.shift();const bytes=await readFile(join(source,path));const ext=path.split('.').at(-1);const mime={jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',png:'image/png',heic:'image/heic'}[ext]??'application/octet-stream';await put(path,bytes,{access:'private',addRandomSuffix:false,allowOverwrite:true,contentType:mime,cacheControlMaxAge:60});completed++;if(completed%40===0)console.log('Private media uploaded:',completed)}}
await Promise.all(Array.from({length:3},()=>worker()))
const read=async name=>JSON.parse(await readFile(join(source,'private',name+'.json'),'utf8'))
const [inventory,outfits,suggestions,review,generation]=await Promise.all(['inventory','outfits','suggestions','review-queue','catalog-generation-queue'].map(read))
const result=await put('state/wardrobe.json',JSON.stringify({inventory,outfits,suggestions,review,generation}),{access:'private',addRandomSuffix:false,allowOverwrite:Boolean(existing),...(existing?{ifMatch:existing.blob.etag}:{}),contentType:'application/json',cacheControlMaxAge:60})
await mkdir('.deploy',{recursive:true});await writeFile('.deploy/last-sync.json',JSON.stringify({at:new Date().toISOString(),files:completed,inventoryCount:inventory.items.length,etag:result.etag}),{mode:0o600})
console.log(JSON.stringify({uploadedMedia:completed,items:inventory.items.length,private:true}))
