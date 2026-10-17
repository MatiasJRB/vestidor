import {existsSync} from 'node:fs'
import {writeFile,mkdir} from 'node:fs/promises'
import {randomBytes,scryptSync} from 'node:crypto'
import {resolve} from 'node:path'
const [major,minor]=process.versions.node.split('.').map(Number)
if(major<22||(major===22&&minor<18))throw new Error('Usá Node 22.18 o posterior.')
if(existsSync('.env.local')){console.log('Ya existe .env.local. No lo modifiqué. Ejecutá npm run doctor.');process.exit(0)}
const password=randomBytes(18).toString('base64url'),salt=randomBytes(16).toString('hex')
// Match server/auth.ts; never write the plaintext password to the environment file.
const hash=`scrypt:${salt}:${scryptSync(password,salt,64).toString('hex')}`
await mkdir('data',{recursive:true,mode:0o700})
await writeFile('.env.local',`AUTH_MODE=password\nADMIN_PASSWORD_HASH=${hash}\nDATA_DIR=${resolve('data')}\nPORT=4180\n`,{mode:0o600,flag:'wx'})
console.log('Vestidor local configurado. Iniciá con npm run dev.\nURL: http://127.0.0.1:4180\nContraseña inicial (guardala): '+password+'\nNo la subas a Git ni la incluyas en mensajes públicos.')
