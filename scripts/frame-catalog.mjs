import {readFile,writeFile,rename,mkdir} from 'node:fs/promises'
import {resolve,join} from 'node:path'
import {frameCatalogImage} from '../server/catalogFraming.ts'
const root=resolve(process.env.DATA_DIR??'data'),file=join(root,'private/inventory.json')
const original=await readFile(file,'utf8'),inventory=JSON.parse(original)
let framed=0,skipped=0
for(const item of inventory.items){
 const image=item.catalog_views?.find(v=>v.side==='front')?.image??item.catalog_image
 if(!image)continue
 try{const frame=await frameCatalogImage(join(root,'public/items',image),image);if(frame){item.gallery_frame=frame;framed++}else skipped++}catch{skipped++}
}
if(!process.argv.includes('--dry-run')){
 await mkdir(join(root,'private/backups'),{recursive:true,mode:0o700})
 await writeFile(join(root,'private/backups',`inventory-framing-${Date.now()}.json`),original,{mode:0o600,flag:'wx'})
 await writeFile(file+'.framing-tmp',JSON.stringify(inventory,null,2),{mode:0o600});await rename(file+'.framing-tmp',file)
}
console.log(JSON.stringify({framed,skipped,dryRun:process.argv.includes('--dry-run'),sourcesChanged:false}))
