# Tres cargos municipales recuperados de un PDF escaneado grande

## Resultado de esta continuación

Se descargó y leyó el documento que antes superaba el límite del piloto: **13.988.452 bytes, 33 páginas escaneadas**. La prueba final recuperó texto en **33/33 páginas**, separó **tres cargos con plazo no vencido según el calendario oficial**, guardó las fichas y comprobó su restauración desde respaldo. También generó una vista HTML local para revisarlas.

**Esto todavía produjo cero publicaciones en la app.** Las tres fichas siguen pendientes, con `verified: false`, `active: false` y `published: false`. El recorrido funciona hasta captura, lectura, extracción, persistencia y vista local; el traspaso automático de cada cargo al publicador sigue bloqueado y se explica más abajo. No se desplegó, no se ejecutaron Actions y no se integró `main`.

Fuente primaria: [publicación municipal del 1 de octubre de 2026](https://mtraiguen.cl/municipalidad/bases-para-llamado-a-concurso-publico-de-3-cargos/). [PDF original](https://mtraiguen.cl/wp-content/uploads/2026/10/DAEX-BASES-Y-CALENDARIO.pdf).

| Cargo | Cupos | Jornada y contrato indicados | Lugar indicado en las bases |
|---|---|---|---|
| Químico Farmacéutico (a) | 1 | 44 horas, indefinido | Departamento de Salud Municipal de Traiguén, página física 5 |
| Ingeniero (a) en Prevención de Riesgos | 1 | 44 horas, indefinido | Departamento de Salud Municipal de Traiguén, página física 19 |
| Nutricionista | 1 | 44 horas, indefinido | Postas rurales, CECOSF y estaciones médico rurales de la red municipal, página física 19 |

Son **tres cargos de una convocatoria**, no 33 avisos por 33 páginas ni 37 por las tareas del recorrido. Se inspeccionaron visualmente las páginas 2, 3, 5, 19, 24 y 33. La jornada, contrato y cupos de esta tabla proceden de esa revisión visual; el extractor conserva esos campos sin completar cuando no puede asociarlos de forma segura a cada perfil.

El calendario de las páginas 2 y 33 indica **inicio de recepción el 1 de octubre y cierre el 2 de noviembre de 2026**. La publicación está dentro de los 45 días a la fecha de la prueba, 17 de octubre. Esto acredita el plazo que anuncia el documento consultado; no acredita ausencia de una modificación posterior en otro canal.

La recepción es presencial en la **Oficina de Partes del Departamento de Salud, Balmaceda 424, Traiguén**. La página 11 indica 09:30–14:00 para las bases de Químico Farmacéutico; la 24 indica 09:00–14:00 para los otros perfiles. Ambas contemplan antecedentes enviados por Correos de Chile dentro del plazo. Algunos párrafos de las bases conservan espacios de fecha en blanco; no se completaron por suposición. El teléfono de consultas no se convirtió en una vía para enviar postulaciones. El domicilio municipal B. Urrutia 914 no se usó como lugar de trabajo ni de recepción de estos sobres.

## Errores comprobados y reparación

1. **El PDF se rechazaba por tamaño.** Se permite hasta **16 MiB** exclusivamente para originales con MIME `application/pdf` y firma `%PDF-`. Las imágenes y otros objetos mantienen **8 MiB**, el archivo completo **32 MiB**, el respaldo SQLite **16 MiB** y la lectura **40 páginas por PDF**. Las descargas de URL terminadas en `.pdf` usan el nuevo techo; otras URL conservan el anterior. Si no hay capacidad total, se conserva todo lo anterior y se informa el rechazo.
2. **El OCR perdía celdas del calendario.** La lectura como bloque uniforme dejaba fechas separadas de sus etiquetas y omitía el cierre. Las páginas que mencionan cronograma reciben una segunda lectura con segmentación de columnas. Se archivan ambas, con su procedencia; no se sustituye la primera. La segunda lectura de la página 2 recuperó literalmente la fila de cierre. Si esa lectura adicional falla, se conserva la primera y se registra el error.
3. **El extractor anterior solo reconocía tablas a honorarios.** Ahora también reconoce encabezados de bases para un cargo y perfiles de cargo municipales. Los tres perfiles tienen IDs distintos y referencias a la página y al objeto de texto. No se mantienen listas de nombres profesionales específicos para fabricar resultados.
4. **Fechas de filas distintas no podían asociarse con seguridad.** Se reconocen etiquetas explícitas de inicio de recepción y cierre de postulaciones en la misma línea que su fecha. Fechas sueltas y lecturas contradictorias quedan pendientes. La fecha de cierre es de precisión diaria; la marca interna de fin de día no se muestra como si fuera el horario oficial de recepción.
5. **Se descargaba una imagen ajena al empleo.** El HTML también contiene una imagen de renovación del COSOC. Con un PDF incrustado disponible, ya no se usa el título de la página para enviar cualquier foto a OCR; se conservan imágenes con indicios laborales propios. La ejecución final descargó únicamente el PDF pertinente como medio.
6. **Faltaba una comprobación repetible de recuperación y vista.** El comando de prueba admite hasta 40 pasos para abarcar las 33 páginas, crea un respaldo local, lo restaura en otra carpeta, compara los conteos y las fichas archivadas y genera `review-preview.html`. Nunca firma un lote, sube estado ni llama al escritor de AppDeploy.

Se mantienen las reparaciones previas de PDF incrustados, fecha primaria, OCR TSV, listado cerrado y descubrimiento de Mulchén, descritas en [la primera prueba documental](prueba-documental-traiguen-2026-10-17.md).

## Evidencia y pruebas

- **163 pruebas Python aprobadas**, incluidas diez nuevas: tamaño, firma y MIME; límite total sin pérdida histórica; restauración de PDF grande y tareas previas; límite de 40 páginas; lectura alternativa y su fallo; perfiles reales y conflicto de fechas; descarte de imágenes ajenas.
- **16 archivos de pruebas Node aprobados**, cero fallos.
- Ejecución final con acceso público real y comprobación de robots: **37 tareas terminadas, 37 intentos, 37 observaciones, 37 objetos**. Una descarga PDF y 33 páginas con texto, **68.222 caracteres** en la lectura principal. La confianza media informada por página varía entre 74,7 y 95,1; no equivale a una garantía de exactitud de cada campo.
- Respaldo y restauración reales: todos los objetos comprobados por hash, conteos preservados y manifiesto de las tres fichas recuperado. Evidencia total: **14.340.992 bytes**, dentro de 32 MiB. Los intentos anteriores se conservaron en carpetas separadas.
- Chromium con servidor local: tres tarjetas visibles, las tres con fecha 02/11/2026 y rótulo «No publicado», sin solicitudes de contenido externo. La prueba comprueba la vista de revisión local, no el feed de AppDeploy.
- SHA-256 del PDF: `a1a889d657913e233cb2ba50aa44e6bd55b42dc1e669078f0bee00693d19318f`.
- `git diff --check`: aprobado. Evidencia detallada en [el registro JSON](evidence/traiguen-salud-pdf-grande-2026-10-17.json).

El modelo español de Tesseract es el ya usado en la prueba anterior, descargado del repositorio oficial y con hash conservado. No se cambiaron credenciales, modelos globales, suscripciones ni proveedores de pago.

## Qué falta para ver estos cargos en la app

El estado observado es `multiple_notice_document_requires_review`, con **tres fichas y cero registros listos para el lote**. La página HTML por sí sola no contiene los campos del afiche. Leer el PDF grande eliminó un bloqueo, pero no convierte su contenido en tres publicaciones válidas para el puente actual.

Para completar ese puente en la rama independiente deben resolverse y probarse estos puntos concretos:

1. **Unidad de publicación por cargo.** El publicador debe conservar tres identidades bajo una misma URL primaria, sin que su deduplicación por URL las fusione. Los IDs de revisión ya son distintos; aún no son IDs de ofertas publicadas.
2. **Verificación por ficha con pruebas de varias páginas.** El verificador vigente limita el texto completo a 18.000 caracteres; aquí hay 68.222. Hace falta validar cargo, empleador, centro de trabajo, plazo y postulación mediante referencias a sus páginas, conservando el original entero. No se elevó ese límite ni se marcó un extracto como documento completo.
3. **Postulación presencial explícita.** El verificador actual espera correo o teléfono como contacto de postulación. Este caso exige dirección, documentos, horario y plazo por perfil. No basta con convertir el teléfono de consultas en botón para postular ni con usar la dirección del publicador como faena.
4. **Prueba de integración aislada.** Después de las anteriores, el criterio de salida es tres ofertas distintas aceptadas por el consumidor, conservadas tras reinicio y visibles en el feed de prueba; una repetición debe actualizar las mismas tres. Los cierres y cambios de bases deben modificar su estado sin borrar histórico. Esa prueba con la app todavía no se ha ejecutado.
5. **Revisión y despliegue posterior.** Solo después de revisar esta entrega corresponde llevar los cambios a la rama que ejecuta el radar y al backend de la app. El código y los commits de esta continuación son locales; producción no los está ejecutando.

La capacidad total de 32 MiB también debe observarse al integrar en un estado ya poblado: esta prueba utilizó un estado nuevo y no demuestra que el archivo compartido anterior tenga espacio para otro PDF de este tamaño. La solución debe conservar el histórico, por ejemplo separando archivos documentales con manifiestos y restauración comprobada, sin borrar ofertas para liberar cupo.

Facebook e Instagram continúan sin una captura directa y recurrente demostrada. Este resultado acredita una fuente municipal pública con OCR local gratuito. No demuestra acceso autenticado ni cobertura de las otras comunas, radios o redes sociales.

## Repetición segura

Desde la raíz del repositorio, con lectores PDF y modelos OCR instalados:

```bash
OMP_THREAD_LIMIT=1 python -m scripts.document_reference_proof \
  'https://mtraiguen.cl/municipalidad/bases-para-llamado-a-concurso-publico-de-3-cargos/' \
  --max-work 40 --output output/salud-traiguen-nuevo
```

Se debe usar una carpeta nueva. `TESSDATA_PREFIX` puede seleccionarse solo para ese comando si los idiomas están en una carpeta propia. La prueba crea originales, texto por página, fichas, vista local, respaldo, estado restaurado y reporte. Los enlaces de la vista llevan a las fuentes municipales; abrir la vista no publica nada.

Trabajo conservado en `repair/mulchen-captura-2026-10-17`, sin integración a `main`, sin modificación de la app, sin reactivar tareas programadas y sin costos externos.
