# Gate de integración y despliegue — Catálogo público

## Estado comprobado

- 16/16 pruebas de staging aprobadas en GitHub Actions, ejecución 42849632032.
- Se probó el parche sobre una copia literal de la ruta `GET /api/listings`, **no** sobre el backend completo en ejecución.
- El backend de AppDeploy sigue fuera de GitHub `main`; la copia de staging es parcial. La ruta principal `backend/index.ts` tiene aproximadamente 3.940 líneas y depende de módulos no recuperados.
- La corrección `appdeploy_staging/patches/no-false-zero-feed.patch` **no está desplegada**.

## Riesgos pendientes que impiden declarar producción lista

1. **Error 503 visible:** evita el falso cero, pero el usuario aún puede quedar sin ofertas cuando no exista manifiesto ni página staged. Requiere recuperación de último manifiesto válido o recuperación del puntero, no únicamente cambiar la respuesta.
2. **Integridad 228→227:** la protección preserva el último manifiesto, pero la causa de exclusión de la oferta externa debe resolverse con datos de fuente; no desactivar el bloqueo.
3. **Paginación staged:** `readStagedPublicFeedPage` devuelve solo la primera página y `hasMore:false`, aunque existan páginas adicionales. No declarar totales definitivos durante reconstrucción.
4. **Prueba real no realizada:** la API de producción no pudo verificarse desde el entorno de ejecución disponible; el DNS del dominio AppDeploy no resolvió en ese entorno.
5. **Seguridad de sincronización:** no copiar archivos de credenciales, secretos o configuraciones de acceso al repositorio. No aplicar parches mediante despliegue sin autorización.

## Criterios de aceptación antes de desplegar

- Confirmar que la lectura de manifiesto, cursor y páginas devuelve ofertas verificadas sin filtraciones privadas.
- Reproducir y resolver el caso de la oferta externa activa que provoca regresión.
- Probar reconstrucción con 0, 1 y varias páginas y último manifiesto bueno.
- Compilar y ejecutar el backend integrado con sus dependencias reales.
- Comprobar catálogo público y conteos antes/después en una ventana de prueba autorizada.

**Decisión:** PR #35 continúa en preparación, sin merge ni despliegue. No confundir el éxito de pruebas aisladas con disponibilidad pública.
