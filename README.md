# Vestidor

Tu ropa, lista para volver a combinar. Una aplicación web de inventario personal: prendas, fotos de outfits, filtros, revisión asistida y vistas reconstruidas con IA claramente identificadas.

**React + TypeScript + Vite · Google login · Vercel Functions + Blob privado · edición local Node.js**

## Para quién es

Para quien quiere dejar de perder prendas en el fondo del placard y explorar combinaciones con lo que ya tiene. Esta edición es **single-owner**: un ropero por instalación, una contraseña de acceso. No es un servicio multiusuario ni una red social.

## Arrancar en local

Requiere Node.js 22.18 o posterior.

```sh
npm ci
cp .env.example .env.local
# Generá un hash de una contraseña larga; pegá el hash en ADMIN_PASSWORD_HASH de .env.local.
printf '%s' 'elegi-una-frase-larga-y-unica' | npm run --silent password:hash
npm run dev
```

Abrí `http://127.0.0.1:4180`. La contraseña no se guarda: sólo su derivación scrypt. La app se niega a iniciar si falta el hash. La sesión dura 12 horas y se invalida al reiniciar el proceso.

La primera ejecución crea un inventario vacío bajo `data/`. No se incluyen fotos, inventarios reales ni credenciales en este repositorio.

## Qué funciona

- Galería responsive con búsqueda, categorías, estilo, colores y ficha de cada prenda.
- Historial fotográfico de outfits y propuestas con prendas vinculadas.
- Revisión de candidatas: editar nombre, marca, color y categoría, confirmar, vincular, separar evidencias o descartar.
- Fotos de referencia separadas de imágenes reconstruidas con IA; vistas frente/dorso.
- Cola persistente de recortes: confirmar una prenda encola el trabajo.
- Integración opcional con Google Photos Picker, usando tu propio cliente OAuth.
- Login privado, cookies HttpOnly/SameSite, protección same-origin, límite de intentos y archivos protegidos.

**No promete**: detectar prendas automáticamente al importar, generar imágenes sin un worker/modelo configurado, ni leer toda Google Fotos sin selección humana. La revisión visual y la generación IA necesitan un proceso asistido externo. Los recortes son simulaciones, no prueba exacta del calce.

## Datos y respaldo

```text
data/
  private/   # inventory.json, outfits.json, suggestions.json, review-queue.json,
             # catalog-generation-queue.json, photos/, imports/
  public/    # items/ y outfits/: nombres internos, NO acceso público por HTTP
```

Todo el contenido de datos requiere login, incluidos `/items`, `/outfits` y `/media`. En la edición cloud, el HTML y JS/CSS genéricos son públicos, pero no contienen datos personales; las APIs y las fotos verifican la sesión en el servidor.

Respaldá **todo `DATA_DIR`**, no sólo el código. La edición usa archivos JSON con escrituras atómicas y serializa las decisiones de revisión: desplegá **una sola réplica**. No uses un filesystem efímero ni dos procesos escribiendo el mismo ropero.

## Publicar tu instancia

Construí con `npm run build` y ejecutá `npm start` detrás de HTTPS. Variables:

- `ADMIN_PASSWORD_HASH`: hash scrypt obtenido con el script.
- `DATA_DIR`: directorio persistente (por ejemplo `/data`).
- `PUBLIC_ORIGIN`: origen HTTPS exacto, sin `/` final.
- `PORT`: puerto HTTP interno (por defecto 4180).

El `Dockerfile` y `railway.json` permiten desplegar en un servicio Node con volumen en `/data`; no requieren Docker en tu computadora. Nunca publiques `data/`, `.env.local`, tokens OAuth ni respaldos. El dominio HTTPS no vuelve privado un archivo: el servidor aplica autenticación también a las imágenes.

Para una migración inicial controlada, `ALLOW_DATA_IMPORT=true` habilita `POST /api/admin/import-file` sólo a sesiones autenticadas y same-origin. Acepta rutas limitadas en `X-File-Path` y hasta 12 MiB por archivo. Deshabilitalo al terminar. Nunca debe recibir archivos de terceros. `docs/deployment.md` detalla los límites.

## Edición gratuita en Vercel

El despliegue cloud usa **Vercel Hobby + un Blob store privado**. No necesita InsForge, Railway ni un servidor permanente. Los planes gratuitos tienen cupos y pueden suspender operaciones al superarlos; no se promete disponibilidad ilimitada ni generación IA gratuita.

1. Creá tu proyecto en Vercel Hobby y un Blob store con **access: private** (no public).
2. Vinculá el store al proyecto y guardá BLOB_READ_WRITE_TOKEN sólo en variables de servidor.
3. Creá un cliente OAuth Web en Google Cloud, con origen de tu app y redirect exacto `https://tu-app.vercel.app/auth/google/callback`.
4. Configurá AUTH_MODE=google, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, PUBLIC_ORIGIN y ALLOWED_GOOGLE_EMAIL en Vercel. Sólo la dirección autorizada puede entrar; se exige email verificado.
5. Desplegá. `vercel.json` envía APIs y medios privados a una Function que verifica la sesión antes de leer Blob.
6. Prepará y sincronizá tu inventario local con los scripts de abajo. Revisá los datos y respaldos antes de reemplazar una instancia existente.

El login usa OAuth code flow con PKCE, estado vinculado al navegador, nonce y verificación criptográfica de ID tokens de Google. No solicita Gmail ni Google Fotos y no conserva tokens de Google. Las sesiones de Vestidor se guardan en Blob privado y se revocan al salir. Los cambios de revisión guardan inventario, revisión y cola de generación en un único snapshot con ETag/compare-and-swap para evitar sobrescrituras concurrentes.

```sh
# Fotos optimizadas para web; nunca modifica el origen.
node scripts/prepare-web-data.mjs ./data .deploy/web-data
# Con el token privado en un archivo fuera del repo:
node --env-file=/ruta/privada/vercel.env scripts/sync-blob.mjs .deploy/web-data
```

La primera sincronización falla si ya existe un ropero remoto. `--replace` requiere revisar los cambios remotos; guarda un respaldo privado local y utiliza el ETag para no pisar una actualización concurrente. La importación Google Fotos y la generación asistida se realizan desde la instalación local; el despliegue cloud no muestra esos procesos como disponibles si no están configurados. Si revisaste prendas en la web, reconciliá primero esas decisiones con tu fuente local antes de otra sincronización.

## Google Fotos (opcional)

Habilitá Google Photos Picker API y creá tus propias credenciales OAuth. Para una instancia alojada, usá cliente **Web** con redirect HTTPS autorizado. Para local podés usar cliente Desktop y redirect loopback. Guardá la credencial fuera del repo y configurá:

```text
GOOGLE_PHOTOS_OAUTH_FILE=/ruta/privada/google-client.json
GOOGLE_PHOTOS_REDIRECT_URI=https://tu-instancia.example/
```

Los tokens van al volumen privado, nunca al navegador. Cada importación usa una selección explícita del Picker: no da acceso general a la biblioteca. Si no configurás OAuth, el resto del ropero funciona igual.

## Verificación

```sh
npm run check
npm test
npm run build
```

## Contribuir

Issues y pull requests son bienvenidos. Para ejemplos o capturas, usá datos ficticios y no subas fotos de terceros sin permiso. Reportá problemas de seguridad por el canal privado indicado en `SECURITY.md`.

## Licencia

MIT. El código es reutilizable; la licencia no concede derechos sobre fotos personales ni marcas de prendas/calzado de otras personas.
