# Conexión del lector gratuito de documentos — 13 de octubre de 2026

La app indicada por el usuario recibió la versión **1791924889565**, estado `ready`, sin errores reportados de frontend, backend o red: https://trabajo-cerca-laboratorio-3ojgro.v2.appdeploy.ai/. El código está guardado en GitHub y **se ejecutaron cuatro ciclos reales gratuitos**. El primero recibió 71 pendientes, comprobó tres y recorrió las nueve fuentes municipales. Las pasadas siguientes verificaron los errores de selección, tamaño y lectura parcial, conservaron el histórico y acreditaron OCR completo dentro de los límites admitidos. **Ningún ciclo encontró una oferta documental publicable**.

La lectura del feed confirmó que seguían visibles el aviso de BNE y las dos ofertas del piloto anterior. No se atribuyen publicaciones nuevas de afiches, PDF, Facebook o Instagram a esta continuación. Detectar un enlace, extraer un archivo y publicar una oferta siguen siendo resultados distintos.

## Cambios implementados

- La app exporta mediante su diagnóstico existente un lote de trabajo de hasta 100 URLs locales pendientes, con el enlace a la página publicadora cuando se conoce. La consulta es de lectura y no usa la fecha de captura como fecha original.
- El descubrimiento nativo incorpora imágenes de publicaciones laborales individuales. Excluye logos y otros elementos de navegación.
- Se corrigió un bloqueo del cursor: los PDF e imágenes permanecen en la cola de documentos y dejan de entrar en el recorrido de páginas HTML. Un PDF antiguo no detiene la lectura de su municipalidad.
- `scripts/document_cycle.py` restaura el histórico durable, une el respaldo del piloto y el de fuentes públicas y conserva candidatos, observaciones, intentos, checkpoints, runs y recibos. La unión es transaccional e idempotente; los snapshots anteriores se mantienen.
- El productor lee hasta tres pendientes por ciclo y recorre hasta nueve páginas locales adicionales. Usa Poppler/Tesseract, con límites de tiempo, tamaño, páginas y confianza. Un documento parcial, antiguo, vencido o sin evidencia suficiente permanece pendiente.
- Una fecha de artículo solo se usa para un archivo realmente enlazado por esa página. También se admite la fecha original completa escrita en el propio aviso. Se mantiene el límite de 45 días y el cierre vigente.
- Los avisos locales completos pueden usar un teléfono chileno literal como contacto de postulación si no tienen correo. Se normaliza a `tel:+56...`; múltiples teléfonos sin resolver quedan pendientes. Esta opción no relaja fecha, empresa, lugar ni integridad del documento.
- El productor prepara un máximo de tres ofertas documentales mediante el mismo sobre OIDC firmado, ligado a repositorio, rama, workflow, contenido y ejecución. La app escribe por identidad y el escritor existente confirma posteriormente los IDs en el feed.
- Si no hay avisos documentales verificables, se conserva el lote firmado anterior. Una copia histórica con la misma carga y firma válida conserva sus recibos aunque haya pasado su ventana de primera aceptación; no renueva verificaciones ni crea publicaciones. Una carga nueva o firma alterada sigue sometida a las validaciones completas.
- Se registran los canales de Facebook/Instagram enlazados por las páginas primarias leídas. Un canal municipal no se presenta automáticamente como perfil dedicado de la OMIL. No se añadieron objetivos de captura paga.
- Después del piloto se corrigió la selección de un concurso literario que consumía un cupo de documentos, se priorizaron archivos frente a páginas HTML pendientes y se conservaron los motivos concretos de error de transporte/formato. Los registros originales permanecen en el inventario.
- Se normaliza la URL de un afiche y la URL de su prueba de origen juntas: un fragmento técnico de Joomla ya no puede hacer que una oferta comprobada sea rechazada por discrepancia entre esas dos URLs.
- El límite de descarga documental pasó de 2 a 8 MiB después de comprobar que varios PDF municipales superaban el límite anterior. El límite de texto, la confianza de OCR y las validaciones de campos siguen vigentes.
- El fallback de PDF escaneado ahora lee todas las páginas cuando el documento tiene como máximo cuatro. Antes leía solo la primera y dejaba esos documentos como parciales. Conserva la confianza mínima entre páginas y señala texto truncado. Los PDF mayores a cuatro páginas continúan pendientes de una lectura completa.

Los cambios nativos incrementales están en [document-cycle-repair.json](../integrations/appdeploy/document-cycle-repair.json); la implementación y sus comprobaciones previas están en [document-pipeline-preflight.md](../integrations/appdeploy/document-pipeline-preflight.md).

## Resultado real de la primera pasada

La ejecución [38479791274](https://github.com/mrvvergara-afk/Trabajo-Cerca-/actions/runs/38479791274) terminó correctamente, sobre `580351d9d76c69820a4477c2ff5070dd2cd3e5bc`. El SDK de la app entregó el lote de lectura y el runner ejecutó Poppler/Tesseract. El primer resultado corresponde al 13 de octubre a las **22:45 UTC / 19:45 de Chile continental**.

| Medida | Resultado |
| --- | --- |
| Pendientes recibidos de la app | 71, incluidos 29 documentos |
| Pendientes comprobados | 3 |
| Fuentes municipales recorridas | Las nueve solicitadas |
| Avisos documentales listos / nuevos publicados | 0 / 0 |
| Inventario durable después de unir los respaldos | 357 candidatos, 2.920 observaciones, 19 intentos, cuatro checkpoints, cuatro runs y dos recibos anteriores |
| Llamadas a proveedores pagos | 0 |

Los bloqueos concretos fueron un PDF de Renaico de 15 páginas leído parcialmente y sin fecha original comprobable, un concurso de microcuentos de Mulchén y otro PDF cuyo diagnóstico de formato era demasiado genérico. Angol devolvió HTTP 403; una ruta de Lumaco falló por formato. Las páginas municipales generales no aportaron los campos de una oferta individual. La página general de OMIL Negrete tenía metadatos de publicación del 28 de julio de 2025 y quedó fuera del límite solicitado. Un directorio de subida como `2026/07` sirve para orientar una búsqueda, pero no se usa como fecha de publicación de un aviso.

Las imágenes leídas con Tesseract no aportaron conjuntamente fecha original, cargo, empleador, lugar y vigencia. El PDF parcial no se presentó como completo. No se creó un lote firmado vacío que sustituyera las ofertas del piloto anterior: se mantuvo su intercambio y se guardó el respaldo nuevo en el commit de datos `96a14f611d9b5fa9cf31bb5e3632d070f24ca2bb`.

La lectura separada del feed confirmó su generación completa de 54 elementos públicos, con los IDs `free-d294f2d92f9e56840e53553adef2420f48b30847`, `2ca4362e-d4fb-4d6c-a12e-dfa42849b019` y `c4be30bb-57c1-45c1-9832-18065b54d498` visibles. Ese inventario incluye publicaciones anteriores; no son 54 resultados nuevos del piloto.

La evidencia compacta de esa ejecución está en [document-pilot-result-2026-10-13.json](../integrations/appdeploy/document-pilot-result-2026-10-13.json). Los archivos de Actions tienen siete días de retención; el SQLite y su manifiesto están además conservados en la rama durable de datos, sin sustituir `main` ni borrar snapshots anteriores.

## Pruebas y comprobaciones

La primera revisión aprobó 239 pruebas en GitHub. Las correcciones del piloto añadieron regresiones de URL/proof coherentes, selección de documentos y PDF escaneado de varias páginas. **La revisión final aprobó 242 pruebas: 104 Python y 138 Node**, en [Actions 38482076134](https://github.com/mrvvergara-afk/Trabajo-Cerca-/actions/runs/38482076134), sobre `8b8c65665d7ddf4749b28965d7e648dc59bb76a0`. Se ejecutaron la suite completa de Python, todas las suites Node y `git diff --check` según cada revisión; los archivos de las pruebas son ficticios y no se insertan en la app. La regresión del límite de bytes usa un PDF válido de más de 2 MiB y el lector real de Poppler.

También se comprobaron la exportación de trabajo sin fecha inventada, el cursor que no queda atascado en un PDF, la rama/workflow/subject/carga de las pruebas OIDC y la firma de los respaldos históricos. No se insertaron avisos ficticios en la app ni se iniciaron proveedores pagos.

AppDeploy reportó `ready`. No devolvió un listado individual de pruebas E2E; ese estado no sustituye la prueba del productor externo ni una publicación real por ID. El piloto y la observación del feed son comprobaciones separadas, ya ejecutadas mediante el SDK.

La comprobación local mediante Chromium había quedado bloqueada por el sandbox (`setsockopt: Operation not permitted`). El runner de GitHub resolvió esa limitación usando el transporte frontend soportado. La cancelación inicial del commit también se superó después de la autorización del usuario. Los resultados y límites actuales quedan en [document-cycle-observation-2026-10-13.json](../integrations/appdeploy/document-cycle-observation-2026-10-13.json).

## Resultado de las pasadas de corrección

| Ejecución | Comprobación real | Ofertas documentales listas |
| --- | --- | --- |
| [38480768906](https://github.com/mrvvergara-afk/Trabajo-Cerca-/actions/runs/38480768906) | La selección ya priorizó documentos. Tres PDF quedaron bloqueados por el límite de bytes, ahora informado con un motivo preciso. Se restauró el snapshot anterior antes de continuar. | 0 |
| [38481501579](https://github.com/mrvvergara-afk/Trabajo-Cerca-/actions/runs/38481501579) | Se comprobó el lector ampliado. Se extrajo texto de dos PDF escaneados y un formulario de una página; los avisos seguían sin fecha original comprobable o lectura completa. | 0 |
| [38482076134](https://github.com/mrvvergara-afk/Trabajo-Cerca-/actions/runs/38482076134) | Se leyó una imagen de Negrete y un PDF de tres páginas completos. Otro PDF de nueve páginas quedó parcial. Una comprobación adicional leyó las cuatro páginas del PDF escaneado observado anteriormente: `pages_read=4`, `complete_document=true`, sin truncado y confianza mínima 70. Su verificación siguió pendiente por fecha original ausente. | 0 |

El último respaldo durable, `6a92ff044797e2d743277a6ed27563d4c3e60cb8`, conserva **362 candidatos, 3.142 observaciones, 28 intentos, cuatro checkpoints, siete runs y dos recibos anteriores**. Los cuatro ciclos mantienen `paid_provider_calls=0` y conservaron el intercambio firmado previo cuando no hubo ofertas documentales aptas. No se actualizaron fechas originales ni sellos de verificación de ofertas a partir de una captura o un respaldo.

La evidencia de las pasadas está en [segundo resultado](../integrations/appdeploy/document-pilot-second-result-2026-10-13.json), [tercer resultado](../integrations/appdeploy/document-pilot-third-result-2026-10-13.json) y [resultado con OCR completo](../integrations/appdeploy/document-pilot-full-result-2026-10-13.json). También se observó un ciclo programado de `collect-direct` y del escritor `verify-publish` a las 23:05 UTC / 20:05 de Chile: ambos reportaron éxito. Esto acredita su ejecución, no publicaciones nuevas que el piloto no obtuvo.

## Programación y límites que permanecen

El workflow preparado tiene un piloto explícito `[document pilot]` en `repair/radar-audit-2026-10-11` y un job gratuito para el horario ya existente cuando la reparación esté revisada e integrada en `main`. GitHub ejecuta los cron de workflows desde la rama predeterminada: añadir el código únicamente a la rama de reparación no activa ese horario.

La app admite la prueba firmada del workflow exacto de este repositorio, tanto de la rama de reparación como del futuro productor de `main`; los datos del sobre y la firma deben corresponder a la misma rama. El código actual de `main` no emite ese lote. **No se integró ni modificó `main`**, que conserva `fab392b824e4100a4bba6dfe9289825297d24707`. La reparación está publicada en su rama independiente; `8b8c65665d7ddf4749b28965d7e648dc59bb76a0` incluye las correcciones comprobadas durante los pilotos.

La captura documental y su respaldo quedaron comprobados. Falta encontrar una oferta documental elegible para acreditar esa ruta completa hasta un ID nuevo en el feed. Para un horario permanente hace falta revisar la integración en la rama predeterminada o disponer de un ejecutor equivalente autorizado. No se creó un servicio alternativo ni se cambió una credencial para eludir esa condición.

Los canales exactos de varias OMIL y Radio Mininco siguen sin comprobar. El trabajo nuevo conserva los enlaces encontrados en fuentes primarias para verificarlos durante el recorrido real; no se presenta como una lista de perfiles ya validada. El contenido de Meta que exige acceso no se recupera únicamente con OCR. Los documentos mayores a cuatro páginas o con varios avisos siguen requiriendo una lectura completa y separación verificable. Tampoco se ha acreditado un backfill completo de 45 días para todas las fuentes.

Se comprobó [el Facebook municipal de Lumaco](https://www.facebook.com/municipalidadlumaco/) a partir del widget del [sitio oficial](https://munilumaco.cl/). El recorrido real confirmó además los enlaces a Facebook/Instagram de Renaico y Mulchén desde sus páginas municipales; no demuestra haber recuperado sus publicaciones laborales ni confirma perfiles dedicados de OMIL. El catálogo externo tiene ahora 34 entradas y mantiene 18 fuentes HTML admitidas. Se agregó la recuperación segura de enlaces embebidos y se excluyeron perfiles del desarrollador del sitio. Las pruebas rechazan widgets ambiguos o destinos externos. Los perfiles no se añadieron como objetivos pagos.

Se mantienen las ofertas históricas, las credenciales, los seis cron de AppDeploy y los horarios/cuotas de los proveedores preexistentes. No se contrataron servicios ni se activaron capturas pagas.
