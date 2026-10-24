# Campañas propias — implementación pendiente de despliegue

Este directorio contiene un snapshot frontend del laboratorio 1792632646829 y cambios propuestos. No es otra app ni una migración. No contiene credenciales nuevas ni datos reales de anunciantes. Los anuncios de qa/ son fixtures confinados al SDK simulado y jamás forman parte de defaults productivos.

Cambios de aplicación para revisión: shared/house-ads.ts, backend/house-marketing.ts, backend/index.ts, backend/admin-backup.ts, src/house-advertising.tsx, src/house-advertising.css, src/house-admin.tsx, src/App.tsx, src/administrator-access.tsx. Los demás módulos frontend son la base sin cambios requerida para compilar localmente; no reenviarlos sin cambios a AppDeploy. qa/ y sus declaraciones SDK son solo pruebas: jamás desplegarlos ni usar el alias SDK de qa en producción. Revisar el contrato tests/tests.json antes de un eventual despliegue, porque las nuevas pruebas de vacío requieren un entorno controlado; no borrar anunciantes reales para ejecutarlas.

## Comprobación

Node 24: ejecutar los dos tests/house-*.test.mjs. qa/run-check.mjs instala dependencias abiertas de npm y Chromium, compila con Vite/TypeScript y ejecuta Playwright exclusivamente en localhost con adaptador SDK simulado. No tiene deploy_app, conexión a AppDeploy, contactos externos, proveedores pagos, cron ni importaciones de secretos.

Las campañas propias son cuatro configuraciones permanentes editables, no perfiles, ofertas o anunciantes falsos. El endpoint de catálogo utiliza las campañas comerciales ya guardadas en growth_campaigns; si no puede leer el catálogo completo no supone que el inventario esté libre. El motor permite dos ubicaciones separadas, prioriza el inventario comercial comprometido heredado, evita duplicar house ads y aplica límites por sesión. Las campañas comerciales heredadas conservan sus dos ubicaciones previas por defecto, incluso si eso exige repetirlas; HOUSE_AD nunca sustituye esos compromisos.

Los planes actuales no contienen un sistema contractual de cuotas de impresiones ni facturación. Se preservan prioridad/posiciones existentes; no se promete garantía contractual de impresiones inexistente. Antes de vender planes con garantías, añadir recibos/reservas y pacing verificables. Las métricas del navegador no son antifraude ni facturables.

Las solicitudes comerciales permanecen privadas y pendientes. El administrador revisa el texto público y activa 30 días desde la aprobación; la entrega repetida no renueva ni duplica. Nunca hay cargo, renovación automática o prueba activada solo por abrir o enviar el formulario. No se generan ventas pagadas.

PostHog sigue deshabilitado por la política de seguridad. Las métricas HOUSE_AD son de primera parte y separadas; conversiones por perfil/empleador/solicitud se originan después del efecto real en servidor. registration_completed significa formulario guardado, no una cuenta autenticada nueva. El evento paid_conversion queda reservado a una futura integración de pagos verificable: no hay productor instalado ni cifras de ventas simuladas. Los perfiles ya publicados se suprimen como objetivo cuando el dispositivo conserva su token de propietario; no se promete identificación del mismo usuario entre dispositivos.

El config se guarda con revisión y compare-and-swap; las variantes se rotan y miden descriptivamente, no equivalen a un experimento estadístico. Los agregados y recibos están incluidos en el ámbito de respaldo por sus tablas fijas; no se alteran respaldos históricos. Sin nuevos cron o tareas periódicas. Solo las visitas revisan caducidad.
