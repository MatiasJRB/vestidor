import { useRef, useState } from 'react'
import { Camera, ImageSquare, SpinnerGap, X } from '@phosphor-icons/react'
import { api } from './api'
import { categoryLabels, type Category } from './data'
import { ColorPicker, colorPalette } from './ColorPicker'

async function preparePhoto(file:File){
 if(file.size>30*1024*1024)throw new Error('Esa foto es muy grande. Elegí otra de menos de 30 MB.')
 const url=URL.createObjectURL(file)
 try{
  const image=new Image();image.src=url;await image.decode()
  const scale=Math.min(1,1600/Math.max(image.width,image.height)),canvas=document.createElement('canvas')
  canvas.width=Math.round(image.width*scale);canvas.height=Math.round(image.height*scale)
  const context=canvas.getContext('2d');if(!context)throw new Error('No pude preparar la foto.')
  context.fillStyle='#ffffff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height)
  const data=canvas.toDataURL('image/jpeg',.8)
  if(data.length>3_000_000)throw new Error('La foto sigue muy pesada. Probá una más chica.')
  return data
 }catch(e){throw new Error(e instanceof Error&&e.message.includes('foto')?e.message:'No pude abrir la imagen. Si es HEIC, elegí JPG desde tu galería.')}
 finally{URL.revokeObjectURL(url)}
}
export function AddGarment({onAdded,onClose}:{onAdded:()=>Promise<void>;onClose:()=>void}){
 const [requestId]=useState(()=>crypto.randomUUID()),[photo,setPhoto]=useState(''),[name,setName]=useState(''),[category,setCategory]=useState<Category>('top'),[brand,setBrand]=useState(''),[colors,setColors]=useState<string[]>([]),[queueImage,setQueueImage]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[preparing,setPreparing]=useState(false),[saved,setSaved]=useState(false)
 const lock=useRef(false)
 async function choose(file?:File){if(!file)return;setError('');setPreparing(true);try{setPhoto(await preparePhoto(file))}catch(e){setError((e as Error).message)}finally{setPreparing(false)}}
 async function save(event:React.FormEvent){event.preventDefault();if(lock.current)return;lock.current=true;setBusy(true);setError('')
 try{await api('/api/wardrobe-items',{method:'POST',body:JSON.stringify({requestId,name,category,brand,colors,photo,queueImage})});setSaved(true);await onAdded().catch(()=>{});}
 catch(e){setError((e as Error).name==='TimeoutError'?'La respuesta tardó demasiado. Reintentá: esta carga no se duplicará.':(e as Error).message)}finally{setBusy(false);lock.current=false}}
 return <section className="add-garment" aria-labelledby="add-title"><div className="section-title"><h2 id="add-title">{saved?'Ya está en tu Vestidor':'Agregar una prenda'}</h2><button type="button" className="icon-action" onClick={onClose} disabled={busy} aria-label="Cerrar carga"><X/></button></div>
 {saved?<><p>Guardamos la foto real y los datos.{queueImage?' La imagen IA quedó pendiente; requiere que tu agente procese la cola.':' No necesitás una imagen IA para usarla.'}</p><button className="primary-action" onClick={onClose}>Ver mi ropa</button></>:<form onSubmit={save}>
 <div className="upload-layout"><div><div className="photo-preview">{photo?<img src={photo} alt="Foto de la prenda que vas a agregar"/>:<ImageSquare size={56}/>}</div><div className="photo-inputs"><label className="file-button"><Camera/> Sacar foto<input type="file" accept="image/*" capture="environment" disabled={busy||preparing} onChange={e=>void choose(e.target.files?.[0])}/></label><label className="file-button"><ImageSquare/> Elegir foto<input type="file" accept="image/*" disabled={busy||preparing} onChange={e=>void choose(e.target.files?.[0])}/></label></div><p className="help-text">Una prenda por foto, con buena luz. La optimizamos antes de subirla. {preparing&&'Preparando foto…'}</p></div>
 <div className="garment-fields"><label>Nombre<input autoComplete="off" required minLength={2} maxLength={80} value={name} onChange={e=>setName(e.target.value)} disabled={busy}/></label><label>Categoría<select value={category} onChange={e=>setCategory(e.target.value as Category)} disabled={busy}>{Object.entries(categoryLabels).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label><label>Marca <span>(opcional)</span><input maxLength={60} value={brand} onChange={e=>setBrand(e.target.value)} disabled={busy}/></label><fieldset disabled={busy}><legend>Colores</legend><ColorPicker values={Object.keys(colorPalette)} selected={colors} onChange={setColors} multiple/></fieldset><label className="queue-option"><input type="checkbox" checked={queueImage} onChange={e=>setQueueImage(e.target.checked)} disabled={busy}/> Dejar pendiente una imagen de catálogo IA</label><p className="help-text">No se genera automáticamente ni se cobra nada. Tu agente puede procesarla después; mientras tanto usás esta foto.</p></div></div>
 {error&&<p role="alert" className="form-error">{error}</p>}<button className="primary-action" disabled={!photo||!name.trim()||!colors.length||busy||preparing} type="submit">{busy?<><SpinnerGap className="spin"/> Guardando…</>:'Agregar al Vestidor'}</button></form>}
 </section>
}
