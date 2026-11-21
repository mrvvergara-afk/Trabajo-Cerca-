# Transferencia controlada LAB → aplicación oficial · 21-11-2026

**Origen comprobado:** LAB aislado `trabajo-cerca-lab-aislado-xirg9w`, versión `1795291106609`.
**Destino previsto:** Trabajo Cerca oficial `trabajo-cerca-laboratorio-3ojgro`, baseline `1795209664148`.
**Estado:** CÓDIGO RECOPILADO / CANDIDATO EN BORRADOR. **No desplegado a producción**.

## Objetivo real
Pasar a la aplicación oficial las mejoras de experiencia, formularios, PWA, menú y cuadro de mando desarrolladas en el LAB, SIN copiar su base de datos de pruebas, avisos simulados, endpoints espejo, secretos ni reemplazar las tareas programadas, motores o catálogo oficial. Un solo despliegue consolidado después de pruebas de compatibilidad y recuperación.

## Fuentes de la actualización
Se inspeccionó la evolución del LAB desde la primera versión `1795185049035` (20/11) hasta `1795291106609` (21/11), además del snapshot oficial. La comparación confirmó cambios en los siguientes archivos existentes:
- `src/App.tsx`: ayudas de publicidad, conteo regional, etiquetas LAB y vista de catálogo espejo. **Referencia solamente**; hay que integrar los componentes útiles en el App oficial, sin copiar su lógica de preview.
- `src/local-directory.tsx`: guías de publicación, ayudas por campo y selector de cobertura territorial. Requiere verificación de contratos de publicación y permiso.
- `src/site-menu.tsx`: accesos de cuenta y atajo administrativo visible tras validar permiso.
- `src/administrator-access.tsx`: mezcla de cambios de acceso y paneles exclusivos de LAB; **no sustituir directamente**.
- `src/executive-control-center.tsx` y `src/executive-metrics.ts`: KPI del catálogo real, manejo de «Sin datos» y fecha de consulta del cuadro de mando.
- `src/pwa-update.tsx`: aviso de actualización de PWA, detección de cambio de paquete y protección de formularios con edición pendiente.
- `src/main.tsx`: montaje del aviso de PWA y hojas de estilo de mejoras; el destino debe conservar su propio registro SW y preview canario.
- `src/house-advertising.tsx` y `src/advertising-surfaces.tsx`: ajustes de publicidad; revisar diferencias con producción.
- `src/feed-page-batch.ts`: lectura exclusivamente por nextCursor, sin peticiones especulativas (el único cambio de `release/payload.json` actual).
- `backend/chatgpt-auto-import.ts`: diagnóstico separado de lote reciente y ejecución del rastreador; **no copiar backend del LAB a producción sin reconciliar métricas**.

Los archivos visuales `src/ux-rc9-mobile.css`, `src/stitch-fidelity.css`, `src/ux-admin-brand-hotfix.css`, `src/ux-release-consolidated.css` y `src/compact-layout.css` ya existían en la primera versión de LAB; la oficial contiene sus propias versiones compactadas. No declararlos cambios inéditos sin comparación semántica. Los complementos `src/consolidated-ux.css` y `src/form-guidance.css` sí se incorporaron en LAB y no existen en oficial.

## Archivos preparados en esta rama (NO operativos hasta un deploy)
- `release/staging/20261121/src/pwa-update.tsx` — adaptado para producción, sin texto de laboratorio.
- `release/staging/20261121/src/pwa-update.css` — solo aviso PWA, sin emblema LAB.
- `release/staging/20261121/src/main.tsx` — integración propuesta sobre el main oficial, preservando el canario existente.
- `release/staging/20261121/src/consolidated-ux.css` y `src/form-guidance.css` — CSS nuevo.
- `release/staging/20261121/src/local-directory.tsx`, `site-menu.tsx`, `executive-control-center.tsx`, `executive-metrics.ts` — módulos para revisión de compatibilidad con APIs de producción.
- `release/staging/20261121/reference-only/src/App.tsx`, `house-advertising.tsx`, `advertising-surfaces.tsx` — copias de comparación: **NO trasladar verbatim**.

## Exclusiones estrictas
- No desplegar `backend/lab-public-*`, `backend/manual-backup-receipt.ts`, `backend/release-*` ni `src/release-*`, `src/work-backup-handoff.tsx`, `src/lab-notice.css`/banners LAB, secretos ni registros del LAB.
- No reemplazar `backend/index.ts`, `backend/public-feed.ts`, `cron.json`, política de seguridad, bases de datos ni identidades de ofertas oficiales.
- No fusionar archivos de advertencia o exportación del entorno de prueba en funcionalidades públicas.
- Conservar 12 comunas principales y Temuco/Los Ángeles solamente como ciudades complementarias.

## Preflight obligatorio antes de la única publicación
1. Validar compatibilidad de APIs y permisos de formularios/directorio/publicidad y no mezcla LAB→PROD.
2. Probar PWA Android/web sin pérdida de formularios, casos en que cambia paquete sin cambiar SW, y actualización voluntaria.
3. Probar catálogo: paginación de todas las ofertas sin 400, sin páginas vacías/degradadas; cifras antes/después y 12 comunas.
4. Probar autenticación/admin, publicidad, motores A/D/ChatGPT/Gemini, crons, idempotencia y estado del feed.
5. Backup consistente visto `ready` en AppDeploy; falta **restauración acreditada** en entorno independiente, requisito previamente fijado. Confirmar reversión de código y datos.
6. Validar candidato completo (no solo `release/payload.json`), una única acción consolidada, verificar producción y disponer de retorno.

**ATENCIÓN:** el `release/payload.json` de esta rama **solo implementa paginación**. Los archivos en `release/staging/` son fuentes de preparación; el ejecutor de GitHub NO los aplica automáticamente. No fusionar PR ni marcarlo como actualización completa hasta portar/integrar el conjunto y acreditar las pruebas.
