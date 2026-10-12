# Piloto real y avance de publicación

Estado al preparar esta continuación: hay dos ofertas reales aptas y un respaldo durable confirmado. Todavía no se declara que esas ofertas estén visibles: se comprobará su ID mediante el SDK de la app.

## Primera ejecución real

- Run: [38260669958](https://github.com/mrvvergara-afk/Trabajo-Cerca-/actions/runs/38260669958), completado correctamente.
- Commit de reparación: `80eb105a345b0668528afcdfc9c2e416a6a43494`.
- Job `laboratory`: ejecutado; job de `main`: omitido.
- Se importaron los **26 artefactos históricos disponibles** de `main`, sin confiar en sus banderas de publicación.
- Fuente pública: primera página de búsqueda de Angol en Chiletrabajos. 112 enlaces examinados y **28 candidatos detectados**; la cobertura no se declara completa.
- Se comprobaron tres candidatos: **dos verificados** con JobPosting coincidente, plazo futuro y postulación; uno quedó pendiente por lugar de trabajo ausente o múltiple.
- 187 candidatos del histórico no se verificaron en este lote acotado.
- Llamadas a proveedores pagos: 0. Publicaciones confirmadas por el productor: 0, a la espera del recibo de AppDeploy.

## Respaldo confirmado

La rama `radar-state-laboratorio` quedó creada en **`4ac57d8b5776d254338c62aef853ec369c8902b7`**. Contiene el snapshot actual, la prueba firmada del lote, el diagnóstico y una versión de respaldo en `history/38260669958/`.

| Tabla | Registros conservados |
| --- | ---: |
| Candidatos | 190 |
| Observaciones | 2.722 |
| Intentos | 3 |
| Checkpoints | 1 |
| Runs | 1 |

SQLite ocupa 1.359.872 bytes; el comprimido, 226.111. El manifiesto guarda hashes de ambos y los conteos. El push está confirmado. No se reescribió historial ni se borraron ofertas.

Una segunda ejecución debe restaurar este snapshot y verificarlo antes de agregar nuevas observaciones. Se conservan también los commits anteriores y los snapshots por run ID.

## Persistencia frecuente sin aumentar trabajo con proveedores

La versión **`1791815781801`** del laboratorio cambia el único cron escritor `verify-publish` a `5,20,35,50 * * * *`. No añade un séptimo cron: AppDeploy admite como máximo seis.

Los pasos adicionales solo leen el lote firmado, guardan ofertas y recibos, y avanzan una página de hasta 40 registros de la DB. La recuperación/verificación que puede consultar proveedores se ejecuta únicamente cuando el `scheduledTime` corresponde a los **siete horarios originales**, minuto 35 de las horas 1, 5, 7, 9, 13, 17 y 21 de Chile. Un contexto ausente o inválido no dispara ese trabajo. Los otros cinco calendarios permanecen iguales.

Este ajuste del laboratorio permite completar la reconstrucción antes de que expire la verificación del lote. Conserva un único escritor del feed y no habilita Actors, IA, OCR, notificaciones o servicios nuevos. Un error de cuota de DB se propaga sin reintentos ocultos ni compra de capacidad.

## Comprobación de lectura

Se añadió la vista [operativa de lectura](https://trabajo-cerca-laboratorio-3ojgro.v2.appdeploy.ai/?radar-proof=1#operacion). Solo usa `api.get` del SDK: estado de ingesta, avance del feed y páginas públicas. En ese modo no consulta publicidad, no envía analítica y no ejecuta motores.

El observador de Actions usa un navegador del runner para leer esa vista, sin inventar un endpoint REST externo. Solo declara una publicación real si el feed está completo, el manifiesto coincide con el recibo y todos los IDs confirmados figuran en las páginas visibles. Un fallo de lectura permanece como fallo, no como cero publicaciones confirmado.

## Validaciones de esta continuación

- 46 pruebas Python, 8 del primer parche, 28 del feed, 19 de ingesta, 4 de checkpoints y 3 de horarios: **108 pruebas locales aprobadas**.
- La suite de horarios comprueba que las invocaciones adicionales mantienen exactamente los siete turnos originales con proveedores y respetan `scheduledTime` aunque el cron llegue tarde.
- Se prueban manifiestos distintos, IDs no visibles y errores de lectura: ninguno produce una confirmación falsa.
- AppDeploy devolvió `ready` para `1791815781801`, sin errores reportados de frontend, backend o red.
- QA conserva los tres casos de lectura y añade lectura del panel operativo; no se presentan resultados individuales que AppDeploy no haya devuelto.

Los cambios remotos quedan registrados en [live-observation-repair.json](../integrations/appdeploy/live-observation-repair.json). Este documento registra la primera prueba real y la preparación de la segunda. El resultado de publicación visible debe añadirse al terminar esa comprobación.

`main` y producción siguen sin integrar. La programación del productor externo, la sincronización de recibos con SQLite y la ampliación a otros verificadores siguen sujetas a revisión.
