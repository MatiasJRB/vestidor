import { hashPassword } from '../server/auth.ts'
let input = ''
for await (const chunk of process.stdin) input += chunk
const password = input.trimEnd()
if (password.length < 16) throw new Error('Usá una contraseña de al menos 16 caracteres')
console.log(hashPassword(password))
