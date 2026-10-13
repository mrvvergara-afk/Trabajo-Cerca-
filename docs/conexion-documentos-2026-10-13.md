# Conexión del lector gratuito de documentos — 13 de octubre de 2026

La app indicada por el usuario recibió la versión **1791924889565**, estado `ready`, sin errores reportados de frontend, backend o red: https://trabajo-cerca-laboratorio-3ojgro.v2.appdeploy.ai/. El lector externo y su workflow están implementados y probados localmente en la rama de reparación. **El piloto real todavía no se ejecutó**: la herramienta de GitHub devolvió `user cancelled MCP tool call` al crear el commit, antes de actualizar la rama remota.

Por ello no se atribuyen publicaciones nuevas de afiches, PDF, Facebook o Instagram a esta continuación. El aviso de BNE documentado en la [entrega anterior](continuacion-fuentes-regionales-2026-10-13.md) conserva su comprobación histórica separada.

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

Los cambios nativos incrementales están en [document-cycle-repair.json](../integrations/appdeploy/document-cycle-repair.json); la implementación y sus comprobaciones previas están en [document-pipeline-preflight.md](../integrations/appdeploy/document-pipeline-preflight.md).

## Pruebas y comprobaciones

**239 pruebas locales aprobadas: 101 Python y 138 Node.** Se ejecutaron la suite completa de Python, todas las suites Node y `git diff --check`. Incluyen OCR/PDF real con archivos ficticios, confianza baja, lectura parcial, vencimiento, fecha original, vínculo entre artículo y archivo, teléfonos ambiguos, conservación de dos históricos, idempotencia y reverificación.

También se comprobaron la exportación de trabajo sin fecha inventada, el cursor que no queda atascado en un PDF, la rama/workflow/subject/carga de las pruebas OIDC y la firma de los respaldos históricos. No se insertaron avisos ficticios en la app ni se iniciaron proveedores pagos.

AppDeploy reportó `ready`. No devolvió un listado individual de pruebas E2E; ese estado no sustituye la prueba del productor externo ni una publicación real por ID. La suite de GitHub sobre estos cambios y el piloto documental están pendientes del guardado remoto cancelado.

La comprobación local de lectura mediante Chromium se detuvo en el sandbox del proceso (`setsockopt: Operation not permitted`), antes de producir una lectura válida. No se usó ese intento como evidencia de acceso o publicación. El runner preparado en GitHub usa el mismo transporte frontend soportado que pasó en las comprobaciones anteriores. Los resultados y límites de esta entrega quedan en [document-cycle-observation-2026-10-13.json](../integrations/appdeploy/document-cycle-observation-2026-10-13.json).

## Programación y límites que permanecen

El workflow preparado tiene un piloto explícito `[document pilot]` en `repair/radar-audit-2026-10-11` y un job gratuito para el horario ya existente cuando la reparación esté revisada e integrada en `main`. GitHub ejecuta los cron de workflows desde la rama predeterminada: añadir el código únicamente a la rama de reparación no activa ese horario.

La app admite la prueba firmada del workflow exacto de este repositorio, tanto de la rama de reparación como del futuro productor de `main`; los datos del sobre y la firma deben corresponder a la misma rama. El código actual de `main` no emite ese lote. **No se integró ni modificó `main`**, que conserva `fab392b824e4100a4bba6dfe9289825297d24707`. La rama remota de reparación sigue en `b9c570148e604c39b9e9f75936a59947552952b9` tras la cancelación.

Para finalizar la comprobación falta guardar la reparación en GitHub, ejecutar el piloto gratuito, revisar los motivos de cada documento y comprobar los nuevos IDs si hay ofertas elegibles. Para un horario permanente hace falta revisar la integración en la rama predeterminada o disponer de un ejecutor equivalente autorizado. No se creó un servicio alternativo ni se cambió una credencial para eludir esa condición.

Los canales exactos de varias OMIL y Radio Mininco siguen sin comprobar. El trabajo nuevo conserva los enlaces encontrados en fuentes primarias para verificarlos durante el recorrido real; no se presenta como una lista de perfiles ya validada. El contenido de Meta que exige acceso no se recupera únicamente con OCR. Los documentos mayores a cuatro páginas o con varios avisos siguen requiriendo una lectura completa y separación verificable. Tampoco se ha acreditado un backfill completo de 45 días para todas las fuentes.

Se comprobó un canal concreto: [la municipalidad de Lumaco](https://munilumaco.cl/) incluye un widget de Facebook cuyo parámetro `href` apunta a [municipalidadlumaco](https://www.facebook.com/municipalidadlumaco/). Se registró como canal municipal, sin asumir que sea un perfil dedicado de OMIL. La lectura del widget fue limitada por la fuente y no acredita acceso a los avisos. El catálogo externo tiene ahora 32 entradas y mantiene 18 fuentes HTML admitidas. Se agregó la recuperación segura de ese enlace embebido y se excluyeron perfiles del desarrollador del sitio, como el enlace ajeno a empleo encontrado en el pie de Renaico. Las pruebas comprueban un único perfil literal y rechazan widgets ambiguos o destinos externos.

Se mantienen las ofertas históricas, las credenciales, los seis cron de AppDeploy y los horarios/cuotas de los proveedores preexistentes. No se contrataron servicios ni se activaron capturas pagas.
