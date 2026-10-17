import test from 'node:test'
import assert from 'node:assert/strict'
import { isConditionalConflict } from './blobStore.ts'
test('Blob conditional operation conflicts are retryable, unrelated errors are not',()=>{
 assert(isConditionalConflict(new Error('Vercel Blob: The conditional request cannot succeed due to a conflicting operation against this resource.')))
 assert(isConditionalConflict(new Error('Blob already exists')))
 assert(isConditionalConflict(new Error('Precondition failed')))
 assert(!isConditionalConflict(new Error('Invalid token')))
 assert(!isConditionalConflict(new Error('Network unavailable')))
})
