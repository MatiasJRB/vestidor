# Publicar Vestidor en la web (opcional, perfil técnico)

**Esto no forma parte de la instalación local.** Para usarlo en tu computadora alcanza con `npm ci`, `npm run setup`, `npm run doctor` y `npm run dev`. No necesitás Vercel, InsForge, Google Cloud, Docker ni un editor específico.

Usá esta guía sólo si querés publicar una instancia HTTPS accesible desde otros dispositivos. Elegí **una** alternativa. No activar planes pagos ni crear cuentas o credenciales sin aprobación del dueño.

## Alternativa A: servidor Node persistente

Construí con `npm run build` y ejecutá `npm start` detrás de HTTPS. Variables de servidor:

- `ADMIN_PASSWORD_HASH`: lo genera el setup local; para cambiarlo usá `npm run password:hash` sin subir la contraseña al repo.
- `DATA_DIR`: directorio persistente y privado (por ejemplo `/data`).
- `PUBLIC_ORIGIN`: origen HTTPS exacto de tu instalación, sin `/` final.
- `PORT`: puerto interno (4180 por defecto).

Respaldá todo `DATA_DIR`. Una sola réplica: el backend de archivos no admite múltiples escritores. `Dockerfile` y `railway.json` son ayudas opcionales, no requisitos ni pasos del onboarding local.

### Límites operativos del servidor Node

- Una instalación, un propietario y una réplica. No hay registro público ni separación por tenants.
- HTTPS obligatorio en producción; el servidor emite cookie `__Host-placard` Secure/HttpOnly/SameSite=Lax.
- Protegé todo el servicio detrás del servidor incluido. Nunca publiques el volumen o dist por otro servidor/CDN sin autenticación.
- La contraseña se deriva con scrypt y sal aleatoria. Usá una frase larga y única. Rotarla exige cambiar ADMIN_PASSWORD_HASH y reiniciar; esto invalida todas las sesiones.
- Límite global de 20 intentos de login cada 15 minutos por proceso. Un ataque puede agotar ese cupo; para exposición amplia, sumá protección del proveedor/WAF. No es una solución de identidad empresarial ni tiene MFA.
- PUBLIC_ORIGIN tiene que coincidir exactamente con el origen del navegador. No usar comodines.
- El almacenamiento JSON se escribe con permisos restrictivos y rename atómico. Las decisiones se serializan en un proceso; no hay transacciones multiarchivo ni tolerancia a múltiples escritores. Respaldá antes de migraciones y actualizaciones, y probá restaurar en una instalación aparte.
- Google Photos Picker requiere configuración OAuth propia. No transportar tokens/credenciales de una instalación local a un host sin revisar audiencia y redirect.
- Los imports y la cola de generación persisten, pero identificar prendas y generar recortes requiere un trabajador externo/asistencia. Nunca marcar una tarea de generación completada sin revisar su imagen.
- La ruta de migración de archivos está desactivada por defecto. ALLOW_DATA_IMPORT=true requiere contraseña válida, origen exacto y rutas permitidas. Deshabilitarla al finalizar; verificar 404 a posteriori.
- `/healthz` sólo revela disponibilidad del proceso; no contiene inventario ni usuarios.

## Alternativa B: Vercel + Blob privado + Google login

La edición cloud usa Functions + Blob privado, no el filesystem local ni el Dockerfile. `state/wardrobe.json` es un snapshot CAS (ETag) del ropero y `state/auth.json` guarda sesiones/flujos OAuth/rate limit. Nunca compartas BLOB_READ_WRITE_TOKEN con frontend.

AUTH_MODE=google deshabilita acceso por contraseña. Sólo ALLOWED_GOOGLE_EMAIL, verificado criptográficamente y con email_verified=true, tiene acceso. PUBLIC_ORIGIN fija el callback canónico. Las otras aliases redirigen al origen canónico antes de empezar OAuth. No modificar una marca/cliente OAuth compartido para otro producto.

Las funciones pueden ejecutarse en procesos distintos: no usar sesiones, límites ni locks sólo en memoria. El módulo Blob usa lecturas consistentes y reintentos de escrituras condicionales. Las fotos requieren autenticación junto a su lectura de Blob; no colocar un CDN público delante de los datos.

Los scripts de sync respaldan snapshot remoto antes de reemplazarlo y conservan originales locales al optimizar. La UI cloud no tiene ruta de migración por HTTP habilitada. Importar datos sólo desde tooling local con el token privado del store.

### Pasos de configuración en Vercel

Este es el enfoque usado para la instancia del creador, no una cuenta compartida ni un servicio incluido para quienes clonen el repo. No requiere InsForge.

1. Creá tu propio proyecto Vercel y un Blob store con **access: private**. Revisá los cupos vigentes del plan que elijas; no se garantiza disponibilidad ni almacenamiento ilimitados.
2. Vinculá el store al proyecto; `BLOB_READ_WRITE_TOKEN` queda sólo como variable del servidor. Nunca lo publiques ni lo prefijes con `VITE_`.
3. En tu proyecto Google Cloud, creá un cliente OAuth **Web** con tu origen HTTPS y el callback exacto `https://tu-app.vercel.app/auth/google/callback`. Este login sólo necesita identidad básica, no Gmail ni Google Fotos.
4. En Vercel configurá `AUTH_MODE=google`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ALLOWED_GOOGLE_EMAIL` y `PUBLIC_ORIGIN` (el origen canónico sin barra final).
5. Desplegá este repo: `vercel.json` enruta APIs y fotos protegidas a la Function. La instancia arranca vacía; cargá tu ropa después de entrar.
6. Verificá que sólo pueda ingresar la cuenta permitida y que las fotos/API no sean accesibles sin sesión.

Si migrás una instalación local existente:

```sh
# No modifica los originales. La carpeta de salida no debe publicarse en Git.
node scripts/prepare-web-data.mjs ./data .deploy/web-data
node --env-file=/ruta/privada/vercel.env scripts/sync-blob.mjs .deploy/web-data
```

La primera sincronización se niega a pisar un ropero remoto existente. `--replace` reemplaza el snapshot: **no es merge ni sincronización**. Respaldar y reconciliar antes si hubo cambios online. La importación Google Fotos y el worker de generación no quedan instalados automáticamente al publicar en Vercel.
