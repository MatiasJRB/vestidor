# Vestidor

Tu ropa, lista para volver a combinar. Una aplicación web de inventario personal: prendas, fotos de outfits, filtros, revisión asistida y vistas reconstruidas con IA claramente identificadas.

**React + TypeScript + Vite · servidor Node.js · almacenamiento persistente · acceso privado**

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

Todo el contenido de datos requiere login, incluidos `/items`, `/outfits`, `/media` y los archivos JS/CSS de la app. Sólo login y salud están disponibles sin sesión. El bundle de frontend no contiene datos personales.

Respaldá **todo `DATA_DIR`**, no sólo el código. La edición usa archivos JSON con escrituras atómicas y serializa las decisiones de revisión: desplegá **una sola réplica**. No uses un filesystem efímero ni dos procesos escribiendo el mismo ropero.

## Publicar tu instancia

Construí con `npm run build` y ejecutá `npm start` detrás de HTTPS. Variables:

- `ADMIN_PASSWORD_HASH`: hash scrypt obtenido con el script.
- `DATA_DIR`: directorio persistente (por ejemplo `/data`).
- `PUBLIC_ORIGIN`: origen HTTPS exacto, sin `/` final.
- `PORT`: puerto HTTP interno (por defecto 4180).

El `Dockerfile` y `railway.json` permiten desplegar en un servicio Node con volumen en `/data`; no requieren Docker en tu computadora. Nunca publiques `data/`, `.env.local`, tokens OAuth ni respaldos. El dominio HTTPS no vuelve privado un archivo: el servidor aplica autenticación también a las imágenes.

Para una migración inicial controlada, `ALLOW_DATA_IMPORT=true` habilita `POST /api/admin/import-file` sólo a sesiones autenticadas y same-origin. Acepta rutas limitadas en `X-File-Path` y hasta 12 MiB por archivo. Deshabilitalo al terminar. Nunca debe recibir archivos de terceros. `docs/deployment.md` detalla los límites.

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
