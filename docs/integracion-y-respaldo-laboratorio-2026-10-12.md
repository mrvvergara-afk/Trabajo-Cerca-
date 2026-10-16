# Integración y respaldo del radar en el laboratorio

Continúa la tarea autorizada en `repair/radar-audit-2026-10-11`. No se integra en `main` ni se modifica producción.

- AppDeploy laboratorio: `trabajo-cerca-laboratorio-3ojgro`.
- Versión aplicada: **`1791813502255`**, sobre `1791805194792`.
- Estado nativo: `ready`, sin errores de frontend, backend o red en el snapshot QA.
- Rama de datos prevista: `radar-state-laboratorio`, en el repositorio público `mrvvergara-afk/Trabajo-Cerca-`.
- `main` comprobada en `fab392b824e4100a4bba6dfe9289825297d24707`.

## Resultado del cron real

El cron `verify-publish` de las **09:35 de Chile del 12 de octubre** terminó correctamente, después del arreglo del feed. Su contador de fallos volvió a cero. El error anterior de inventario incompleto dejó de producirse en ese ciclo.

Ese éxito demuestra avance del flujo, no la finalización del inventario ni publicaciones nuevas. El calendario de los seis crons se conserva. No se dispararon manualmente sus recolectores ni proveedores.

## Integración aplicada

Se añadió `backend/radar-ingestion.ts` y se integró en el único escritor programado del feed. AppDeploy lee un lote de la rama de datos de GitHub; no se añadió una ruta pública de escritura ni se introdujeron claves nuevas.

El productor es un job de GitHub Actions restringido a la rama de reparación. Firma el hash de los bytes exactos del lote mediante una prueba OIDC de GitHub con audiencia específica del laboratorio. El receptor comprueba firma RSA, emisor, repositorio e ID del propietario, rama, workflow, commit, run ID, audiencia y antigüedad.

La prueba es una **atestación histórica de ese lote**, no un token que autorice nuevas peticiones HTTP. Su ventana de emisión original es breve; se comprueba su firma y vinculación al contenido hasta un máximo de 24 horas. Cada oferta además necesita verificación reciente, publicación de origen no futura ni anterior a 60 días, plazo futuro, empresa, comuna real y medio de postulación. No se aceptan ofertas basadas solo en una búsqueda o una lectura con IA.

Solo se admiten páginas individuales de Chiletrabajos en este piloto. La identidad normaliza host, protocolo, barra final y parámetros de seguimiento de la misma vacante. Cada oferta externa se guarda en una tabla lógica acotada por identidad; un reintento recupera el registro y su ID, incluso si antes falló su incorporación al feed.

El feed incorpora esas fuentes por cambios y IDs guardados. Deduplica las vacantes individuales de Chiletrabajos frente a registros existentes y conserva los registros históricos de origen. **Guardar una oferta no se contabiliza como publicarla**: el recibo debe confirmar su identidad en un manifiesto visible y guardar el ID real de publicación.

Se añadió `GET /api/ops/radar-external` como diagnóstico de lectura para operadores. Devuelve el estado y los conteos del último lote, no pruebas firmadas, claves ni respaldos. El transporte de consulta continúa siendo el SDK de AppDeploy; no se inventa una URL REST externa para actualizar el estado de SQLite desde Actions.

## Respaldo durable preparado

El productor usa la API `backup` de SQLite para obtener una copia consistente, comprueba `integrity_check`, registra conteos de las cinco tablas de historial y calcula hashes del archivo y del comprimido.

El snapshot actual y sus versiones por run ID se guardan mediante commits normales en la rama de datos. No se utiliza force push, no se reescribe historia y no se borran versiones antiguas. Un conflicto detiene la escritura. Restaurar nunca sustituye un archivo existente; valida hashes, tamaños, esquema e historial antes de crear el destino.

La primera ejecución debe importar **todos los artefactos anteriores disponibles** de candidatos de `main` dentro del límite acotado: hasta 64 archivos y 16 MiB comprimidos. Si faltan archivos, hay más histórico que el límite, aparece un ZIP inseguro o falla la integridad, no inicializa un estado vacío. Las ofertas importadas requieren reverificación: se ignoran banderas antiguas `verified` y `published`.

Los backups tienen un techo de 16 MiB sin comprimir. Superarlo exige revisar el almacenamiento, conservando el estado; no activa almacenamiento pago ni poda el historial. El respaldo solo se declara durable cuando se confirma el push de la rama de datos.

## Piloto autorizado y alcance

El job `laboratory` se puede iniciar únicamente en la rama de reparación con un commit explícito `[lab pilot]`, o una ejecución manual que use la inicialización existente. No se ejecuta en `main` ni mediante `schedule`.

Usa runners estándar del repositorio público y el token efímero normal de Actions para la rama de datos. Sus permisos están limitados al job: escritura de contenidos, lectura de artefactos y emisión OIDC. No configura ni reemplaza secretos de usuario. El job de `main` mantiene su alcance anterior de lectura.

El piloto consulta una página de Angol y verifica hasta tres candidatos con presupuesto de 100 segundos. No ejecuta Apify, IA, OCR, búsquedas pagadas, notificaciones ni postulaciones. Si la fuente está bloqueada, conserva el respaldo, publica diagnóstico y termina con error; si faltan evidencias, informa cero ofertas aptas sin fabricar publicaciones.

**En este commit el piloto está preparado para iniciarse.** Los resultados de Actions, la creación de la rama de datos y las publicaciones reales deben registrarse después de la ejecución; no se presentan como resultados ya obtenidos.

## Pruebas ejecutadas

| Grupo | Resultado |
| --- | --- |
| Python radar, respaldo y productor | 42 aprobadas. |
| Primer parche AppDeploy | 8 aprobadas. |
| Feed paginado | 28 aprobadas. |
| Firma, ingesta, identidad y recibos | 19 aprobadas. |
| Checkpoints Actions | 4 aprobadas. |
| Total local | **101 aprobadas**, sin red, proveedores pagos ni escrituras reales en AppDeploy. |

Se probó la restauración de observaciones y checkpoints, corrupción de archivo, ZIP inseguro, conflicto de push, productor fuera de la rama autorizada, firma inválida, fork, otra audiencia/workflow, evidencia vencida, resultados parciales de SDK, recibo fallido, repetición sin duplicación e indisponibilidad de GitHub sin declarar publicaciones.

La primera validación nativa detectó cuatro errores de tipos al leer el arreglo de recibos desde una estructura genérica. Se sincronizó el snapshot almacenado y se corrigió únicamente el tipo de ese estado. El reintento pasó la validación y terminó `ready`, versión `1791813502255`.

El módulo y los diffs se entregan en [ingestion-repair.json](../integrations/appdeploy/ingestion-repair.json), [ingestion-repair.patch](../integrations/appdeploy/ingestion-repair.patch), [radar-ingestion.ts](../integrations/appdeploy/radar-ingestion.ts) y [public-feed.ts](../integrations/appdeploy/public-feed.ts). Las tres pruebas QA de lectura se conservaron, ajustando la comprobación de duplicados. El snapshot QA no devolvió estados individuales ni ID de grupo e2e; no se cuentan tres casos individuales aprobados.

## Pendientes antes de producción

- Confirmar resultados del piloto real, creación del respaldo y recepción del lote firmado.
- Esperar la construcción completa del inventario por los crons existentes; no acelerar tareas ni publicar un subconjunto para obtener un contador positivo.
- Si no hay ofertas aptas, estudiar sus motivos reales y ampliar adaptadores sin rebajar evidencia ni inventar plazos.
- Definir la sincronización de recibos de AppDeploy con SQLite por un transporte admitido. El productor mantiene publicaciones no confirmadas en cero.
- Programar el productor y habilitar producción solo después de revisión. Los schedules de GitHub dependen de la rama por defecto, que aquí permanece sin integrar.
- Mantener un solo escritor del feed y revisar límites de índice, cuotas, retención de materializaciones e identidad para fuentes distintas de Chiletrabajos. El SDK no ofrece transacciones/CAS y no se atribuyen esas garantías al parche.

Una consulta de red del entorno quedó esperando permiso y fue cancelada antes del piloto. No se repitió esa solicitud. La continuación utiliza las herramientas conectadas y la ejecución autorizada del proyecto en GitHub; no se cambiaron la política de red ni credenciales del entorno.
