# Corrección preparada: catálogo degradado sin ofertas

## Evidencia de AppDeploy (10 nov 2026)

- `GET /api/listings` registró `PUBLIC_FEED_DEGRADED {reason:manifest_building,visible:0}`.
- El cron informó `publicJobs:228`, pero bloqueó una propuesta de 227 al faltar una oferta verificada de Control de Plagas.
- No se debe interpretar `publicJobs:228` como 228 elementos comprobados en la respuesta HTTP: son dos mediciones distintas.

## Causa concreta del cero temporal

En `backend/index.ts`, ruta `GET /api/listings`, cuando `readPublicFeedPage` no devuelve página y la página staged no contiene elementos, se examinan únicamente **200 registros de `radar_jobs`**, se proyectan 40 y se devuelve `totalItems:visible.length` y `hasMore:false`. La fuente de avisos externos `radar_external_* ` no participa en ese rescate. Por tanto puede responder con cero aunque exista un manifiesto anterior o avisos externos verificados.

## Reparación de integración pendiente de aplicar al backend real

1. No publicar una página de cero como catálogo válido. Si existe un manifiesto último-bueno, leerlo antes de entrar en la ruta degradada; tratar ausencia de puntero como incidente de integridad y no como cero real.
2. Si no existe manifiesto recuperable, responder `degraded:true` con estado explícito `temporarily_unavailable` y no presentar un total falso de cero como inventario.
3. Evitar un rescate limitado a los primeros 200 registros de `radar_jobs`. Si se conserva un rescate parcial, no presentar `hasMore:false` ni un total global inventado; tampoco leer tablas externas sin control de privacidad y deduplicación.
4. Reconciliar la oferta `radar_external_9991b10c9353ab1e6bd9819d5a7cc4ed:free-9991b10c9353ab1e6bd9819d5a7cc4ed1c66dc2d` mediante el diagnóstico de fuente y proyección. **No desactivar** `PUBLIC_FEED_REGRESSION_BLOCKED`.
5. Probar casos: manifiesto normal, reconstrucción incompleta, puntero ausente, cursor inválido, oferta externa activa, cierre explícito y 228→227 bloqueado.

No se ha aplicado este cambio a producción. Requiere integración con `backend/index.ts` completo y despliegue autorizado.
