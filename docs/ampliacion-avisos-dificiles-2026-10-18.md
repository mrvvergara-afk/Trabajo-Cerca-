# Ampliación verificable de avisos difíciles

La app recibió la versión 1792328322207. El cambio de captura terminó en estado
ready y QA no informó errores de frontend, backend ni red. No incorpora nuevas
ofertas por sí mismo. La rama de trabajo es repair/mulchen-captura-2026-10-17;
main no se integró.

## Fallos encontrados y reparados

1. Los enlaces de bases de Lumaco usan PhocaDownload y no terminan en .pdf.
   El recolector los omitía por formato. Ahora identifica exclusivamente la ruta
   pública observada y sus parámetros válidos, conserva la página municipal y los
   envía al lector documental. No amplía las identidades de ofertas ni toma la
   fecha de descarga como fecha editorial. Rechaza parámetros extra, credenciales,
   descargas ambiguas y publicadores ajenos.
2. Los enlaces que dicen DESCARGAR PDF en las ediciones del diario tampoco
   tenían una señal laboral y podían quedar fuera del descubrimiento. Ahora se
   conservan como documentos por leer, sin declararlos avisos de empleo.
3. El lector de PDF omitía OCR cuando ya había suficiente texto en una página.
   Una noticia puede ocupar la capa de texto mientras un aviso está incrustado
   como imagen. El modo --ocr-all-pdf-pages conserva ambas lecturas por página.
   Los documentos procesados con ese modo exigen revisión; no se verifica una
   oferta automáticamente por una coincidencia de palabras.

## Comprobaciones de fuentes

- Lumaco: las bases de jefatura y profesional abiertas en la fuente corresponden
  a julio. Además presentan plazos distintos entre el cuerpo y el calendario;
  ambos están vencidos. La corrección permite capturarlas, no volverlas vigentes.
- Renaico: el listado primario confirma cierres de junio y julio para los
  documentos más recientes de esa cola. Los 29 PDFs pendientes no equivalen a
  29 ofertas actuales. No se eliminaron ni se cambiaron las fechas históricas.
- Negrete: el archivo municipal fecha el concurso de dirección del CESFAM el
  7 de julio; no cumple la ventana de 45 días para incorporarlo como reciente.
- Mulchén: el índice marca cerradas las siete convocatorias que muestra.
- Los Sauces y Nacimiento: la lectura HTML disponible entrega una pantalla
  de carga. Se necesita comprobar contenido renderizado antes de concluir que
  no hay avisos; HTTP 200 no acredita cobertura.
- Facebook: la prueba del perfil de Angol redirige a inicio de sesión y limitación
  de acceso; la de OMIL Nacimiento queda limitada por acceso. No se presenta
  una búsqueda indexada ni un espejo de terceros como lectura del original.

Fuentes primarias revisadas:

- https://www.munilumaco.cl/index.php/afiches-municipales/811-llamados-a-concurso-publico
- https://municipalidadrenaico.cl/concursos-publicos/
- https://www.muninegrete.cl/page/2/
- https://www.munimulchen.cl/pagina-central-ofertas-laborales/
- https://www.munilossauces.cl/noticias
- https://www.nacimiento.cl/noticias
- https://www.malleco7.cl/ediciones-digitales-malleco7/

## Pruebas

187 pruebas Python y 18 archivos de pruebas Node aprobados. Las nuevas pruebas
incluyen una descarga de Lumaco sin extensión, conservación de procedencia y
fecha desconocida, y un PDF mixto generado para la prueba: pdftotext no ve el
correo del afiche, pero el OCR local sí lo recupera sin sustituir el texto original.
También comprueban que ese documento queda pendiente de revisión.

La ejecución real 39129527420 lee Lumaco y las ediciones de Malleco 7 del 13,
8 y 6 de octubre. Conserva originales, lecturas, fallos y una restauración del
respaldo. La ejecución terminó correctamente: se leyeron las 18 páginas de los tres PDFs
de Lumaco y las 36 páginas de los tres diarios; estas últimas también con OCR.
Se restauraron los cuatro respaldos, sin trabajos pendientes en las cuatro
referencias. No se confirmó ningún aviso laboral individual nuevo publicable y
no se publicó ninguna oferta nueva. Las dos coincidencias del diario del 6 de
octubre (página 3) eran una noticia de infraestructura energética. Las otras dos
ediciones no dieron coincidencias con las frases de búsqueda utilizadas. Esto
no mide una cobertura exhaustiva de todos los medios ni prueba ausencia de
avisos fuera de esos documentos. El resultado detallado queda en
docs/evidence/ampliacion-avisos-dificiles-2026-10-18.json.

Ejecución: https://github.com/mrvvergara-afk/Trabajo-Cerca-/actions/runs/39129527420.


El job tiene permiso de lectura, no firma lotes ni llama al escritor de la app.
Los artefactos de Actions duran siete días; el resumen queda en el repositorio.

## Lo necesario para aumentar publicaciones reales

- Procesar por fuente y documento: recuperar publicación, fecha editorial,
  afiche/PDF, cargos separados, empleador, lugar y postulación. Publicar solo
  después de comprobar el ID en el feed completo. Revisar los avisos cerrados de
  los últimos 45 días como históricos, sin presentarlos como vacantes abiertas.
- Conectar el lector general a la cola vigente y conservar respaldos durables;
  esta tanda prueba referencias concretas, no vacía automáticamente toda la cola.
  La aprobación y revalidación automática actual sigue limitada a los tres cargos
  ya revisados de Traiguén.
- Comprobar las páginas renderizadas de Los Sauces y Nacimiento respetando el
  acceso público. Añadir entradas de ediciones digitales al recorrido de medios;
  reconocer sus PDFs no demuestra que ya se recorra todo el archivo del diario.
- Para Facebook e Instagram, validar una vía autorizada que entregue publicaciones
  y sus medios, o recibir los originales directamente de quienes los publican.
  OCR resuelve la lectura de un archivo recuperado; no resuelve el acceso.
  No se contrataron recursos pagos ni se contactó a instituciones.

Se mantienen los seis crons existentes, credenciales y registros históricos.
Persisten dos advertencias previas de inspección de los iconos PWA.
