import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises'
import {join,resolve} from 'node:path'
import {tmpdir} from 'node:os'
import {spawnSync} from 'node:child_process'
test('optional Google Photos setup preserves existing login and data configuration',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'vestidor-setup-'))
 try{
  await writeFile(join(dir,'client.json'),JSON.stringify({installed:{client_id:'test-client',client_secret:'fixture-not-real'}}))
  await writeFile(join(dir,'.env.local'),'ADMIN_PASSWORD_HASH=keep-test-hash\nDATA_DIR=/data/custom\nGOOGLE_PHOTOS_OAUTH_FILE=old\n')
  const result=spawnSync(process.execPath,[resolve('scripts/setup-google-photos.mjs'),join(dir,'client.json')],{cwd:dir,env:{...process.env,HOME:dir},encoding:'utf8'})
  assert.equal(result.status,0,result.stderr)
  const config=await readFile(join(dir,'.env.local'),'utf8');assert.match(config,/ADMIN_PASSWORD_HASH=keep-test-hash/);assert.match(config,/DATA_DIR=\/data\/custom/);assert(!config.includes('=old'));assert.equal(config.split('GOOGLE_PHOTOS_OAUTH_FILE=').length,2)
 }finally{await rm(dir,{recursive:true,force:true})}
})
