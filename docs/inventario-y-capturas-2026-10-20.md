# Inventario, capturas OMIL y portales · 20 de octubre de 2026

App: https://trabajo-cerca-laboratorio-3ojgro.v2.appdeploy.ai/.
Rama de código: `repair/mulchen-captura-2026-10-17`.

## Resultado visible comprobado antes del nuevo lote

La prueba 39357141611 leyó el feed completo y cargó todas las tarjetas: 33 registros, 31 ofertas y 31 tarjetas de empleo. La portada comenzó con 7 tarjetas y mostró correctamente 31 como total; el total permaneció igual al paginar y recargar. El filtro de novedades volvió a las tarjetas anteriores sin pérdida. Ningún ID entró ni salió frente a la captura SDK previa de las 01:56 UTC. Es una comparación de dos momentos concretos, no una afirmación de inventario invariable durante todo el día.

La etiqueta de novedades mostró 8 incorporaciones de los últimos 7 días y 2 en las últimas 24 horas. Son incorporaciones previas ya existentes, no publicaciones nuevas obtenidas en esta prueba. Los tres IDs de Traiguén estaban presentes; el SDK confirmó su revalidación del 20 a las 00:50:37 UTC y la próxima para las 12:50:37 UTC. Esta última no se declara ejecutada por anticipado.

## Errores encontrados y reparación aplicada

1. La portada usaba la longitud de la página cargada como contador general. Ahora usa el total del manifiesto completo y separa tarjetas mostradas de ofertas publicadas.
2. Las novedades dependían de la visita y de tarjetas cargadas. Ahora tienen contador único global y por comuna en una ventana móvil de 7 días, aviso destacado y etiquetas por tarjeta; una oferta multicomuna no suma dos veces al total global.
3. Las ofertas externas desaparecían a las 24 horas de la comprobación, y las aprobadas al cumplir 45 días desde su publicación. Se separaron admisión y permanencia: los 45 días siguen siendo un requisito para admitir nuevos avisos; una oferta previamente aprobada permanece hasta su plazo real, cierre constatado o exclusión de calidad documentada. Una revisión técnica pendiente se muestra sin renovar la evidencia ni convertir candidatos en aprobados.
4. Se fabricaban plazos de 45 días cuando solo había formulario habilitado. Se eliminó esa fabricación. Los valores heredados que coinciden exactamente con esa fórmula se tratan como plazo no confirmado y quedan para revisión.
5. El recolector nativo no consultaba robots antes del HTML. Ahora comprueba la política antes de cada destino y redirección, con límites, caché y rechazo si la política es desconocida. También reconoce desafíos en español como el de Opción Empleo.
6. La selección de pocos índices y candidatos favorecía algunos portales. Se añadieron rotación por proveedor y comuna, RSS, enlaces JSON-LD y paginación, límites de ejecución y espera ante restricciones; no se cambió ningún cron.
7. La revisión individual real de Laborum detectó que el extractor tomaba la postulación de otro aviso recomendado. Se impidió ese cruce tanto en el extractor como en el receptor firmado. El formulario principal de Laborum se reconoce por su identidad y botón habilitado, incluidos Postularme y Postulación rápida. Las filas erróneas se conservaron como evidencia y no se entregaron al receptor.
8. La captura de inventario omitía campos necesarios para auditar fechas y postulación. El SDK conserva ahora esos campos públicos por ID, cuando existen.

Los cambios se aplicaron a la app. Versiones ready: 1792461874550 (inventario), 1792489805555 (postulación e inventario de evidencia) y 1792490035683 (botón de postulación rápida). Sin errores de frontend, backend o red reportados por AppDeploy; persisten dos advertencias previas de iconos PWA.

## Lo que demostraron las capturas y fuentes

Se leyeron directamente las diez imágenes aportadas y se conservaron hashes, campos visibles y límites, sin inventar URLs individuales, años ni fechas editoriales. La cuidadora de Traiguén tiene cierre explícito el 8-oct-2026; no se publica como vigente. El psicólogo de Nacimiento muestra 25 de septiembre sin año, por lo que no se atribuye año ni vigencia. Café Amelia y TENS de Lumaco requieren aún originales, fechas y datos faltantes; el TENS debe compararse con el aviso ya existente antes de contarlo como nuevo.

El enlace exacto **https://wof-chile.com/postular** abre públicamente y permite leer cinco cargos, requisitos y documentos. Agregar una barra final produjo 404: ese error de URL no representa ausencia de contratación. La raíz redirige a una pantalla de login; no se inició sesión. El formulario público indica temporada 2026–2027 y regiones de preferencia, pero eso no acredita fecha original ni faena asignada por cargo. No se enviaron formularios, correos, SMS ni postulaciones.

El navegador público pudo renderizar Laborum: el índice mostró **21 resultados**, frente al HTML inicial que solo pedía JavaScript. Esto prueba lectura y descubrimiento; no acredita 21 vacantes nuevas únicas. Se recuperaron originales individuales de Unimarc, Fashion’s Park y SMU, con fecha original 6, 16 y 13 de octubre y metadatos de empleador, Angol y plazo. Se contrastaron sus formularios sin presentar postulaciones. La captura inicial con enlaces erróneos está marcada como no aprobada para publicación. Los tres archivos originales se reutilizaron para la revisión corregida: no se volvieron a abrir para inflar métricas. Las capturas del usuario no incluyen URL individual: no se afirma identidad entre un aviso de Indeed y otro de Laborum solo porque tengan el mismo cargo o empresa. El título del aviso Unimarc es Cajero(a), mientras su descripción menciona Tesorero; se conserva el título literal de la fuente, sin inventar una conciliación entre ambos.

Indeed respondió 403; Computrabajo y Empleos Públicos impidieron obtener robots; LinkedIn no entregó una política interpretable en esa prueba; Opción Empleo mostró verificación de tráfico. Se registraron restricciones y no ausencia de ofertas. ChileTrabajos entregó enlaces individuales. Negrete RSS fue accesible pero incluyó permisos de venta, no una vacante verificada; Mulchén RSS respondió 500. No se repitieron los PDF agotados, OCR ni el renderizado restringido de Los Sauces y Nacimiento. Radio Mininco sigue pendiente de acreditar un canal oficial.

## Pruebas y respaldos

- 226 pruebas Python aprobadas, incluidas integridad de originales, antigüedad de captura y rechazo de postulación cruzada.
- 24 archivos de pruebas Node aprobados; las ampliaciones finales del verificador, receptor e inventario SDK también pasaron. No se añadieron pruebas que requieran servicios pagos.
- 39356145058: falló por una dependencia faltante del script de diagnóstico; la lectura SDK previa quedó respaldada. Se corrigió y la ejecución 39356375295 terminó correctamente.
- 39357141611: confirmó total, paginación, recarga, filtro y todas las tarjetas; respaldo durable `2c2f63b2b27f752a867ad03d1a6c0005e8366382`.
- 39401994040: capturó los tres originales de Laborum, preservados en `d5704078106d121a6368338b41f1b64397aae266`.
- 39403803408: el control previo detuvo la entrega al no reconocer el botón Postulación rápida. No se firmó ni publicó ese intento. Se amplió únicamente el patrón observado y se probaron las dos variantes.

El índice durable de 40 referencias y los históricos se conservaron. No se modificaron credenciales, main ni los seis crons nativos; no se contactó a instituciones ni se usaron proveedores pagos. Main permanecía en `fab392b824e4100a4bba6dfe9289825297d24707` en la comprobación de esta tanda.

## Pendientes concretos

La lectura pública renderizada de Laborum funciona, pero el ciclo continuo debe alimentar y consumir ese trabajo desde la cola vigente: la lectura estática nativa aún no sustituye al navegador para ese portal. Esta tanda deja un lector probado y un lote acotado; no declara resuelto un rastreo continuo completo de todos los portales.

Para las OMIL y redes falta recuperar originales concretos con fecha editorial completa, acreditar el lugar de trabajo y el empleador cuando no aparecen, y distinguir cerrados de abiertos. WOF necesita fecha y faena por cargo. Facebook/Instagram, índices bloqueados y canales sin acreditar permanecen limitados; no se evadieron sus restricciones. La mejora del acceso y extracción no garantiza por sí sola nuevas vacantes elegibles.

## Entrega del lote de Laborum

**Tres ofertas nuevas de portal confirmadas y publicadas. Cero publicaciones difíciles nuevas en esta tanda.**

El run [39404138293](https://github.com/mrvvergara-afk/Trabajo-Cerca-/actions/runs/39404138293) terminó correctamente. El receptor incorporó el lote a las 10:05:34 UTC, 07:05:34 de Chile. La lectura posterior confirmó el manifiesto `c9f1ad85-e57e-4f26-ab7e-651a1361301a`, los tres recibos y todas las tarjetas por ID.

| Cargo original | Empleador declarado | Comuna | Fecha original | ID confirmado |
|---|---|---|---|---|
| Cajero(a) con experiencia Unimarc Angol | Supermercados Unimarc | Angol | 06-oct-2026 | adee2128-1fb0-45ae-ab28-8bb8cf87313e |
| Cajero/a Asistente Integral – Temporada Navidad – Angol | Comercial Fashion´s park s.a. | Angol | 16-oct-2026 | 688c0421-4ed4-46e5-9592-694a2669fad7 |
| Auditor(a) - Relator(a) de Calidad e Inocuidad Alimentaria (Terreno) - Angol | SMU 1 | Angol | 13-oct-2026 | 6d27e85f-3aa2-44fc-9ac5-89c3fd0b5bb8 |

La comparación inmediata pasó de **31 a 34 ofertas publicadas**, con tres IDs añadidos y ninguno retirado.

La comparación de todo el periodo es distinta de la entrega inmediata. Frente al snapshot de las 01:56 UTC entraron cuatro IDs: los tres de Laborum y `free-149bb65066307aa45733b5f251ca3055f042eeeb`, Vendedor en Terreno de Manpowergroup, creado automáticamente a las 07:05 UTC desde Chiletrabajos. Este último ya estaba en la línea base previa a firmar Laborum, por lo que no se suma a las tres publicaciones de este lote ni se declara revisado por este lote firmado. Salió `9fc7362f-fb6e-41cf-ae38-68f016c257c5`, Inspector de Vibraciones de CMPC. Su ausencia por sí sola no acredita cierre del puesto. Debe contrastarse la decisión guardada y la interpretación del plazo sin hora de esa fuente antes de atribuirla a vencimiento. **La causa de esta salida queda pendiente de acreditar**, y no se afirma conservación de todos los IDs durante el día completo. No se modificó ningún campo compartido de los demás registros en esa comparación. Véase [diferencias-periodo-2026-10-20.json](evidence/diferencias-periodo-2026-10-20.json).
 Los 36 registros totales incluyen otros tipos y no se presentan como 36 vacantes. Los tres cargos de Traiguén siguen presentes. Se comprobaron 34 tarjetas al cargar todo, un total estable al paginar y recargar, y retorno desde el filtro de novedades sin perder las anteriores. La portada muestra 11 incorporadas en los últimos 7 días y 5 en las últimas 24 horas; únicamente tres corresponden al lote de esta entrega.

El estado inicial `stored_waiting_for_feed` no se contó como publicación. Solo se contabilizaron después de `ingestion_status: published`, `feed_complete: true` y presencia de las tarjetas. No se recontaron revalidaciones, candidatos ni cargos ya existentes.

Respaldo del lote firmado: `radar-state-laboratorio`, commit `7868e00051a22f1f63fa04cd882c1e93baede363`. Confirmación y capturas de inventario antes/después: `radar-document-reader-state`, commit `61ca6fc054810cf52913a92ad64759ff3532690a`. La firma se emitió una vez tras pasar todos los controles; el intento anterior se detuvo antes de firmar.

Evidencia local de resultados: [publicaciones-laborum-confirmadas-2026-10-20.json](evidence/publicaciones-laborum-confirmadas-2026-10-20.json), [inventario-final-2026-10-20.json](evidence/inventario-final-2026-10-20.json) y [revision-corregida-laborum-2026-10-20.json](evidence/revision-corregida-laborum-2026-10-20.json).
