# Cierre de ciclo: catálogo público (10-11-2026)

## Estado verificable

- **Aprobado en CI:** respaldo de manifiesto anterior, recuperación de página faltante, diagnóstico acotado de regresión y prioridad de registros verificados frente a duplicados no verificados. Último CI: https://github.com/mrvvergara-afk/Trabajo-Cerca-/actions/runs/42887333538
- **Pendiente en AppDeploy:** el backend actualmente desplegado no contiene estos cambios. Los registros de /cron/verify-publish muestran PUBLIC_FEED_REGRESSION_BLOCKED, antes 228, propuesto 231, 1 pérdida injustificada.
- **Registro identificado:** radar_external_9991b10c9353ab1e6bd9819d5a7cc4ed / free-9991b10c9353ab1e6bd9819d5a7cc4ed1c66dc2d, título Técnico en Control de Plagas, Chiletrabajos.
- **Seguridad:** no eliminar la oferta aprobada, no desactivar la barrera de regresión, no fusionar ni desplegar sin autorización.

## Criterios obligatorios para declarar cerrado el incidente

1. Ejecutar una prueba integrada con datos de referencia o entorno no productivo y verificar que una copia pendiente o no verificada no reemplace una aprobada.
2. Aplicar los cambios autorizados al backend correspondiente y verificar en logs la causa real de la oferta omitida usando missingSourceDiagnostics, sourceProjectsToFeed y proposedEquivalentPresent. No inferir la causa sin esos datos.
3. Corregir la causa específica: si el origen es deduplicación, verificar conservación de la oferta aprobada; si es rechazo de proyección, reparar los metadatos/reglas correctos sin publicar contenido no aprobado; si es cola, reconciliar el registro fuente.
4. Ejecutar /cron/verify-publish y confirmar ausencia de PUBLIC_FEED_REGRESSION_BLOCKED para el lote afectado. Comparar identidades y claves, no solo totales.
5. Verificar GET /api/listings con paginación completa, respuesta no degradada y ofertas aprobadas visibles; verificar que el conteo coincide con el manifiesto publicado. No dar por cerrado por ver 231 si la oferta anterior falta.
6. Conservar el manifiesto anterior como punto de recuperación; revisar logs y pruebas tras publicación.

## Decisión

**Cierre de CI: sí. Cierre de incidente en producción: NO.** PR #35 permanece sin fusionar ni desplegar hasta autorización y validación integrada.
