# Lector conectado a la cola real · 19 de octubre de 2026

App: https://trabajo-cerca-laboratorio-3ojgro.v2.appdeploy.ai/.
Versión aplicada: 1792411319391 (primera tanda: 1792409360435). Rama: repair/mulchen-captura-2026-10-17.

La preparación comenzó el 18 de octubre. El despliegue confirmado y las
comprobaciones de Actions de esta tanda corresponden a la mañana del 19,
hora de Chile; no se presenta la preparación como una ejecución nocturna terminada.
La revalidación autónoma de Traiguén sí quedó comprobada mediante el SDK.

## Resultado comprobado

Las lecturas SDK de las 08:31, 08:42 y 08:50 del 19 de octubre confirmaron en el feed completo
1f07ac8d-5ddf-4ae9-a3ef-8c3b06504245 y los mismos tres IDs de Traiguén:

- de9067f5-59f2-4e0c-ba02-fc9584debe0f
- 8b75b282-d838-45bc-9309-d10874aae023
- 3c875b30-eec8-4d2a-9410-797e9ad37c07

El cron los había revalidado el 18 de octubre a las 21:20 (Chile), conservando
la publicación original del 1 de octubre. En el recibo de las 08:50, la siguiente comprobación figuraba para el 19 a las
09:20; este informe no presenta ese ciclo futuro como ya ejecutado. Son tres ofertas existentes revalidadas,
no tres publicaciones nuevas.

La primera ejecución 39245159587 recibió 36 elementos reales por el SDK.
Recuperó la procedencia de los PDFs de Renaico y registró diez plazos vencidos
en sus secciones del catálogo, sin atribuirles una fecha editorial inexistente.
Incorporó cuatro referencias del índice primario de Malleco 7: las ediciones
ya comprobadas del 13, 8 y 6 se reutilizaron sin repetir OCR. La edición del 15
se leyó en sus doce páginas, con capa de texto y OCR separados. Las coincidencias
revisadas eran una feria laboral y contratos de Conaf ya firmados; no se
confirmó un aviso individual postulable. No se publicó ninguna oferta nueva.

El respaldo de esa ejecución se guardó en la rama independiente
radar-document-reader-state, commit d9025a1672d05b880996f0066c3a1b277258573d.
Se comprobó su recuperación por GitHub: checkpoint válido con 40 entradas,
originales por SHA-256 y las lecturas por página. Los artefactos de Actions
duran siete días; el respaldo en Git y este informe conservan la evidencia.

Las dos tandas siguientes corrigieron fallos observados, conservando el mismo
respaldo. La última recuperación confirmó 40 entradas y la prueba SDK guardada
en history/39247447400-1/sdk-publication-proof.json. La rama de datos terminó en
b2424e77bae3e3b0d776c923aedc14ca73634bf6, con padre
bc394924eca95c680d73143b46789792f97b38ad; no se reescribió el historial.

**Ofertas difíciles nuevas confirmadas: 0. Publicaciones nuevas: 0.**
Los tres cargos de Traiguén continúan visibles; no se suman como nuevos.
Tampoco se aprobó ningún histórico cerrado reciente nuevo.

## Acceso público de Los Sauces y Nacimiento

Se probó un navegador real, sin sesión y con verificación TLS. Ambos sitios
entregan HTTP 200 para la pantalla inicial y solicitan noticias desde
/api/v3/news. Sus robots.txt indican literalmente:

    User-agent: *
    Disallow: /admin/
    Disallow: /api/

El navegador detuvo esas solicitudes antes de descargarlas. No se evadió
la restricción y no se interpreta la pantalla vacía como ausencia de avisos.
El archivo de política de ambos sitios quedó conservado con SHA-256
a441efba2b43cee9bf71ad08d1d59fb2605c7d518afc07942dcb7473226bbd06.
La continuación omite volver a renderizar estas dos fuentes sin cambios.

## Cambios aplicados y comprobables

- El lector consume la cola vigente mediante el SDK del frontend; no inventa
  transporte HTTP hacia endpoints de la app ni usa sus motores pagos.
- Recupera el catálogo que enlaza cada adjunto y conserva el HTML y su hash.
  Cada plazo se toma de la sección del propio documento. Los cierres explícitos
  y los concursos ajenos a empleo se distinguen del trabajo pendiente.
- Corrige un fallo encontrado en la primera ejecución: los enlaces HTML deben
  leerse en su página individual, conservando el listado como descubrimiento.
  Cuando falta fecha en la página, puede recuperarla del artículo exacto del
  archivo municipal con su etiqueta editorial; no usa la fecha de otra noticia.
- Los adjuntos de un catálogo sin página individual pueden pasar al lector,
  previa comprobación del enlace literal. La fecha global del catálogo no se
  convierte en fecha de publicación de cada cargo.
- El lector excluye imágenes dentro de header, nav y footer. La primera pasada
  había gastado lecturas en iconos sociales de páginas de concursos navideños;
  la corrección y sus pruebas evitan repetir ese error.
- Guarda checkpoint y evidencias en una rama de datos separada, con commits
  normales y conservación del árbol anterior. Los resultados parciales vuelven
  a intentarse; los completos se reutilizan cuando corresponde.
- La app distingue HTML que requiere navegador con source_render_required y
  exporta ese trabajo en modo de solo lectura. Añade el índice primario de
  ediciones digitales de Malleco 7 al recorrido existente.

- Se corrigió un bloqueo del lector: robots.txt de Renaico redirige del dominio
  con www al mismo publicador sin www. Ahora sigue esa redirección pública
  acotada, conserva y aplica la política recibida, rechaza HTML que no sea una
  política y registra cada respuesta. No permite saltar a otro publicador.
- Se añade reutilización de la lectura de una edición cuando cambian los nonces
  de su HTML y siguen los mismos enlaces PDF. Se conserva el original anterior;
  no se renueva una fecha editorial ni una aprobación. Esta optimización no
  comprueba por sí sola modificaciones de bytes dentro del mismo enlace PDF y
  no sirve para revalidar una vacante.
- La página corporativa oficial de CMPC enlaza ahora a cmpc.csod.com. Se corrigió
  la raíz de descubrimiento y su identidad de publicador, conservando el origen
  anterior en la configuración. El portal vacío se diagnostica como pendiente
  de renderizado, no como ausencia de empleos. No existe todavía un adaptador
  aprobado para extraer y verificar sus avisos individuales. Evidencia primaria:
  https://www.cmpc.com/trabaja-con-nosotros/ →
  https://cmpc.csod.com/ux/ats/careersite/4/home?c=cmpc.

La app terminó ready, sin errores de frontend, backend ni red en QA.
Persisten las dos advertencias anteriores de inspección de iconos PWA.
Se mantienen los seis crons; no se modificaron credenciales, main ni ofertas
históricas, no se contactó a instituciones y no se usaron proveedores pagos.

## Ejecuciones y documentos realmente leídos

| Ejecución | Resultado real |
| --- | --- |
| [39245159587](https://github.com/mrvvergara-afk/Trabajo-Cerca-/actions/runs/39245159587) | SDK y navegador público; edición del 15 de octubre leída en 12 páginas, también con OCR. Se detectó y luego corrigió el gasto en iconos de dos páginas ajenas a empleo. |
| [39246529842](https://github.com/mrvvergara-afk/Trabajo-Cerca-/actions/runs/39246529842) | Clasificación corregida. Tres intentos de adjuntos quedaron sin descarga por el tratamiento incorrecto de la redirección de robots. No se contabilizan como documentos leídos. |
| [39247447400](https://github.com/mrvvergara-afk/Trabajo-Cerca-/actions/runs/39247447400) | Redirección corregida; dos PDFs de Renaico leídos completos: médicos, 15 páginas con texto; salvavidas, 5 páginas con OCR. Sin aprobación ni publicación. |

En la última tanda también se repitió la edición del 15 porque su HTML cambió,
aunque el PDF mantuvo el mismo hash. La mejora de caché descrita arriba se añadió
después, con prueba local; no se afirma una cuarta ejecución real de esa mejora.
Las cuatro referencias antiguas de 39129527420 no volvieron a pasar por OCR.
El total sin duplicar de esta tanda es **tres PDFs distintos y 32 páginas**;
17 de esas páginas distintas se leyeron además con OCR local. No son 32 ofertas.

Los dos PDFs de Renaico no acreditaron fecha editorial original dentro de los
últimos 45 días ni una revisión completa por cargo. El catálogo contiene
referencias literales a diciembre de 2025–enero de 2026 y noviembre de 2025.
Se conservan como documentación histórica sin aprobar; la ruta de subida no
se usa como fecha editorial. El lector general todavía deja campos de empresa,
lugar o cargo pendientes aunque el documento esté descargado: lectura completa
no equivale a extracción estructurada ni a aprobación completa.

La clasificación previa a lectura en la última ejecución fue: 10 referencias
con plazo de recepción vencido, 11 marcadas cerradas, 5 ajenas a empleo, 2 fuera
de 45 días con fecha confirmada, 9 por leer o revisar y 3 referencias ya revisadas
que no se repitieron. Suman 40 referencias, no ofertas ni cargos. Parte de las
9 se leyó después en el mismo job. Los dos artículos de Negrete quedaron
fechados en 7-jul-2026 y 19-mar-2018 a partir de sus publicaciones, sin tomarlos
como vacantes actuales. Los cerrados sin fecha editorial conservan antigüedad
no confirmada; no se aprueban como históricos recientes.

Originales principales por SHA-256:

- Malleco 7, 15-oct: 4ec420b179203c5de66c9a96c8e75243ec4e1b42bef45ed8cc389b27824dc7cb.
- Renaico, médicos: e49d214ee10d696f956c2072b3fbe63a5cf13d4546e510cb124a9cae9ab685ab.
- Renaico, salvavidas: 296c34b75ab9043e98a186aaabae2c1eb0723a6380a2a220513f92080e4d4ad0.

## Cobertura territorial y limitaciones

El catálogo conserva las nueve comunas y las fuentes municipales, medios,
empresas y perfiles públicos previamente documentados. Una entrada configurada
no prueba cobertura ni acceso efectivo. Esta tanda trabajó sobre la cola real;
no ejecutó un barrido exhaustivo nuevo de todas las fuentes de cada comuna.

| Zona o canal | Evidencia o situación de esta tanda |
| --- | --- |
| Traiguén | Tres IDs existentes y revalidación automática comprobados por SDK. |
| Renaico | Procedencia del catálogo recuperada, plazos por sección y dos PDFs completos; cero avisos aprobados. |
| Negrete | Fechas de dos publicaciones recuperadas; ambas fuera de 45 días. |
| Mulchén | Cierres y concursos ajenos a empleo separados; no se publicó ningún candidato. |
| Los Sauces y Nacimiento | Navegador público probado; API de noticias excluida por robots.txt. No se repitió sin cambios. |
| Lumaco | Radio Nativa en la cola y material histórico separado; referencia municipal antigua no reanalizada sin cambio real. |
| Angol y Collipulli | Raíces municipales conservadas; sin nuevo aviso individual confirmado en esta tanda. |
| Malleco 7 | Índice primario conectado, edición reciente completa; feria y contratos consumados excluidos. |
| CMPC y Arauco | CMPC cambia a portal corporativo vigente; no se confirmó una vacante individual en las nueve comunas. |
| Facebook e Instagram | Sin nueva vía de acceso público acreditada; ninguna captura autenticada ni evasión. |
| Radio Mininco y otras empresas agrícolas/medios locales | Canal oficial de Mininco aún pendiente y cobertura incompleta de los restantes publicadores; no se inventaron perfiles. |

La terminal local volvió a rechazar red; no se insistió indefinidamente con el
mismo permiso. Se usaron los conectores autorizados y Actions. Cero llamadas
pagas corresponde a estas pruebas explícitas; los crons existentes capaces de
usar proveedores permanecieron como estaban, sin cambiar cuotas ni credenciales.

## Pruebas y alcance pendiente

206 pruebas Python y 18 archivos de pruebas Node aprobados. Incluyen extracción
de fecha vinculada al artículo correcto, cierres por documento, no empleo,
consulta de la página individual, adjuntos enlazados, exclusión de iconos,
robots antes de redirecciones, restauración y conservación del historial en Git,
reutilización de lecturas y reintento de resultados incompletos.

El lector funciona como trabajo acotado en Actions sobre la rama de reparación.
La programación de workflows de GitHub solo se aplica desde la rama por defecto;
no se declara instalada una programación permanente en esta rama. La continuidad
usa las ejecuciones autorizadas existentes, sin crear otro cron en la app.

Quedan pendientes una vía autorizada de acceso o recepción de originales para
las redes sociales y las APIs restringidas; comprobar más fuentes actuales;
y completar revisiones individuales con fecha, empleador, trabajo real y
postulación suficientes. Cada publicación nueva debe pasar por el receptor
firmado existente y confirmarse por ID en el feed completo. Esta ejecución no
amplía automáticamente la aprobación documental de Traiguén a cualquier PDF.

El siguiente trabajo útil es descubrir publicaciones nuevas desde índices
primarios y completar la revisión por cargo de los originales recuperados.
Para obtener afiches exclusivamente sociales falta una vía pública autorizada
que entregue la publicación y el archivo; añadir OCR no resuelve ese acceso.
No se promete una cantidad de ofertas ni una fecha de publicación sin evidencia.

Evidencia permanente: [JSON](evidence/lector-cola-documental-2026-10-19.json).
Manifiesto de cambios aplicados: [AppDeploy](../integrations/appdeploy/live-document-reader-repair.json).
Código de esta tanda: 8b017ec22565f73be8898f4df15e30a8c7197f0c,
80fb5f9c6dd80be009f0de406cca8b0cd165ac61,
5171ad3650900bae2734aa36207e16d8804278aa y
1126b611f3adfa44cdbeded08cb6375b06420c0d.
Main se comprobó sin cambios en fab392b824e4100a4bba6dfe9289825297d24707.

## Aclaración posterior del inventario visible

La comprobación de las 09:25 corrigió el recorrido completo del feed: antes
se detenía al encontrar los tres IDs. Confirmó 15 tarjetas en la primera
carga y los tres cargos de Traiguén presentes. El total bruto del SDK incluye
registros heredados de calidad pendiente y no se presenta como nuevas vacantes.
Véase [evaluación en la página](evaluacion-inventario-visible-2026-10-19.md).
