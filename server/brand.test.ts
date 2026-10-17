import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {renderLogin} from './login.ts'
function luminance(hex:string){return hex.match(/[a-f0-9]{2}/gi)!.map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0)}
function contrast(a:string,b:string){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)}
test('portfolio palette is applied to app startup and login with readable semantic states',()=>{
 const css=readFileSync('src/brand.css','utf8'),main=readFileSync('src/main.tsx','utf8')
 for(const color of ['#101419','#171d23','#f1eee7','#d7a05b','#79cbb0']){assert(css.includes(color));assert(renderLogin({google:true,configured:true}).includes(color))}
 assert(main.indexOf("'./brand.css'")>main.indexOf("'./styles.css'"))
 for(const [fg,bg]of [['#f1eee7','#101419'],['#a5abb0','#171d23'],['#101419','#d7a05b'],['#79cbb0','#19352f'],['#e07c72','#382326']])assert(contrast(fg,bg)>=4.5,`${fg}/${bg}`)
 assert(contrast('#657681','#171d23')>=3)
 assert.match(readFileSync('index.html','utf8'),/name="theme-color" content="#101419"/)
})
