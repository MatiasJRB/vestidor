import {existsSync,readFileSync} from 'node:fs'
const [major,minor]=process.versions.node.split('.').map(Number)
let failures=0
function check(ok,label){console.log(`${ok?'OK':'FALTA'} · ${label}`);if(!ok)failures++}
check(major>22||(major===22&&minor>=18),'Node 22.18+')
check(existsSync('node_modules/react'),'Dependencias: npm ci')
check(existsSync('.env.local'),'Configuración local: npm run setup')
if(existsSync('.env.local')){
 const env=readFileSync('.env.local','utf8')
 check(/^ADMIN_PASSWORD_HASH=scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/m.test(env)||/^AUTH_MODE=google$/m.test(env),'Acceso configurado (valores ocultos)')
}
console.log('Google Fotos y generación IA son opcionales. No hacen falta para agregar tu ropa.')
process.exitCode=failures?1:0
