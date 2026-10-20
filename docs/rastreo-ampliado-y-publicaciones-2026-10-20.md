# Rastreo ampliado y publicaciones comprobadas — 20 de octubre de 2026

Aplicación: https://trabajo-cerca-laboratorio-3ojgro.v2.appdeploy.ai/.
Rama exclusiva: `repair/mulchen-captura-2026-10-17`.

## Resultado visible

**15 avisos nuevos confirmados** por receptor firmado, feed SDK completo y tarjetas públicas: **1 municipal de OMIL Mulchén y 14 de Laborum/Chiletrabajos**. Una revalidación CMPC adicional conserva su ID y no se cuenta como nueva. La prueba [39515321623](https://github.com/mrvvergara-afk/Trabajo-Cerca-/actions/runs/39515321623) terminó correctamente a las 23:34 UTC. Se comprobaron las cuatro páginas SDK y las 50 tarjetas, incluida paginación, vuelta del filtro de novedades y recarga con total estable. Las 50 son inventario público con calidad heredada pendiente, no 50 nuevas vacantes auditadas. La línea base inmutable de esta ampliación es `docs/evidence/inventario-antes-ampliacion-2026-10-20.json`, tomada por SDK el 20 a las 11:55:54 UTC: 36 registros, 34 tipados como oferta. Es inventario heredado, no 34 vacantes nuevas auditadas. También se conserva la línea base del 19 y su CSV; ninguna se reemplaza.


El snapshot final tiene **52 registros / 50 tipados como oferta** frente a 36/34 de la línea base. Entraron 17 IDs y salió uno: 15 pertenecen a cargos revisados nuevos, uno es otro representante de la misma oferta TENS 3902931 y otro procede del colector nativo de Layner, no incluido en los 15 por posible solapamiento pendiente. El TENS anterior no se perdió ni venció: la misma URL individual sigue visible bajo otro ID; el motivo técnico de elección no se atribuye por conjetura. El contador de novedades se corrige además para conservar su incorporación acreditada el 15 de octubre o antes, sin cambiar la fecha editorial ni los registros fuente.

El [CSV por ID](evidence/diferencias-ampliacion-2026-10-20.csv), el [inventario](evidence/inventario-tras-ampliacion-2026-10-20.json), las [tarjetas](evidence/tarjetas-tras-ampliacion-2026-10-20.json) y la [evidencia de entregas](evidence/publicaciones-ampliacion-2026-10-20.json) conservan el detalle. Los respaldos originales están en `radar-document-reader-state`, commit `c3bd50b4f263806c6e3ac944030f2cd3a5884614`, `history/39515321623-1/`; la captura CMPC de este run está en `history/39515321623-0/`. Los cinco intercambios nuevos y el primer lote recuperado constan en los recibos JSON, con sus commits inmutables.

| Cargo nuevo | Comuna | ID en la app |
| --- | --- | --- |
| Práctica Profesional Contador Auditor - Nacimiento | Nacimiento | 361dab2c-87ef-4bce-9bda-ef731822244d |
| TECNICO EN TELECOMUNICACIONES ANGOL (MOVISTAR) | Angol | bdaed372-0383-4771-9c3e-d4a80207d823 |
| Promotor(a) Full Time Martes a Sábado Angol Falabella -TOP | Angol | 1c23fbb3-3317-4e97-86bd-8db6827af3c4 |
| Encargado Calidad para AIF - Angol | Angol | 4ba4e5d1-8556-4b33-8304-329a35184274 |
| Jefe de Asesoría - Angol | Angol | af6e1169-8ad8-4e56-9d46-bf5f52316a8c |
| Geomensor - Angol | Angol | 115bd0ce-cd60-4551-94c7-d02cd28fcd42 |
| Encargado Ambiental y Participación Ciudadana para AIF - Angol | Angol | 9e30fb6a-c41e-4b8a-814c-440f0da08ca1 |
| Prevencionista de Riesgos para AIF - Angol | Angol | cb724831-6a31-4fbf-9d8c-c067596f9237 |
| Laboratorista Vial Clase B para AIF - Angol | Angol | 1318f06f-b125-429c-bf9f-1cbbc6413dbb |
| Cajero(a) con experiencia Unimarc Collipulli | Collipulli | c803a9c9-c0a1-4ac8-ae1e-1daa0a006095 |
| Técnico en Administración para AIF - Angol | Angol | cb47b13c-00cf-4d12-9043-c6906da31736 |
| Asesor/a de Ventas y Servicio en Sucursal - Angol | Angol | b92528e5-61b5-4498-88ca-808c2443a044 |
| Promotora 20 horas - Traiguén | Traiguén | 84a864c5-7202-4802-85dd-fa5dbcb38a4c |
| OPERARIOS AGRÍCOLAS – COSECHA DE ARÁNDANOS | Mulchén | 8d3d1102-ba4a-4d77-adcf-59e158cb5013 |
| Práctica Profesional Ingeniería Civil Industrial - MASSO - Nacimiento | Nacimiento | 0334d4c8-28ee-4aaa-a266-0610b1988e06 |

## Errores encontrados y reparación

1. **Descubrimiento demasiado restrictivo.** Un enlace de cargo podía descartarse porque su título no contenía palabras como contratación o vacante. El lector de índices ahora recoge los enlaces individuales soportados, conserva su identidad y señala el límite/truncamiento. Se revisó el trabajo que quedaba pendiente, sin volver a OCR de documentos agotados.
2. **Ciudad del portal confundida con lugar real.** Un aviso podía aparecer clasificado en Temuco, Los Ángeles, Concepción o Chillán mientras su propia descripción declara Lumaco, Nacimiento, Mulchén o Angol. Se da prioridad a una ubicación explícita dentro de la descripción del mismo cargo, conservando país chileno y rechazando lugares contradictorios o múltiples. No se usa el pie de página ni una recomendación de otro empleo como evidencia.
3. **Alias de una misma oferta.** Los micrositios de empresas en Chiletrabajos se reconocen como el mismo aviso individual. Se conserva la equivalencia pública por ID numérico y las claves históricas de ingesta.
4. **Recibos incompatibles con esa equivalencia.** El primer lote guardó tres cargos, pero el recibo de la práctica 3915394 buscaba el hash de la URL completa en un feed que compara por ID numérico. Los tres ya estaban en el SDK; el contador de recepción solo acreditaba dos. Se corrigió la búsqueda del recibo usando la misma equivalencia del feed. Se recuperó la firma original sin crear nuevos registros ni volver a firmar ese lote. Una prueba con ID numérico reproduce el fallo y comprueba la corrección.
5. **Cierre obligatorio en una oferta presencial abierta.** El receptor ahora admite evidencia municipal individual con fecha original comprobada, estado abierto en su propia tarjeta del índice e instrucciones de postulación presencial. Conserva HTML, metadatos y hashes exactos. No inventa un plazo. Un bloqueo posterior conserva la aprobación; un cierre explícito desactiva la oferta sin borrarla. La revisión usa el cron existente.
6. **Revalidación CMPC atada a dos cargos.** La preparación permite seleccionar por requisición y separar cerrados de abiertos. Se revisó solo 18859; no se repitió ni se publicó el Inspector de Vibraciones, cuyo cierre editorial es el 20 de octubre. Las fechas siguen en formato mes/día/año y conservan precisión de día y retiro preventivo al comienzo del cierre en Chile.
7. **Respaldo intermedio con identificador inválido.** Una prueba detuvo el envío al usar un sufijo textual donde el respaldo exige `run-attempt` numérico. Se corrigió sin ampliar el límite ni alterar el checkpoint; los fallos posteriores también guardan evidencia durable.
8. **Pruebas originales en la proyección pública.** Se excluyen del payload público los originales de evidencia municipal, documental y CMPC; se conservan en el registro fuente y en el respaldo. Se añadieron diagnósticos acotados del recibo, sin claves ni tokens.

## Nuevo original municipal recuperado

[Operarios agrícolas — cosecha de arándanos](https://www.munimulchen.cl/oferta-laboral-02-operarios-agrarios-cosecha-de-arandanos/), Mulchén, sector Campamento. Son **100 cupos de un solo cargo**, no cien avisos. El índice oficial marca su propia tarjeta como abierta. La API pública WordPress de la página 17979 confirma publicación original `2026-10-19T23:37:41Z`; no se usó la fecha de captura, modificación ni carpeta de la imagen.

La postulación es presencial en Oficina OMIL, Aníbal Pinto 495, interior del edificio municipal, lunes a viernes 08:15–13:45. El cargo admite mayores de 18 años con o sin experiencia, con CV básico y fotocopia de cédula. El municipio identifica al contratante como empresa agrícola de Mulchén, sin publicar razón social: la app lo informa así. La municipalidad es la fuente intermediaria, no se inventa que sea el empleador. No se informa fecha de cierre.

## Cobertura real y límites

Los runs 39413875293 y 39416058655 conservaron 94 comprobaciones de índices por fuente/comuna, 106 enlaces individuales distintos y la lectura de los 94 que no estaban en el inventario. La segunda pasada reutilizó sin red 36 originales para aplicar la corrección de ubicación y leyó 58 páginas individuales pendientes. Estos números no son publicaciones. Hubo 24 propuestas que pasaron el parser; la revisión excluyó duplicados y republicaciones antes de la firma.

Se revisaron índices municipales de las nueve comunas pedidas, Malleco 7, Las Noticias de Malleco, Radio Nativa y Radio Viaducto, además de búsquedas laborales, RSS y portales. Radio Viaducto no acredita a Radio Mininco. Mininco como faena CMPC tampoco acredita la radio; su canal oficial sigue pendiente.

- **Mulchén:** original nuevo fechado y abierto, descrito arriba. Las otras siete tarjetas del índice laboral están cerradas y no se publican como vigentes.
- **Traiguén, Lumaco, Renaico y Negrete:** se conservaron enlaces primarios y sus resultados. No se atribuyen vacantes a ferias, subsidios, permisos de puestos comerciales ni documentos antiguos. No se repitieron los PDFs agotados.
- **Los Sauces y Nacimiento:** se leyó el índice estático; no se volvió a renderizar las noticias dependientes de `/api/`, excluida por robots. Eso limita la lectura, no acredita ausencia de ofertas.
- **Angol:** el índice de noticias no permitió establecer política robots; no se lo eludió. **Collipulli:** el índice fue accesible en esta pasada; los enlaces no equivalen a concursos nuevos aprobados.
- **Laborum y Chiletrabajos:** se revisaron avisos individuales y se seleccionaron cargos distintos. Se descartaron republicaciones del mismo empleo en otro portal; los siete cargos AIF de Consultores 2000 son funciones diferentes, no siete copias del mismo cargo.
- **Indeed:** HTTP 403. **Computrabajo y Empleos Públicos:** política robots no disponible. **Opción Empleo:** desafío de acceso. **LinkedIn:** límite de bytes del lector; es un límite propio pendiente de mejorar, no un bloqueo acreditado del publicador. Ninguno de estos estados significa que no existan ofertas.
- **CMPC y Arauco:** se accedió a sus canales públicos acreditados. Se mantuvieron pendientes los títulos de plantilla y los avisos sin evidencia individual; el índice Arauco aportó enlaces, no nuevas publicaciones verificadas.
- **Facebook e Instagram:** las pruebas documentadas detuvieron el acceso por robots. Se comprobaron ocho perfiles Facebook enlazados desde sitios acreditados; no se leyeron sus publicaciones. Las cinco cuentas Instagram aportadas ya tenían política restrictiva documentada y no se reintentaron. **Publicaciones sociales nuevas confirmadas: cero.**

No se volvió a leer/OCR Malleco 7 del 15 de octubre, las cuatro referencias antiguas, los PDFs Renaico ni los 27 avisos agotados SSAN. No se usaron servicios pagos ni se contactó a terceros.

## Permanencia, pruebas y pendientes

El SDK acredita revalidación nativa de los tres cargos de Traiguén el **20-oct a las 13:05:37 UTC**, con los mismos IDs y fecha editorial 1-oct. Su próxima revisión figura para el **21-oct a las 01:05:37 UTC**; no se declara ejecutada por anticipado.

Pasaron **243 pruebas Python** y los **29 archivos de pruebas Node**, incluyendo 36 pruebas del receptor firmado, siete del consumidor documental y cuatro del nuevo original municipal y sus estados abierto/cerrado/bloqueado. La ejecución completa detectó una importación faltante en el harness del consumidor al añadir el diagnóstico de retención; se corrigió y se repitió con éxito.

La última corrección del contador quedó ready en `1792539546631`, sin errores de frontend, backend o red en QA. Persisten las dos advertencias anteriores de inspección de iconos PWA. No se cambió main, ninguna credencial ni la cantidad/frecuencia de los seis crons. Los originales históricos y las 40 referencias del checkpoint se conservan.

La nueva comprobación presencial queda instalada en el slot existente; su primera revisión por vencimiento del intervalo aún debe observarse en vivo. **CMPC sigue sin ciclo nativo periódico propio:** una entrega idempotente fresca acredita una revisión real, no una instalación recurrente. Tampoco existe captación social automatizada general ni cobertura completa de todos los índices. Queda mejorar el límite LinkedIn, ampliar índices paginados y réplicas primarias accesibles, y corregir calidad heredada por cargo. Los jobs explícitos de esta rama no son una promesa de ejecución permanente desde main.

La revisión CMPC 18859 quedó comprobada en SDK con `lastVerifiedAt=2026-10-20T23:30:06.889673+00:00`, ID `d73ebbc0-c815-455d-b6ed-015e620cedf6` y fecha original `2026-10-13T03:00:00.000Z`. La tarjeta sigue en el recorrido completo. El inspector cerrado no se volvió a capturar, firmar ni contar.

Se añadieron pruebas de reemplazo de representante e incorporación histórica: el total no baja y el cambio de ID no se cuenta como aviso reciente. La comprobación final del contador [39517138783](https://github.com/mrvvergara-afk/Trabajo-Cerca-/actions/runs/39517138783) terminó correctamente en modo observación, sin fuentes nuevas, OCR ni firma: cero publicaciones adicionales y los 16 IDs comprobados conservados (15 nuevos de esta ampliación más CMPC existente).


## Comprobación final de permanencia y novedades

A las **23:52:04 UTC** el SDK completo conserva **52 registros / 50 ofertas tipadas** y se recorrieron las **50 tarjetas**; el total siguió en 50 al paginar, activar/desactivar novedades y recargar. La carga inicial contiene 23 tarjetas, por lo que tampoco ese número es el total. El banner muestra **24 incorporaciones en siete días y 20 en 24 horas**, ventanas móviles que incluyen otras tandas; no se confunden con las 15 publicaciones revisadas de esta ampliación.

La oferta TENS 3902931 conserva `firstPublishedAt=2026-10-03T14:56:19.870Z`, recuperado del representante histórico, aunque el registro nativo actual se creara el 20. Se conserva fecha editorial 23-sept y la tarjeta actual con empleador Layner y trabajo real Lumaco. El primer comprobador exigía la fecha del snapshot intermedio (15-oct) y rechazó el valor histórico anterior. La prueba 39516826846 falló por esa comparación demasiado rígida; se corrigió y una prueba específica acepta evidencia anterior y rechaza reiniciar la antigüedad al día actual. No fue pérdida de oferta ni vencimiento.

El respaldo final es `bd5c3cf623e03ca73409942f8ca2af8990c80ab0`, `history/39517138783-1/`. El manifiesto SDK es `654d330d-53c0-4947-a5d6-f0683d86e65a`. Se conservan el [inventario final](evidence/inventario-final-ampliacion-2026-10-20.json), las [tarjetas finales](evidence/tarjetas-finales-ampliacion-2026-10-20.json) y la [prueba de antigüedad](evidence/contador-y-antiguedad-confirmados-2026-10-20.json). Los tres IDs Traiguén y el ID CMPC siguen presentes. Ningún ID cambió durante esta última corrección. `main` sigue en `fab392b824e4100a4bba6dfe9289825297d24707`.
