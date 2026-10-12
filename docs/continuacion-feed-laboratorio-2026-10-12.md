# Feed paginado aplicado en el laboratorio

La reparación continúa en `repair/radar-audit-2026-10-11`, después de la autorización para trabajar y aplicar las correcciones en el laboratorio. No se integran cambios en `main`.

- App: [Trabajo Cerca Laboratorio](https://trabajo-cerca-laboratorio-3ojgro.v2.appdeploy.ai/).
- Versión base: `1791772015605`.
- Versión aplicada: **`1791805194792`**, 12 de octubre de 2026.
- `main` comprobada en `fab392b824e4100a4bba6dfe9289825297d24707`.
- Entrega anterior: [aplicación del primer parche](aplicacion-radar-laboratorio-2026-10-11.md) e [informe de auditoría](auditoria-radar-2026-10-11.md).

## Error confirmado

El estado de AppDeploy, antes del cambio, mostraba tres fallos consecutivos del cron `verify-publish`. Su último error era:

```text
Incomplete inventory: public feed retained; paginated snapshot required
```

La protección del primer parche funcionaba: evitaba sustituir el feed visible con los primeros 200 registros. Faltaba el mecanismo para completar las páginas restantes.

## Cambios realizados

El nuevo [motor del feed](../integrations/appdeploy/public-feed.ts), instalado como `backend/public-feed.ts`, implementa:

1. Una migración inicial que lee **una página de hasta 40 registros de una sola fuente por ejecución**. Guarda la fuente, el cursor y las referencias de las páginas ya construidas. Recorre tanto `radar_jobs` como `community_posts`.
2. Páginas y manifiestos inmutables. El feed anterior sigue disponible mientras la construcción está incompleta. Solo se sustituye el puntero visible cuando se confirman todas las páginas, el manifiesto completo y su escritura.
3. Orden global por fecha, distribución equilibrada de páginas, conteos completos y límites por bytes además de cantidad de registros.
4. Cursores vinculados al manifiesto: al cargar la siguiente página se conserva la misma versión, aunque entre ambas consultas se publique otra.
5. Registro de las altas, modificaciones y bajas existentes de las dos fuentes en una cola de cambios. Después de la migración inicial, el cron procesa hasta 40 eventos y vuelve a consultar los registros por sus IDs; no reinicia el recorrido completo de las fuentes.
6. Actualización acotada de vencimientos y contadores de novedades usando los IDs guardados en una página que necesite refrescarse.
7. Confirmación de IDs y booleanos de escritura. Los eventos solo se reconocen después de guardar el manifiesto visible. Si falla ese reconocimiento, el evento se puede repetir sin duplicar la misma oferta por ID de origen.
8. `GET /api/listings` solo lee. Un feed todavía inexistente devuelve HTTP 503; un cursor inválido devuelve HTTP 400. Un fallo de lectura no se convierte en un inventario vacío confirmado.

Solo el handler del cron existente `verify-publish` avanza el escritor del feed. Los recolectores y otros handlers que antes solicitaban reconstrucciones ahora consultan el resumen guardado. Las publicaciones y cierres existentes quedarán reflejados cuando ese cron procese su evento; no se promete visibilidad inmediata.

No se cambiaron el calendario, las credenciales ni los criterios de verificación de las ofertas. La consulta pública conserva la eliminación de datos privados que hacía `publicRecord`.

Los [diffs de integración](../integrations/appdeploy/public-feed-repair.json) registran la versión base y los cambios. El [diff convencional](../integrations/appdeploy/public-feed-repair.patch) contiene los cambios de `backend/index.ts`; el módulo nuevo se entrega por separado.

## Pruebas ejecutadas

| Comprobación | Resultado |
| --- | --- |
| `python -m unittest discover -s tests -v` | 31 aprobadas. |
| `node tests/appdeploy-repair.test.mjs` | 8 aprobadas del primer parche. |
| `node tests/appdeploy-public-feed.test.mjs` | 28 aprobadas del nuevo motor y la ruta real parcheada, con DB simulada. |
| `node tests/workflow-checkpoint.test.mjs` | 4 aprobadas. |
| Total local | **71 pruebas aprobadas**, sin red ni servicios de pago. |
| Sintaxis del backend y del módulo | Parseo TypeScript correcto. |
| Despliegue nativo | AppDeploy devolvió `ready`. |
| Errores del despliegue | Frontend: 0; backend: 0. |
| Snapshot QA | Sin errores de frontend ni de red reportados. |
| Código aplicado | Los 11 diffs presentes; módulo y suite QA coinciden con la entrega. |
| `cron.json` | Idéntico al snapshot base. |

Las pruebas nuevas incluyen un inventario ficticio de **330 registros** de ambas fuentes, orden completo, reinicio con checkpoint, fallos de página/manifiesto/puntero, SDK con resultados parciales, cierre que conserva el histórico, reconocimiento fallido de eventos, repetición sin duplicación por ID, paginación entre versiones, vencimientos, límites UTF-8 y propagación de errores 429 sin reintentos ocultos.

La pantalla usa `URLSearchParams` y trata el cursor como texto; admite los cursores nuevos sin cambios de frontend. Se ajustó únicamente el caso QA de lectura para consultar una segunda página si el inventario real la ofrece. Los tres casos QA continúan excluyendo creación de avisos y ejecuciones de motores; bloquean analítica externa y consultas comerciales durante QA.

AppDeploy no entregó estados individuales de los tres casos ni un ID de grupo e2e. Se registra el snapshot sin errores, **no tres pruebas e2e individuales aprobadas**. El parseo local tampoco se presenta como comprobación completa de tipos del SDK.

## Datos y alcance

- No se borraron ofertas históricas ni se reinició el inventario. La migración lee las fuentes existentes y crea materializaciones separadas.
- El mantenimiento automático solo elimina de su cola los eventos ya reconocidos. No elimina registros laborales de origen ni versiones históricas del feed.
- Se conservó la ruta de eliminación que ya tenía la app para acciones explícitas de sus propietarios; no se invocó durante este trabajo.
- No se dispararon manualmente recolectores, Actors, OCR, IA, notificaciones ni proveedores de pago. Las automatizaciones que ya estaban habilitadas conservan sus horarios.
- El nuevo módulo no contiene credenciales ni añade servicios externos.
- La rama principal y producción continúan fuera del alcance de esta aplicación.

## Qué falta para publicaciones automáticas reales

1. **Observar la reconstrucción real del laboratorio.** La migración empieza en el siguiente ciclo de `verify-publish` y necesita varias ejecuciones, según el tamaño del inventario. Con el calendario conservado hay siete oportunidades diarias. El despliegue listo no demuestra que esa reconstrucción ya haya terminado ni que haya ofertas nuevas publicadas.
2. **Ingesta desde GitHub.** El radar externo aún entrega `publication_queue.json` en modo `dry_run`. Falta un transporte autenticado admitido por AppDeploy, deduplicación canónica y confirmación de persistencia por ID antes de registrar publicaciones externas. No se creó una ruta pública de escritura sin autenticación ni se inventaron credenciales.
3. **Persistencia durable del radar externo.** SQLite y los artefactos de siete días necesitan respaldo permanente. La persistencia del feed en la DB de AppDeploy no sustituye ese respaldo.
4. **Deduplicación por identidad de la vacante.** El feed nuevo evita duplicaciones del mismo ID de origen. Si dos recolectores insertan la misma vacante con IDs diferentes, se necesita un índice canónico en la ingesta. No se certifica deduplicación global por URL o título.
5. **Atomicidad y recuperación.** El SDK no documenta transacciones ni compare-and-swap. Se usa un solo escritor programado del puntero; no deben invocarse escritores simultáneamente. Si se guarda una fuente pero falla el registro de su evento, el error queda explícito y requiere reconciliación. Las 71 pruebas no certifican garantías transaccionales que el SDK no ofrece.
6. **Límites y conservación de versiones.** Cada registro tiene un techo interno de 230 KiB y cada petición 900 KiB. Un manifiesto demasiado grande se rechaza conservando el feed anterior; para inventarios mayores habrá que paginar también su índice. Se preservan las versiones antiguas; queda pendiente definir su retención y vigilar las cuotas de DB sin borrar ofertas históricas.
7. **Verificación y piloto real.** Falta ampliar los adaptadores de municipalidades/RSS/redes sociales y revisar los fallbacks sociales e IA existentes. Después debe comprobarse un lote pequeño de ofertas genuinas de punta a punta y repetirse sin duplicados. No se declara un aumento real de publicaciones en esta entrega.

Los informes anteriores y `radar-repair.json` conservan su significado histórico. Esta continuación sustituye la protección que detenía la reconstrucción por el motor paginado aplicado al laboratorio. No integra la rama de reparación en `main`.
