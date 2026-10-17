# Vestidor

![Vestidor: de una foto real a tu ropero](docs/assets/flow.svg)

## Toda tu ropa, en un lugar. Más ideas para usarla.

Ese pantalón que siempre combinás igual. La remera que te olvidás que tenés. Las fotos de outfits que quedan perdidas en la galería. **Vestidor los junta en tu propio ropero digital.**

Sacá una foto desde el celular, poné nombre, categoría y colores, y guardá. No necesitás recortar nada ni pagar una API de IA para empezar.

[Empezar con mi agente](#decile-a-tu-agente-quiero-usar-vestidor) · [Instalar yo](#arrancar-en-local) · [Opcional: publicar en la web](docs/deployment.md) · [Cómo funciona](docs/agent-guide.md)

### La experiencia

- **Tu ropa real.** Cámara o galería; la foto ya sirve como imagen de la prenda.
- **Encontrala de un vistazo.** Categorías, búsqueda, muestras de color y ejemplos visuales de cada estilo tomados de tu propio ropero.
- **Confirmá antes de sumar.** Editá propuestas, vinculá prendas repetidas y separá fotos que no son de la misma pieza.
- **Volvé a tus outfits.** Dos colecciones tipo Pinterest: **Generados por tu agente** y **Que usaste**, con imágenes sin recortar y prendas vinculadas. Borrá lo que no querés; la papelera permite recuperarlo.
- **Mejorá las imágenes después.** Una prenda confirmada puede esperar su imagen IA sin desaparecer del inventario. Frente, espalda y foto original se conservan separados.
- **Tu instancia es privada.** Login, fotos protegidas y datos fuera del código público. Un dueño por instalación; no es una red social.

**Para empezar sólo necesitás Node.js 22.18+ y este repositorio.** No hace falta un editor específico, una cuenta en Vercel o InsForge, Docker, login con Google ni una API de IA. Los datos quedan en tu computadora.

### Decile a tu agente: «quiero usar Vestidor»

Cloná el repositorio y abrilo con tu agente:

```sh
git clone https://github.com/MatiasJRB/vestidor.git
cd vestidor
```

> Quiero usar Vestidor en local, en mi computadora. Leé AGENTS.md, instalalo sin configurar hosting ni crear cuentas y ayudame a cargar mi primera prenda.

[AGENTS.md](AGENTS.md) le da un recorrido verificable: instalar, preparar acceso, comprobar el entorno, abrir la app y acompañar tu primera carga. Después puede ayudarte a clasificar y proponer outfits usando **lo que realmente tenés**. El agente es el tuyo (Codex, Claude Code, etc.), no un chat IA incluido ni un servicio gratuito de generación ilimitada.

### Arrancar en local

Node.js **22.18+**:

```sh
npm ci
npm run setup
npm run doctor
npm run dev
```

Abrí `http://127.0.0.1:4180`. Setup muestra una contraseña inicial y guarda sólo su hash en `.env.local`; si ya existe configuración, no la pisa. Los datos arrancan vacíos en `data/`. No se incluyen fotos ni credenciales del creador.

**Alcance local:** abrís la app desde el navegador de esa computadora. No es una instalación con doble clic: necesitás Node y ejecutar los comandos, o pedirle a tu agente que lo haga. El `127.0.0.1` del teléfono apunta al propio teléfono, no a tu computadora. El acceso desde otros dispositivos o fuera de casa es una configuración adicional, no un requisito para empezar.

### ¿Y la IA? ¿Y Google Fotos?

La carga, los filtros y el inventario **no requieren IA**. Generar imágenes es opcional y necesita una herramienta de tu agente, un modelo local o una API (con sus propios costos). Marcar «pendiente» no enciende un servicio automático ni genera cobros.

Google Photos Picker funciona en la instalación local con tu credencial y selección explícita. Ni Google Fotos ni el login Google son necesarios para usar el ropero local. [Flujos y límites reales](docs/agent-guide.md).

### Tus datos quedan con vos

La primera ejecución crea un ropero vacío en `data/`. Las fotos, prendas, outfits y colas se guardan ahí, no en una cuenta del creador ni en un servicio externo. Conservá esa carpeta al actualizar y respaldala completa. No la subas a GitHub.

La contraseña local protege la app y las imágenes; sólo se guarda su hash. La sesión se cierra al reiniciar el servidor. El repositorio público no incluye inventarios, fotos ni credenciales personales.

### Paso opcional para perfiles técnicos: publicarlo en la web

**Podés saltearte este paso y usar Vestidor enteramente en local.** Si después querés un enlace accesible desde otros dispositivos, la [guía técnica de despliegue](docs/deployment.md) explica dos alternativas:

- Un servidor Node con almacenamiento persistente y HTTPS.
- Vercel Functions + Blob **privado**, con login Google: el enfoque usado para la instancia del creador.

No hay que configurar ambas, ni usar InsForge. La publicación requiere tus propias cuentas, credenciales y revisión de cupos/costos. El agente no debe activar nada de esto si sólo le pediste instalar en local.

### Para quienes construyen

React · TypeScript · Vite · Node.js. Archivos locales para empezar; backend cloud opcional. Licencia MIT. [Guía del agente y límites reales](docs/agent-guide.md).

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
