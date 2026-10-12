# Recepción y publicación real del piloto de laboratorio

Este documento continúa los informes de auditoría y piloto. Los resultados anteriores describen sus respectivos commits; este cierre registra las comprobaciones posteriores. Se mantiene `main` en `fab392b824e4100a4bba6dfe9289825297d24707`, sin integrar ni cambiar producción.

**Resultado comprobado a las 18:12 UTC: dos ofertas reales recibidas y guardadas en AppDeploy; cero publicaciones visibles confirmadas.** El rechazo del lote quedó resuelto. El feed completo todavía recorre el histórico; el éxito de recepción no se presenta como éxito de publicación.

## Errores y cambios de la reparación completa

| Error encontrado | Cambio realizado y evidencia |
| --- | --- |
| RSS y archivos usaban patrones con doble escape; URLs con tildes fallaban. | Patrones, normalización y codificación corregidos; pruebas de comunas, paginación y binarios. Los HTTP 403 se conservan como fallos, sin evasión. |
| El verificador solo tomaba un archivo y nunca producía `verified`. | Todas las fuentes entran en el inventario. El adaptador de Chiletrabajos exige la página individual y su JobPosting coincidente, empresa, comuna real única, fecha, plazo futuro y postulación. El piloto verificó dos ofertas reales. |
| Lotes repetían los primeros candidatos; las pistas de búsqueda podían confundirse con ubicación real. | Intentos, selección finita, rotación, reverificación y todas las pistas quedan persistidos. La comuna procede del aviso individual, no de menús o consultas. |
| Actions generaba JSON en un runner efímero sin restaurar historial. | SQLite conserva candidatos, observaciones, intentos y checkpoints. Snapshot consistente, hashes, verificación de integridad y commits normales en la rama de datos. La segunda ejecución restauró y continuó 190 candidatos. |
| No había enlace entre candidatos de GitHub y ofertas de AppDeploy. | El laboratorio recibe un lote firmado, valida evidencia y guarda por identidad idempotente. La lectura real confirmó dos ofertas guardadas. Publicar requiere además un ID visible en el feed completo. |
| El sujeto GitHub real incluía IDs inmutables y era rechazado. | Se aceptan exclusivamente las dos variantes exactas del productor autorizado; las 21 pruebas de ingesta mantienen el rechazo de forks, otras ramas, firmas, audiencias e IDs. |
| AppDeploy contaba arreglos de inserción como éxitos e ignoraba resultados parciales de actualización. | Se comprueba cada ID y booleano del SDK; fallos no cierran candidatos ni producen recibos exitosos. Las pruebas reproducen inserciones `null` y actualizaciones fallidas. |
| El feed ignoraba páginas después de los primeros 200 registros. | Construcción por checkpoints, páginas inmutables y promoción únicamente al completar el inventario. Cursor ligado a una generación; lecturas sin reconstrucción. La primera construcción aún no terminó en la comprobación real. |
| Faltaban disparadores de scripts, control de checkpoint y separación de la rama de reparación. | Workflow con cobertura de scripts/pruebas, restauración obligatoria, concurrencia y piloto explícito aislado. No se modificó el workflow ejecutado por `main`; el productor de esta rama no tiene schedule activo. |
| El piloto podía depender de proveedores pagos y seis crons limitaban un escritor nuevo. | El piloto usa páginas públicas y bloquea Actors. El único escritor existente avanza DB cada 15 minutos; las tareas que pueden consultar proveedores conservan sus siete turnos originales. No se añaden crons ni servicios pagos. |

Los detalles y el estado inicial están en [la auditoría](auditoria-radar-2026-10-11.md); los parches versionados y los informes de aplicación distinguen lo preparado de lo aplicado en cada etapa. Se conservaron ofertas y respaldos históricos, sin modificar credenciales ni integrar en producción.

## Bloqueo real encontrado después del piloto

La [lectura 38269245832](https://github.com/mrvvergara-afk/Trabajo-Cerca-/actions/runs/38269245832), a las 15:18 UTC, devolvió `batch_rejected`, motivo `Untrusted GitHub producer`: cero ofertas recibidas y cero publicaciones. El feed seguía en construcción, con 19 elementos preparados y otra página de `radar_jobs` pendiente.

La firma del lote se había comprobado antes de ese rechazo. Al contrastar sus claims públicos, emisor, repositorio, IDs de propietario/repositorio, rama, workflow, commit y run coincidían. El sujeto real era `repo:mrvvergara-afk@291955988/Trabajo-Cerca-@1411752840:ref:refs/heads/repair/radar-audit-2026-10-11`; el receptor solo admitía la variante histórica sin IDs.

Se admiten ahora exclusivamente esas dos variantes exactas del mismo productor. Se mantienen la firma RSA, la audiencia vinculada al hash de los bytes, los IDs inmutables, el workflow, la rama y las ventanas temporales. Cambiar cualquier ID, nombre o rama sigue rechazado. No se cambió la configuración OIDC de GitHub ni credenciales.

El arreglo se aplicó en la versión **`1791828227760`** del laboratorio. AppDeploy devolvió `ready`, sin errores reportados de frontend, backend o red. El diff reproducible está en [github-subject-repair.json](../integrations/appdeploy/github-subject-repair.json).

El [monitor 38266447346](https://github.com/mrvvergara-afk/Trabajo-Cerca-/actions/runs/38266447346) terminó su ventana de dos horas sin confirmar IDs visibles y reportó error. No se convirtió ese fallo en una publicación exitosa ni se guardaron recibos ficticios.

La lectura posterior al arreglo, [38289365527](https://github.com/mrvvergara-afk/Trabajo-Cerca-/actions/runs/38289365527), terminó correctamente. El SDK devolvió `stored: 2`, `published: 0`, `stored_waiting_for_feed`, sin rechazo, lote del run `38264847681` y commit de datos `d9a1381003b11fe7592354092e16c92b0ad369d7`. El feed tenía 60 elementos preparados en dos páginas, continuaba en `radar_jobs` y conservaba su cursor a otra página. No había manifiesto completo visible.

El cron de las 18:05 UTC terminó correctamente con el receptor corregido. La construcción continúa por checkpoints de hasta 40 registros evaluados, sin publicar un inventario parcial ni borrar el histórico. No se conoce todavía el total restante de las tablas de AppDeploy; no se inventa un plazo de finalización. Los contadores y el cursor de avance se consultan en la [vista operativa de lectura](https://trabajo-cerca-laboratorio-3ojgro.v2.appdeploy.ai/?radar-proof=1#operacion).

## Persistencia real comprobada

La [segunda ejecución 38264847681](https://github.com/mrvvergara-afk/Trabajo-Cerca-/actions/runs/38264847681) restauró el snapshot anterior, comprobó su integridad y agregó nuevas observaciones. Volvió a detectar 28 candidatos y mantuvo las mismas dos ofertas aptas. No se ejecutaron proveedores pagos.

La rama de datos avanzó por fast-forward de `4ac57d8b5776d254338c62aef853ec369c8902b7` a **`d9a1381003b11fe7592354092e16c92b0ad369d7`**, conservando ambas versiones y los respaldos por run ID.

| Tabla | Registros después de restaurar y continuar |
| --- | ---: |
| Candidatos | 190 |
| Observaciones | 2.750 |
| Intentos | 6 |
| Checkpoints | 1 |
| Runs | 2 |

SQLite: 1.376.256 bytes; archivo gzip: 226.970. El manifiesto confirma SHA-256 del archivo comprimido `e0a48c7cf5aa050370b150abd81990a4de96d100d170a02a4cea5342a9979815` y de SQLite `3bf22ca47ce29df575928f535c9b4988d17c7197feb8ab740899e6db4f0b111f`.

Los recibos confirmados pueden añadirse a SQLite y al respaldo sin cambiar el estado que permite reverificar las ofertas. Solo se acepta un recibo si su ID es visible, coincide el manifiesto completo y la URL de origen coincide con la verificación del candidato.

## Pruebas del receptor y observación

Se ejecutaron 49 pruebas Python y 21 pruebas de ingesta. Los otros grupos ya comprobados son: primer parche 8, feed 28, checkpoints 4 y calendario 3; **113 pruebas locales** en total. Las pruebas de ingesta agregadas reproducen el sujeto real con IDs y rechazan variantes de otro propietario, repositorio o rama.

El observador conserva ahora el motivo de rechazo y el avance del inventario. Una [lectura puntual](../.github/workflows/laboratory-observation.yml), con permisos de contenidos de solo lectura, permite revisar el laboratorio sin esperar al final del monitor. No consulta proveedores ni modifica ofertas o respaldos.

## Pendientes para operación

- Terminar la primera construcción completa del feed, confirmar los IDs públicos de las dos ofertas y guardar sus recibos reales en el respaldo. La recepción ya está confirmada; la visibilidad sigue pendiente.
- Comprobar estabilidad de esos IDs al repetir el mismo lote, conservando las ofertas históricas de origen.
- Revisar el calendario del productor antes de automatizarlo en la rama por defecto. GitHub no ejecuta schedules de esta rama de reparación.
- Ampliar y auditar verificadores para fuentes distintas de Chiletrabajos; los bloqueos HTTP y evidencias incompletas se conservan como pendientes.
- Revisar cuotas y retención de las versiones del feed y del respaldo antes de operación sostenida. La implementación mantiene un escritor y no atribuye garantías de transacción a sus llamadas legacy del SDK.

No se integrará esta rama en `main` ni se activará producción sin revisar estos resultados.
