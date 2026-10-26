# Laboratorio — actualización autorizada, 26 de octubre de 2026

Snapshot anterior: `1792967413347`. Versión final: `1792976457555`.

Cambios: circuito administrativo acotado, deduplicación contra catálogo externo incluso para candidatos ya verificados por el cron anterior, regla que diferencia requisitos funcionales de evidencia geográfica y banner móvil en una columna con imagen superior, texto y CTA accesibles. Se conservaron imágenes, promociones y los siete crons.

AppDeploy informó compilación válida y ready. Su primera lectura pública devolvió 503 inventario en preparación. La consulta pública posterior respondió HTTP 200 en las cuatro páginas y recuperó los 73 registros. Se confirmó TC-001 y TC-002 con sus IDs administrativos; TC-004 tiene una publicación equivalente y TC-003 todavía no tiene publicación individual confirmada.

Último inventario completo previo: 73 registros, 71 ofertas. Chiletrabajos y variantes: 52; Laborum: 8; BNE: 2; Traiguén: 3; Mulchén y OMIL: 2; CMPC: 1; LinkedIn: 1; Computrabajo: 1; Lumaco: 1. Son registros observados, no captación nueva demostrada por este despliegue.

Causas comprobadas: respuestas Laborum 403; robots/acceso no comprobable en consultas a LinkedIn y Computrabajo; automatización social deshabilitada por política de costo; documentos municipales con lectura local pendiente. Opción Empleo es agregador y requiere fuente original. La integración en código no prueba productividad ni acceso estable.

No se habilitaron servicios pagados, pagos comerciales ni proveedores de scraping/OCR remoto. No se fusionó main ni se modificaron masivamente datos.

Causa real TC-003: el texto de la fuente contiene «Disponibilidad para trabajar en terreno», que el extractor interpretaba como lugar no acreditado. Se conserva el JobPosting público con Angol, plazo y postulación en `tests/fixtures/tc003-public-jobposting-2026-10-26.json`. La excepción se limita a la expresión exacta terreno sin topónimo; terreno en Santiago y Lugar de trabajo: Santiago siguen bloqueados. Pasaron 20 pruebas de adaptadores y 18 del circuito. No se presenta esto como publicación de TC-003.

El cron de las 00:50 UTC informó dos entradas bloqueadas por conciliación y una esperando catálogo. Debe consultarse con una sesión administrativa autorizada; no se inventa el motivo individual ni se fuerza su publicación.

CI anterior del paquete visual y circuito: https://github.com/mrvvergara-afk/Trabajo-Cerca-/actions/runs/40251210258 (411 pruebas Node, 245 Python, build/TypeScript/browsers aprobados). La regresión real TC-003 se agregó después.

Comprobación directa de la aplicación desplegada con Chromium: 360, 390 y 430 px muestran banner de aproximadamente 239 px, imagen decodificada, titular y CTA dentro del contenedor; escritorio 1440 px: banner 172 px. Sin desbordamiento ni errores JavaScript. Las capturas y resultados están en `/workspace/published-evidence-2026-10-26/live/`. El navegador del entorno usa excepción TLS solo en el contexto de pruebas por la CA del proxy; no se cambió TLS ni seguridad de la aplicación. La lectura HTTPS del catálogo con el cliente HTTP del entorno también fue correcta.
