# Un agente que conoce tu Vestidor

Copiá esto en Codex, Claude Code u otro agente con acceso a tu repositorio:

> Quiero usar Vestidor en local, en mi computadora. Leé AGENTS.md, instalalo sin configurar hosting ni crear cuentas. Ayudame a cargar mi primera prenda y verificá que quedó guardada.

El agente instala dependencias, prepara el acceso local, inicia la app y guía la primera carga. Ahí termina el setup básico; publicar en Internet es otro pedido, opcional. **No es un chat integrado en la web**: es el agente que ya usás. Las autorizaciones de Google y las decisiones sobre cuentas/publicación siguen siendo tuyas.

## De una foto a una prenda

1. Abrí **Agregar prenda**, sacá una foto o elegila de la galería.
2. Completá nombre, categoría y colores; marca opcional.
3. Guardá. Ya podés encontrarla en el ropero usando la foto real.
4. Opcional: marcá «Dejar pendiente una imagen de catálogo IA». No llama un servicio ni factura nada. La cola requiere un agente/worker externo.

La imagen se reduce a 1600 px, se valida en el servidor y se vuelve a codificar sin metadatos antes de guardarla. JPG/PNG/WebP; fotos HEIC dependen del navegador y pueden requerir exportar a JPG. No hay carga offline: conservá el formulario abierto si falla la conexión.

## Revisar e imágenes pendientes

**Revisar** reúne propuestas aún no confirmadas. Confirmar, vincular o descartar resuelve la propuesta. **Prendas → Sin imagen de catálogo** muestra las prendas ya confirmadas que todavía usan fotos reales, incluidas las que esperan generación.

En local, `npm run catalog:queue` lista trabajos y `npm run catalog:claim` los reclama. `scripts/catalog-image-queue.mjs` también permite completar/fallar trabajos; consultá su ayuda/código antes de escribir resultados. Usá un modelo disponible autorizado por el dueño. No hay API paga obligatoria: el agente puede tener su herramienta de imágenes o usar un modelo local. No se instala ni descarga un modelo grande silenciosamente.

En cloud la cola se conserva privada junto al inventario, pero **no hay un worker IA desplegado ni sincronización local↔cloud automática**. No uses `sync-blob --replace` como sincronización: reemplaza el snapshot. Hasta tener un flujo de merge/exportación aprobado, dejá la imagen pendiente y usá la foto real. No prometas finalización automática.

Cada recorte debe conservar color, corte, logos y lado de la prenda; mostrarlo como IA y pedir revisión humana. Nunca borrar la fuente. Una composición IA no prueba calce ni talles.

## Google Fotos

En **Outfits** está el apartado de importación. En local, configurá tu propio cliente con `npm run setup:google-photos`; el Picker permite elegir fotos puntuales. Importar fotos no detecta prendas por sí solo: el agente analiza las seleccionadas, prepara propuestas y la persona confirma.

En Vercel ese conector sigue siendo local: el cartel lo explica y no ofrece un botón que no funciona. Como alternativa desde el celular, elegí las fotos descargadas/guardadas en tu galería con **Agregar prenda**. Iniciar sesión con Google no otorga permisos de Fotos.

## Guardar y explorar outfits

En **Outfits** hay dos colecciones separadas: **Generados por tu agente** (todas las propuestas, no sólo la última) y **Que usaste** (fotos reales). Ambas conservan la proporción de las fotos en una galería de columnas, con papelera y restauración independiente. Las prendas también usan columnas de altura variable: cada foto se ve completa, sin forzar todas al mismo recorte.

En local las propuestas van en `DATA_DIR/private/suggestions.json`, objeto `suggestions` con `id`, `for_date` (YYYY-MM-DD), `occasion`, `status: suggested`, `image` (ruta relativa `outfits/archivo.jpg`), `image_kind: ai_composite_from_inventory`, `item_ids` reales, `styling`, `reason` y `weather_assumption`. La imagen va en `DATA_DIR/public/outfits/`; aunque el directorio se llame public, requiere login por HTTP. No generes una recomendación de clima como si estuviera verificada. Conservá los datos existentes y `archived_at` si ya tiene valor. Respaldá antes de editar y recargá la página para ver propuestas nuevas. En cloud no hay todavía un endpoint de publicación de propuestas por agente: no sobreescribas el snapshot remoto para agregar una.

### Márgenes de imágenes de catálogo

`npm run catalog:frame -- --dry-run` analiza el fondo sobrante de imágenes de catálogo locales. Sin `--dry-run`, respalda el inventario y guarda `gallery_frame`: sólo coordenadas para encuadrar la tarjeta, **no modifica la imagen original**. La ficha conserva la imagen completa. Se agrega un margen de seguridad y se omiten detecciones ambiguas. El comando de completar una generación también calcula este encuadre. No aplicar a fotos personales/de outfits: sólo al catálogo de prendas aisladas. Revisar visualmente el resultado, especialmente prendas claras sobre fondo claro. La migración cloud requiere una actualización con respaldo y CAS; no usar reemplazo completo para eso.
