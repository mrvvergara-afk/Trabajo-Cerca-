# Trabajo Cerca — Consolidación UX, servicios y negocios · 20-11-2026

## Identidad de entornos (no confundir)
- **LAB aislado:** AppDeploy `trabajo-cerca-lab-aislado-xirg9w`, snapshot **1795209405451**, URL https://trabajo-cerca-lab-aislado-xirg9w.v2.appdeploy.ai/.
- **Producción oficial:** AppDeploy `trabajo-cerca-laboratorio-3ojgro`, snapshot de canario **1795209664148**, URL https://trabajo-cerca-laboratorio-3ojgro.v2.appdeploy.ai/. Esta app se llama «Laboratorio» históricamente pero contiene los datos reales y los cron productivos.
- **Rollback de código de producción anterior al ensayo:** snapshot **1795180490226**. NO restaura datos.
- **Prueba visual optativa producción:** https://trabajo-cerca-laboratorio-3ojgro.v2.appdeploy.ai/?tc_release_preview=1. El diseño habitual SIN parámetro no se modifica.

## Paquete completo instalado en LAB (NO trasladar snapshot entero)
1. `src/local-directory.tsx`: directorio compacto; una sola ficha por servicio/negocio; recuperación bajo «Mis publicaciones»; ayuda de campos desplegable con ⓘ; comunas extra de atención/entrega; tres criterios de puntuación (puntualidad/atención, calidad, cumplimiento); mensajes cortos.
2. `backend/local-directory.ts`: normaliza y almacena varias comunas en `coverage`, valida dentro de las 12 comunas y añade comuna principal una sola vez; rating visible desde la primera valoración aprobada existente; nuevas evaluaciones con tres criterios, correo autenticado, autoevaluación bloqueada, duplicado por correo bloqueado, promedio transaccional inmediato. **El flujo positivo de reseña autenticada aún NO se ha ensayado E2E.** Las evaluaciones antiguas pendientes siguen pendientes.
3. `src/App.tsx`: textos «servicios o negocio» en vez de «productos»; cobertura de disponibilidad laboral tomada en cuenta al buscar en comuna secundaria; contador únicamente de ofertas verificadas distintas, ejecutadas dentro de las 12 comunas, mostrado cuando `feedComplete` confirma catálogo completo.
4. `src/site-menu.tsx`: menú de opciones secundarias compacto; acceso admin retirado del menú público (las rutas admin siguen protegidas en servidor); sesión iniciada o acceso por correo; invitación instalar cuando corresponde.
5. `src/consolidated-ux.css`: compactación móvil y ayudas táctiles. `src/main.tsx` lo importa en LAB.
6. `backend/lab-public-directory.ts` + `backend/index.ts`: SOLO LAB: muestra fichas públicas aprobadas reales desde API de producción exclusivamente **GET**, con campos de lista permitidos, sin contactos, sin revisión ni calificación en esas fichas; `?datos=pruebas` mantiene la base local aislada. **No portar este puente a producción.**
7. `tests/tests.json`: cobertura actualizada de escenarios. Hay respaldos anteriores de LAB mediante AppDeploy.

## Evidencia automatizada
- AppDeploy LAB **READY**, valid=true, QA frontend_errors=[], network_errors=[].
- GitHub Actions run **44819878530**, job **136577714294**: 8/8 verificaciones móviles (selector, íconos, actualización con borradores, formulario negocio/servicio/ayuda/varias comunas, publicidad y contador, menú sin acceso admin) **PASS**.
- El mismo job probó producción por dos visitas sin escrituras: modo normal padding 11px/tab 36px/título 17px; modo con parámetro padding 8px/tab 30px/título 16px. `PROD_CANARY_PASS`, 0 escrituras. **Solo CSS optativo** desplegado en producción, no las nuevas reglas de backend.
- El mismo job creó una ficha ficticia LAB en Mininco con cobertura Collipulli/Renaico/Los Sauces; owner receipt comprobó normalización a 3 comunas, invisibilidad pública antes de moderar, token privado, eliminación y revocación del token. **6/6 PASS**, `fixtureRemoved:true`. No se escribieron datos en producción.
- El laboratorio, en `Todas`, consultó **2 fichas públicas aprobadas** reales desde el endpoint de producción. En `Collipulli` la fuente tenía 0 fichas públicas en ese momento; no se inventan anuncios.
- Smoke de lectura previa 10/10, controles de administración no autenticada 401/403.
- Los flujos sintéticos de escrituras y pruebas de carga regresaron a `workflow_dispatch` **manual**, no deben ejecutarse por cada cambio.

## Resultado del ensayo oficial protegido
**Solo en producción:** `src/main.tsx`, `src/ux-preview-transfer.css`, `tests/tests.json`; compactación visual bajo `?tc_release_preview=1`, y reemplazo del uso de `Array.prototype.at` en el punto de entrada para Android antiguo. Base de datos, crons, publicación comercial y verificación laboral intactos. Snapshot actual **1795209664148**, READY, QA sin errores.

**Incidencia importante:** en cada nuevo despliegue de producción se registraron trazas transitorias `PUBLIC_FEED_DEGRADED(reason=manifest_building, visible=0)` mientras se construía el manifiesto. Las lecturas posteriores desde el espejo público del LAB recuperaron **286 verificadas informadas y 35 tarjetas en primera página**, pero NO puede afirmarse despliegue sin interrupción. Antes de liberar el backend de cobertura/reputación, cerrar feed atómico/blue-green y degradación 0 durante promoción.

## Condiciones BLOQUEANTES del traspaso completo a producción
1. Respaldo consistente cifrado y restauración verificable en segundo entorno aislado; exportador actual declara `rolling_non_atomic`, `restoreValidated=false`.
2. End-to-end con **administrador real autenticado**: aprobar ficha sintética, probar visibilidad por todas sus comunas y retirar. La prueba actual solo llega a `pending`.
3. Prueba real de reseñas con **persona autenticada distinta del dueño**: tres notas, promedio ponderado inmediato, deduplicación/autoevaluación, reporte y manejo de abuso.
4. QA de actualización instalada en dispositivo Android físico y persistencia de borradores.
5. Eliminar ventana `PUBLIC_FEED_DEGRADED visible=0` durante despliegue y acreditar feed atómico, luego realizar ensayo escalonado de carga.
6. Hacer cherry-pick de diferencias de LAB contra **fuente actual de PROD**; nunca aplicar el snapshot LAB completo ni copiar bridges, credenciales, DB o crons de LAB.

## Decisión
- **GO laboratorio / ensayo visual optativo:** sí, verificado.
- **GO despliegue total público:** **NO** por condiciones anteriores.
- **Rollback posible del código productivo:** `apply_app_version` con versión `1795180490226` si la aplicación oficial falla, no como operación rutinaria.
- Seguimiento central: issue #74. Cambios de pruebas: PR borrador #93.
