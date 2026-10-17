# Vestidor — guía para tu agente

Si la persona dice **«quiero usar Vestidor»**, ayudala a tener SU ropero funcionando. No hace falta una API IA paga.

## Instalación mínima
1. Leé README.md y PRODUCT.md. Comprobá Node >=22.18 y el checkout correcto.
2. Ejecutá `npm ci`, `npm run setup` y `npm run doctor`. Setup es idempotente: no pisa `.env.local`. Conservá la contraseña inicial sólo en un canal privado del dueño; nunca en commits, screenshots públicas ni logs de CI.
3. Iniciá `npm run dev` con el supervisor disponible y abrí http://127.0.0.1:4180. Verificá la pantalla, no sólo el proceso.
4. Guiá una primera carga con **Agregar prenda**. La foto real alcanza. Verificá que siga después de recargar.
5. Para abrir desde el celular fuera de localhost, ofrecé una instancia HTTPS privada. No expongas un servidor local a Internet sin autorización. Consultá docs/deployment.md. No crees cuentas, cobros ni credenciales sin aprobación.

## Ayudar con la ropa
- Usá datos de SU instalación, no ejemplos ni supuestos sobre posesión. Antes de recomendar, revisá todo el inventario relevante, no sólo lo último conversado.
- Vinculá cada sugerencia con IDs/fotos reales. No inventes zapatillas, accesorios, marcas ni prendas; diferenciá sugerencia de compra.
- Fotos dudosas: mostrarlas, editar nombre/categoría/colores y pedir confirmación. Nunca fusionar dos prendas sólo por parecido. Separá evidencias si son distintas.
- Identidad visual: no reemplaces la cara del dueño por la de otra persona en las fotos.
- IA catálogo: opcional. Leé docs/agent-guide.md; no prometas que una cola se procesa sola. Frente y espalda son vistas distintas; no pongas una estampa trasera adelante.
- Borrar outfits usa papelera reversible. No borra prendas ni fuentes.

## Seguridad y límites
- Un dueño por instalación. No convertir a multiusuario sin diseñar aislamiento.
- Fotos, tokens, inventario y backups son privados: `data/` y `.env*` no van al repo. No publicar capturas reales en README.
- Google login pide identidad; Google Fotos es un permiso separado y selección explícita.
- No volcar un snapshot local sobre cloud: puede borrar cambios más nuevos. Respaldar y comparar primero, pedir autorización si hay conflicto.
- No hardcodear cuentas del creador ni usar sus proyectos cloud para un nuevo usuario.

## Desarrollo
`npm test` y `npm run build`. QA con datos ficticios; probar móvil 390px y desktop, carga, revisión, recuperación y acceso anónimo. Para almacenamiento cloud, conservar CAS con ETag fuerte: no aceptar el débil de una respuesta comprimida. Guardados deben ser reintentables sin duplicados.
