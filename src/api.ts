export async function api<T>(path:string, options:RequestInit={}) : Promise<T> {
 const response=await fetch(path,{...options,signal:options.signal??AbortSignal.timeout(25000),headers:{'Content-Type':'application/json',...options.headers}})
 if(response.status===401){window.location.assign('/login');throw new Error('Tu sesión venció. Volvé a entrar.')}
 const body=await response.json().catch(()=>null)
 if(!response.ok)throw new Error(typeof body?.error==='string'?body.error:body?.error?.message??'No pude guardar. Probá de nuevo.')
 return body as T
}
