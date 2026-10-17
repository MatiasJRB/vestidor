import { chmod, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

const sourceArgument = process.argv[2]
if (!sourceArgument) {
  console.error('Uso: npm run setup:google-photos -- /ruta/al/client_secret.json')
  process.exit(1)
}

const source = resolve(sourceArgument.replace(/^~\//, `${homedir()}/`))
const payload = JSON.parse(await readFile(source, 'utf8'))
const client = payload.installed ?? payload.web
if (!client?.client_id || !client?.client_secret) {
  console.error('El archivo no contiene un cliente OAuth instalado o web válido.')
  process.exit(1)
}

const target = join(homedir(), '.config/vestidor/google-photos-client.json')
await mkdir(dirname(target), { recursive: true })
await copyFile(source, target)
await chmod(target, 0o600)
const previous = await readFile('.env.local', 'utf8').catch(error => {
  if (error.code === 'ENOENT') return ''
  throw error
})
const preserved = previous.split('\n').filter(line => !/^GOOGLE_PHOTOS_(OAUTH_FILE|REDIRECT_URI)=/.test(line))
await writeFile('.env.local', [...preserved, `GOOGLE_PHOTOS_OAUTH_FILE=${target}`, 'GOOGLE_PHOTOS_REDIRECT_URI=http://127.0.0.1:4180/', ''].join('\n'), { mode: 0o600 })

console.log('Google Fotos quedó configurado localmente.')
console.log(`Credencial protegida en: ${target}`)
console.log('Próximo paso: npm run dev y presionar “Conectar Google Fotos”.')
