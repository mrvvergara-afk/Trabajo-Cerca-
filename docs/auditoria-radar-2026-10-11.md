# Auditoría y reparación preparada del radar laboral

Fecha de referencia: 11 de octubre de 2026, America/Santiago.
Repositorio: `mrvvergara-afk/Trabajo-Cerca-`.
Base auditada: `fab392b824e4100a4bba6dfe9289825297d24707`.
Rama de reparación: `repair/radar-audit-2026-10-11`.

## Resultado

**La detección en GitHub no conduce a una publicación: falta la ingesta hacia AppDeploy y el verificador original nunca produce el estado verificado.** Aumentar de 30 a 60 comprobaciones y ampliar el timeout no añade ese enlace.

Se preparó una reparación del radar externo y un parche independiente para el backend de AppDeploy. Las pruebas son locales y usan ofertas ficticias. No se integraron cambios en `main`, no se desplegó una app, no se eliminaron ofertas históricas, no se modificaron credenciales y no se iniciaron servicios de pago.

## Evidencia real leída

[Actions: ejecución 38181116967](https://github.com/mrvvergara-afk/Trabajo-Cerca-/actions/runs/38181116967), job `114593689525`, commit base:

| Etapa | Resultado registrado |
| --- | --- |
| Radar municipal/RSS | 2 candidatos; bloqueos HTTP 403 en Govern1 y Angol; error de codificación en un PDF de Collipulli. |
| Backfill RSS | 865 elementos examinados, 0 candidatos, 0 errores de transporte. |
| Chiletrabajos directo | 107 candidatos, 0 errores. |
| Verificación | 60 comprobados; 5 `review_ready`; 55 pendientes; 0 verificados; 0 publicados. |
| Motivos de verificación | 5 ubicaciones estructuradas, 45 ubicaciones no confirmadas explícitamente, 10 sin comuna objetivo. |
| Apify | Autenticación y acceso al Actor correctos; 0 ejecuciones anteriores encontradas; 0 Actors nuevos iniciados. |
| Resultado de Actions | `success`, aunque ninguna publicación estaba implementada. |

Se leyó el snapshot `1791755107051` de la app accesible [Trabajo Cerca Laboratorio](https://trabajo-cerca-laboratorio-3ojgro.v2.appdeploy.ai/) y el estado de sus seis crons. Los últimos estados aparecían como `success`, sin errores de frontend/backend devueltos por la herramienta.

**No se consultaron rutas que ejecutan recolectores, IA, OCR o reconstrucciones del feed.** No se leyó directamente su base de datos: el volumen actual del backlog, el inventario total y la cantidad real de publicaciones automáticas de AppDeploy siguen sin medirse. El estado de un cron no demuestra que haya publicado ofertas.

## Errores encontrados y reparación

| Hallazgo | Efecto | Cambio y comprobación |
| --- | --- | --- |
| README y scripts limitan el radar a artefactos; no hay código ni ruta de ingesta AppDeploy. | Detectar candidatos no modifica el inventario de la app. | `publication_queue.json` prepara un contrato con clave idempotente. El publicador sigue ausente y se informa como `not_connected`; no se simula una publicación. |
| `verified` y `published` eran contadores constantes; solo se producía `review_ready`. | Ningún registro podía llegar al siguiente estado automáticamente. | Verificación conservadora de páginas individuales, JSON-LD del mismo aviso, comuna real única, empresa, fecha original, fecha límite futura y postulación. Campos incompletos quedan pendientes. |
| Patrones raw con doble escape en RSS, archivos y documentos. | Las comunas no coincidían; se perdían páginas de archivo y se intentaba recorrer binarios. | Filtros corregidos, normalización de tildes y parser HTML; pruebas con Purén, `/page/2`, avisos antiguos y PDF. |
| URLs no ASCII se enviaban sin codificación. | Fallo en enlaces como `IMPLEMENTACIÓN`. | Canonización y codificación de rutas manteniendo paginación. Los 403 se registran, no se evaden. |
| El verificador solo abría `chiletrabajos_direct.json`; Apify se ejecutaba después. | Candidatos municipales, RSS y sociales quedaban fuera del flujo. | Todas las entradas se persisten antes de verificar. Las fuentes sin adaptador propio permanecen pendientes y visibles, sin consumir peticiones de verificación. |
| Deduplicar por URL conservaba únicamente la primera comuna buscada. | Una pista de búsqueda equivocada podía bloquear una oferta. | Se conservan todas las consultas y se toma la comuna del JobPosting específico. Menús, empresa y pies de página no confirman lugar de trabajo. |
| La selección sin checkpoint repite los primeros candidatos; puede no terminar con una comuna desconocida. | Los 47 candidatos fuera del lote de 60 pueden no conseguir turno; entradas imprevistas causan bloqueos. | Selección finita, intentos persistentes, prioridad a nunca comprobados, rotación y reverificación después de 24 horas. |
| Efectos al importar scripts y límites sin validación. | Dificultaban las pruebas y permitían límites inválidos. | Funciones importables sin peticiones, validación previa, presupuestos por etapa y tiempo reservado a verificación. |
| JSON sobrescrito y runners efímeros; no se restauraba estado. | Se pierde historial y posición entre ejecuciones; los artefactos caducan en 7 días. | SQLite con observaciones e intentos, JSON atómico, importador y restauración. Si el checkpoint falta o expiró, no se reinicia silenciosamente. Falta persistencia durable para operación. |
| `push.paths` omitía tres recolectores. | Sus cambios no disparaban la validación esperada. | Cobertura de scripts, pruebas e integración; esta rama no ejecuta recolectores. Pruebas antes del pipeline y concurrencia por rama. |
| El probe Apify ignoraba `APIFY_ACTOR_ID`. | Podía validar un Actor distinto al consultado después. | Probe y lector usan el mismo Actor; errores sin valores de tokens. Actors bloqueados incluso con la bandera activada. |
| AppDeploy enriquece el primer lote sin ordenar intentos y solo lee una página de 200 candidatos. | Candidatos fallidos pueden monopolizar el lote y otros quedan fuera. | Parche preparado con fecha de intento y cursor de una página por cron, sin elevar lotes. |
| AppDeploy usa `addedIds.length` como inserciones exitosas; el SDK devuelve ID o `null` por registro. | Cierra candidatos cuya oferta no se guardó. | Solo cierra posiciones con ID real. La prueba reproduce el error con `[null, 'job-two']` y comprueba la corrección. |
| AppDeploy ignora booleanos de `db.update`. | Un fallo se contabiliza como verificación exitosa. | Parche comprueba escrituras; el fallo no produce contadores de éxito. |
| El feed se reconstruye con los primeros 200 registros de cada tabla, ignorando `nextToken`. | Puede ocultar ofertas y reemplazar el feed por un subconjunto. | Parche retiene el feed si hay páginas sin leer. Falta la construcción incremental del snapshot completo. |

## Límites y automatización de AppDeploy

El cron de enriquecimiento llama `enrichRadarCandidates(6)` seis veces al día: hasta 36 intentos/día. `verify-publish` llama `processPendingOffers(8)` siete veces al día: hasta 56 intentos/día. El endpoint manual usa lotes de 10; la descripción del último despliegue no coincide con los lotes de los crons.

No se ampliaron esos valores. Primero deben medirse entradas diarias, cola, latencia, distribución por fuente, errores y escrituras exitosas. El parche evita repetir el mismo frente de cola y sustituye la lectura de hasta diez páginas por una página con cursor.

La verificación actual de la app acepta algunos fallbacks sociales/indexados, a veces sin comprobación independiente de vigencia, y busca comunas en texto general de página. Requiere revisión antes de confiar en publicaciones reales. No se debilitó la verificación externa para aumentar el contador.

## Pruebas ejecutadas

| Verificación | Resultado |
| --- | --- |
| `python -m unittest discover -s tests -v` | 31 pruebas aprobadas. |
| `node tests/appdeploy-repair.test.mjs` | 8 pruebas aprobadas sobre funciones originales y parcheadas, con DB y transporte simulados. |
| `node tests/workflow-checkpoint.test.mjs` | 4 pruebas aprobadas: checkpoint faltante, expirado, selección por rama y primera importación histórica. |
| `python -m compileall -q scripts tests` | Sintaxis Python correcta. |
| Parseo YAML de Actions | Estructura, rama permitida, permisos de lectura, inicialización y restauración comprobados. |
| Parche AppDeploy | Hash del snapshot y anclas únicas comprobados; diff local consistente con el JSON. |
| `git diff --check` | Sin errores de espacios o conflictos. |

Total: **43 pruebas aprobadas**, sin consultas reales a fuentes laborales, IA, Actors ni escrituras en AppDeploy.

El recorrido local completo usa un aviso ficticio: recolector → persistencia → verificación → cola. Una ejecución vacía conserva inventario y clave idempotente. Se prueban cierres, vencimientos, fechas futuras, ubicaciones de otro país, redirecciones a otro aviso, errores HTTP, escrituras fallidas y presupuesto agotado.

Las pruebas del backend quitan anotaciones TypeScript en Node y ejecutan funciones con dobles del SDK. No equivalen a la compilación completa de AppDeploy, una ejecución de Actions remota ni una publicación real.

## Lo que falta para publicar automáticamente de verdad

1. **Integración:** versionar el backend revisado y definir una ingesta autenticada con transporte soportado por AppDeploy. Ese enlace no existe en el repositorio. No se creó ni cambió una credencial.
2. **Idempotencia y persistencia confirmada:** mapear el contrato a ofertas internas, comprobar el ID guardado y marcar publicado solo tras confirmarlo. Faltan índice de identidad y recuperación de escrituras parciales; un HTTP 200 no sustituye esa confirmación.
3. **Feed completo:** construir una generación por checkpoints que incluya todas las páginas, respete cuotas y se promueva al terminar. El parche conservador detendrá reconstrucciones de inventarios de más de 200 registros hasta disponer de ese mecanismo.
4. **Almacenamiento durable:** respaldar candidatos anteriores, importar el histórico disponible y definir el checkpoint permanente. Los artefactos de 7 días son protección temporal; RSS tampoco acredita cobertura completa de 60 días.
5. **Fuentes reales y vigencia:** medir cuántos avisos de Chiletrabajos aportan la evidencia requerida y crear verificadores para OMIL, municipios, RSS y redes públicas. Bloqueos y datos insuficientes siguen pendientes. No se habilitaron Actors ni proveedores de pago.
6. **Validación aislada antes de activar:** refrescar el snapshot, compilar el backend, reconciliar las pruebas y probar con almacenamiento de validación autorizado. Medir oferta guardada, feed visible, repetición sin duplicados y conservación del histórico tras un fallo.

## Revisión y siguiente paso

Revisar los cambios de esta rama, el contrato de la cola y el parche AppDeploy. Acordar después la persistencia, la política de verificación y el transporte de ingesta.

Esta entrega no autoriza desplegar ni integrar en `main`. No se inició una ejecución de Actions durante la auditoría. El backend necesita una revisión aparte de su parche y limitaciones.
