import test from 'node:test'
import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {mkdtemp,readFile,rm,stat} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {verifyPassword} from './auth.ts'
test('setup creates a valid private local login, then preserves existing configuration',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'vestidor-setup-')),script=resolve('scripts/setup.mjs')
 try{
 const output=execFileSync(process.execPath,[script],{cwd:dir,encoding:'utf8'}),password=output.match(/guardala\): (\S+)/)![1]
 const env=await readFile(join(dir,'.env.local'),'utf8'),hash=env.match(/ADMIN_PASSWORD_HASH=(.*)/)![1]
 assert(verifyPassword(password,hash));assert(!env.includes(password));assert.equal((await stat(join(dir,'.env.local'))).mode&0o777,0o600)
 execFileSync(process.execPath,[script],{cwd:dir});assert.equal(await readFile(join(dir,'.env.local'),'utf8'),env)
 }finally{await rm(dir,{recursive:true,force:true})}
})
