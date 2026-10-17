import test from 'node:test'
import assert from 'node:assert/strict'
import {makeFlow,matchesState,validateIdentity} from './googleLogin.ts'
test('Google requires same-browser state, verified owner email and nonce',()=>{
 const {state,flow,challenge}=makeFlow();assert(matchesState(state,state));assert(!matchesState(state,'other'));assert(!matchesState(state,'a'.repeat(64)));assert.equal(challenge.length,43)
 const id={sub:'personal-google-sub',email:'owner@example.com',email_verified:true,nonce:flow.nonce}
 assert.equal(validateIdentity(id,flow.nonce,'owner@example.com').email,'owner@example.com')
 for(const bad of [{...id,email:'stranger@example.com'},{...id,email_verified:false},{...id,nonce:'different'},{...id,sub:undefined}])assert.throws(()=>validateIdentity(bad,flow.nonce,'owner@example.com'))
})
