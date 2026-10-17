import test from 'node:test'
import assert from 'node:assert/strict'
import { hashPassword, verifyPassword, createAuth } from './auth.ts'
test('password hashing and invalid encodings fail closed', () => {
 const hash=hashPassword('correct horse battery staple');assert(verifyPassword('correct horse battery staple',hash));assert(!verifyPassword('wrong',hash));assert(!verifyPassword('x','bad'));assert.throws(()=>createAuth({passwordHash:'',secure:true}))
})
