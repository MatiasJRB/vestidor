# Despliegue y límites operativos

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
