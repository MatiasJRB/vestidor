import { readdir, mkdir, readFile, writeFile, stat } from 'node:fs/promises'
import { resolve, join, dirname, extname } from 'node:path'
import sharp from 'sharp'
const source = resolve(process.argv[2] ?? 'data'), target = resolve(process.argv[3] ?? '.deploy/web-data')
if (source === target || target.startsWith(source + '/')) throw new Error('Use a separate output directory')
let before = 0, after = 0, count = 0
async function walk(relative = '') {
 for (const item of await readdir(join(source, relative), { withFileTypes: true })) {
  const path = join(relative, item.name)
  if (item.isDirectory()) { await walk(path); continue }
  if (!item.isFile()) continue
  if (!/^(private\/(photos|imports)\/|public\/(items|outfits)\/)/.test(path) && !/^private\/(inventory|outfits|suggestions|review-queue|catalog-generation-queue)\.json$/.test(path)) continue
  const input = join(source, path), output = join(target, path), ext = extname(path).toLowerCase()
  await mkdir(dirname(output), { recursive: true, mode: 0o700 })
  const bytes = await readFile(input);before += bytes.length
  let result = bytes
  if (['.jpg','.jpeg','.webp','.png'].includes(ext)) {
   let image = sharp(bytes).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
   if (ext === '.jpg' || ext === '.jpeg') image=image.jpeg({ quality: 79, mozjpeg: true })
   if (ext === '.webp') image=image.webp({ quality: 82 })
   if (ext === '.png') image=image.png({ compressionLevel: 9, palette: false })
   result=await image.toBuffer()
  }
  await writeFile(output, result, { mode: 0o600 });after += result.length;count++
 }
}
await walk();console.log(JSON.stringify({files:count,beforeBytes:before,afterBytes:after,originalsUnchanged:true}))
