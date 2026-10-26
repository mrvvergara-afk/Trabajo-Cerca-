# Circuito administrativo de publicación — Trabajo Cerca

Evidencia inicial: 25 de octubre de 2026, 23:53 UTC. Confirmación independiente final: 2026-10-25T23:58:28.251Z. Aplicación `trabajo-cerca-laboratorio-3ojgro`.

## Resultado y alcance comprobado

La corrección está implementada en `repair/admin-publication-circuit-2026-10-25`, sin despliegue, fusión ni escritura de datos reales. Las pruebas aisladas recorren los módulos reales de bandeja, comprobador de fuentes, cola, verificador y proyector/catálogo. La base de datos de estas pruebas es un adaptador; no son una prueba de escritura con el SDK desplegado.

**Hallazgo principal:** TC-001, TC-002 y TC-004 ya están en el catálogo real mediante el recolector gratuito, con IDs `free-…`; sus IDs administrativos `tcq_…` no aparecen. Publicarlas otra vez infringiría la deduplicación. La corrección permite cerrar sus entradas administrativas como duplicadas, identificar la publicación existente y consultarla desde el tablero. No se atribuye su publicación a este parche.

La primera publicación real de una oferta **única** por la ruta administrativa corregida sigue pendiente de integración autorizada y comprobación en vivo. No se presenta un ensayo aislado como esa publicación.

## Comparación del código vigente

| Origen | Referencia comprobada | Diferencia relevante |
|---|---|---|
| AppDeploy estable | `1792967413347` | Incluye bandeja, comprobador, envío y exportación de documentos posteriores al PR. |
| PR #2 | `e9f5a45a7a705b922865cf26cc799753584ccd4a` | Contiene la candidata anterior; no incorpora todos esos cambios nativos. |
| `main` | `e0d61ec6028575036178ea997fe09a919efa2039` | Rama divergente con automatización diaria; no equivale al código completo desplegado. |
| Rama administrativa de otra sesión | `5c4304aacb3af60048ccbb41bd5d6cf0a8b277e7` | Tampoco acredita por sí sola sincronización con el laboratorio. |

No se sustituyó la aplicación nativa por la candidata anterior. `qa/admin-native-baseline.json` conserva el código estable necesario; SHA-256 del índice original: `430248d3172c2e727823b99f356f430a50d16194ee9502dc30f1efc01f45f712`.

`qa/admin-native-patch.mjs` genera un parche específico de **ocho archivos** sobre esa base: índice, respaldo, tres módulos administrativos existentes, nuevo trabajador gratuito y TSX/CSS de la bandeja. Mantiene las siete configuraciones cron, autenticación, fuentes, política territorial, marketing, recursos y diseño público de la versión nativa. Antes de aplicarlo hay que comparar nuevamente versión y huella; no usarlo sobre cambios posteriores sin reconciliarlos.

## Causas confirmadas y correcciones

| Hallazgo en código desplegado | Impacto | Corrección |
|---|---|---|
| `v14VerificationHandler` llama a `processPendingOffers` solamente en siete horarios diarios, aunque `verify-publish` corre cada 15 minutos. | El tick de persistencia no implica verificación de candidatos. | Rama gratuita administrativa dentro del mismo cron en minutos 5, 20, 35 y 50. No se cambia la frecuencia del proveedor ni se crea otro cron. |
| Candidatos no verificados tienen espera de seis horas. | Bloqueo aparente aun después de un envío correcto. | Cola administrativa propia de trabajo pendiente; reintento ordinario de 15 minutos y de dos horas para restricciones de acceso/robots/429. |
| Priorización nativa basada en primera página de 100 entradas y 12 recientes. | Entradas posteriores pueden quedar relegadas. | Migración inicial paginada de 20 entradas por tick y cola por ID para futuras aprobadas. La migración termina; no se recorre siempre toda la bandeja. |
| Duplicados revisados solo en `radar_jobs`. El catálogo también integra otras tablas. | Una oferta ya pública puede quedar esperando otra proyección indefinidamente. | Revisión reanudable de inventario y hojas actuales del catálogo; se excluye la propia fila y se evita que dos candidatas equivalentes se aprueben mutuamente. |
| Consulta manual por tarjeta y evidencia no persistida sistemáticamente. | Difícil conocer causa y desenlace individual. | Tablero paginado de estados; guarda última comprobación, razón, próxima revisión, método, URL y SHA-256 de la evidencia. |
| Una clave de manifiesto podía confundirse con una publicación confirmada. | Falso positivo de visibilidad. | Se exige el registro real de la hoja actual, ID, URL y flags correctos. El recibo público se guarda después de avanzar el escritor existente del catálogo. |

Se conserva el comprobador gratuito `fetchPublicPage` / `evaluatePublicJob`; ya existía y estaba detrás de la programación restringida. No se reemplazó por IA ni scraping de pago.

Las condiciones de admisión nativas siguen vigentes: fuente individual admitida, empleador, postulación, fecha original dentro de 20 días, lugar real único y coherente con la investigación, vigencia y duplicados. Se preservan fechas iniciales; una nueva comprobación no extiende el vencimiento ni reinicia la incorporación. Las verificadas publicadas continúan con la revalidación ordinaria.

## Evidencia real de los cuatro casos

Lectura HTTP de las cuatro fuentes: 200. Catálogo completo: **73 registros**, cuatro páginas, HTTP 200. Segunda lectura a través de la aplicación y su SDK: catálogo completo, sin errores JavaScript ni de red. No hubo escrituras administrativas ni activación de motores por la auditoría.

| Caso | Evidencia de la fuente | Resultado público observado |
|---|---|---|
| TC-001 | Operario de producción; Angol acreditado en descripción; fecha original 23/10/2026; postulación disponible. | [`free-3fba47530376cc60f714e881756b58f00a7636cd`](https://trabajo-cerca-laboratorio-3ojgro.v2.appdeploy.ai/?listing=free-3fba47530376cc60f714e881756b58f00a7636cd). Verificada, sin revisión pendiente; primera incorporación registrada 25/10, 19:05 UTC. |
| TC-002 | TENS/enfermería, Expertise Spa; Angol; fecha original 21/10/2026; postulación disponible. | [`free-ac1791a9fa45a221d1d19e96feba22b3c1e9be10`](https://trabajo-cerca-laboratorio-3ojgro.v2.appdeploy.ai/?listing=free-ac1791a9fa45a221d1d19e96feba22b3c1e9be10). Verificada, sin revisión pendiente; primera incorporación registrada 25/10, 23:05 UTC. |
| TC-003 | `worksite_missing_or_multiple`: no acredita comuna única. | Sin publicación equivalente observada. Debe permanecer pendiente, sin inferir Angol de la categoría del portal. |
| TC-004 | Vendedor en terreno, Manpowergroup; el verificador acredita Angol; fecha original 19/10/2026. | [`free-149bb65066307aa45733b5f251ca3055f042eeeb`](https://trabajo-cerca-laboratorio-3ojgro.v2.appdeploy.ai/?listing=free-149bb65066307aa45733b5f251ca3055f042eeeb). Verificada, sin revisión pendiente; primera incorporación registrada 20/10, 07:05 UTC. |

IDs administrativos esperados: `tcq_8e10d10d8dedf4b7e3b9c1`, `tcq_e2265a52410f086a0dcb71`, `tcq_46607b264d4d83a176c340`, `tcq_688f28c809dc3463f046fa`. Se derivaron de las URLs del informe diario; ninguno apareció en la lectura pública. No se contó con sesión privada para leer las filas reales de la bandeja: su último motivo interno individual no se inventa.

Fuentes, hashes, fechas, identificadores y procedencia del SDK: [evidencia JSON](evidence/publication-circuit-2026-10-25.json).

## Pruebas y reproducibilidad

- **18 pruebas nuevas de circuito**, con módulos reales y datos/base aislados: publicación positiva hasta hoja real del catálogo de prueba; envío idempotente; recuperación de fuente; vencidas/cerradas/eliminadas; ubicación ambigua; duplicados internos y externos; duplicado después de 120 registros; conservación de fechas; manifiesto sin registro; paginación; escritura de resultado incierto; límite de dos comprobaciones; rechazo de ticks ajenos/repetidos; desempate de candidatas simultáneas; estados actuales y migración paginada. Las evidencias internas no aparecen en los registros públicos.
- **410 pruebas Node y 245 Python aprobadas** con la candidata final `2782f9a68fce1b950797636d32d117f35162dea7`; compilación Vite, TypeScript estricto contra contrato SDK de referencia y bundles canónico y nativo aprobados. La corrección final de enlaces de duplicados también superó el circuito y la CI completa.
- **Playwright de la bandeja: 360, 390, 768 y 1440 px**, 20 estados en conjunto, refresco sin POST, página siguiente/anterior, sin desbordamiento ni errores. Ensayo claramente rotulado; no conectado a la bandeja real.
- Regresiones públicas con datos reales leídos y reproducidos en candidata: filtros, paginación, lectura persistente, radar, campañas, error 503 visible y recuperación PWA. Las escrituras del SDK real, push físico e instalación física no están acreditadas por estos ensayos.
- Auditoría de dependencias de ejecución sin vulnerabilidades altas/críticas; reglas cron y otros cinco inicializadores laborales conservados. El sexto incorpora exclusivamente el enganche gratuito documentado.

Reproducir desde la raíz: `node tests/admin-publication-circuit.test.mjs`; suites existentes mediante el workflow `.github/workflows/admin-publication-circuit.yml`. Build/browsers: desde `integrations/appdeploy/house-ads`, `CLOSURE_CHECKS=1 ADMIN_PUBLICATION_CHECKS=1 node qa/run-check.mjs`.

CI final aprobada: [40247032915](https://github.com/mrvvergara-afk/Trabajo-Cerca-/actions/runs/40247032915), commit de código `2782f9a68fce1b950797636d32d117f35162dea7`. El commit documental posterior no cambia ese código probado. Incluye capturas, observaciones reales, resultados y parche nativo en el artefacto `admin-publication-circuit` (retención hasta el 2 de noviembre de 2026). La evidencia JSON se conserva en el repositorio.

## Archivos de implementación

- `backend/radar-admin-verification.ts`: trabajador acotado, programación, migración, recibos y confirmación.
- `backend/radar-review-check.ts`, `radar-review-queue.ts`, `radar-review-inbox.ts`: fuentes, duplicados, envío idempotente y estados paginados.
- `backend/index.ts`, `backend/admin-backup.ts`: enganche al escritor existente, rutas protegidas, exclusión de evidencias privadas y respaldo de las tres tablas administrativas.
- `src/radar-review-inbox.tsx` y `.css`: tablero y enlaces. Se incorporan a GitHub los módulos nativos de acceso administrativo/exportación de documentos para conservar esas funciones; no se despliegan sobre ellas versiones antiguas.
- `tests/admin-publication-circuit.test.mjs`, workflow y archivos `qa/admin-*`: pruebas, observación real sin escritura y parche específico nativo. Ajustes de QA existentes limitados a incorporar estas comprobaciones.

## Consumo, integración y cierre pendiente

No hay dependencias nuevas, servicios facturables, IA, suscripciones ni cobros. Se utiliza el cron y la base existentes. Presupuesto por tick: máximo dos comprobaciones de fuente, una página de migración inicial, una página de cola, una página de 120 filas de duplicados y hasta dos hojas públicas por candidato, con límites temporales, control de concurrencia y recibos. Las respuestas de cuota/permiso no se ocultan ni se reintentan ilimitadamente. Esto consume cuotas existentes: no demuestra capacidad ilimitada ni que el plan actual de AppDeploy tenga costo total cero.

Secuencia pendiente, después de autorizar la integración al laboratorio:

1. Releer versión estable y comparar la huella base. Conservar el snapshot `1792967413347` y regenerar el parche si el código cambió.
2. Aplicar solamente los ocho archivos nativos. No desplegar toda la candidata histórica sobre AppDeploy ni cambiar `main`.
3. Con sesión administrativa legítima, comprobar la conciliación automática de las tres ofertas ya públicas como duplicadas, manteniendo sus registros `free-…` y la incertidumbre de TC-003.
4. Para una primera publicación administrativa única, usar otra oferta **real, aprobada y no duplicada**, comprobar la fuente y observar los ticks del cron. Exigir recibo, registro `tcq_…` en la respuesta pública y enlace funcional. No crear una oferta ficticia ni forzar la republicación de estas tres.
5. Si hay regresión, restaurar el snapshot de código. Esa restauración **no revierte datos** escritos después: conservar recibos y efectuar cualquier conciliación de datos de forma individual y autorizada; no eliminar masivamente ni deshacer publicaciones válidas.

Veredicto: **código candidato probado y listo para integrar; circuito corregido todavía no acreditado en vivo**. No se fusionó, desplegó ni modificaron los avisos reales durante este trabajo.
