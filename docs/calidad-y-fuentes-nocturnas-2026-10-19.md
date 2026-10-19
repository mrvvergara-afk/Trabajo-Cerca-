# Calidad del inventario y fuentes primarias · noche del 19 de octubre

App: https://trabajo-cerca-laboratorio-3ojgro.v2.appdeploy.ai/.
Rama exclusiva de código: repair/mulchen-captura-2026-10-17.

**Avisos difíciles nuevos confirmados y publicados: 2, ambos de CMPC.**
La reparación de tarjetas existentes y las revalidaciones no se cuentan como
ofertas nuevas. La evidencia JSON conserva la entrega, los recibos, el feed completo y las
tarjetas, además de la comparación de calidad y el OCR.

## Línea base y revalidación comprobadas

La lectura real por SDK de las 19:56 del 19 de octubre (Chile) recorrió el feed
completo: 58 registros, 56 tipados como job_offer, en el manifiesto
a7425daf-c460-4d88-98fc-adfae0b807fd. Esos números son inventario bruto, no una
cantidad de vacantes válidas o nuevas. La captura por ID queda conservada en
config/feed-quality-baseline-2026-10-19.json.

Frente a la captura de la mañana entró un solo ID:
64d52710-3c5e-4be0-81a3-a973c13b1579, titulado Trabajos CMPC. Su URL es una
búsqueda de ChileTrabajos, no una oferta individual. No se acredita como nueva
vacante. No faltaba ninguno de los IDs de la captura matinal en esa comparación.

Los tres cargos de Traiguén seguían presentes. El SDK confirmó la revalidación
nativa del 19 a las 09:35 (Chile), conservando fecha original 1-oct-2026 e IDs:

- de9067f5-59f2-4e0c-ba02-fc9584debe0f
- 8b75b282-d838-45bc-9309-d10874aae023
- 3c875b30-eec8-4d2a-9410-797e9ad37c07

No se presenta el estado exitoso de un cron como prueba suficiente: estos datos
provienen de la lectura SDK. La siguiente revisión figuraba para las 21:35 de
Chile; no se declara ejecutada antes de comprobarla.

## Correcciones aplicadas

- Se excluyen del feed las páginas de ciudad, resultados de búsqueda y nombres
  de lugares que antes se presentaban como ofertas. El verificador heredado
  también detiene esos casos antes de consultar proveedores.
- La equivalencia de ChileTrabajos se calcula por su ID numérico solo para la
  representación pública. Las variantes portal.chiletrabajos.cl/empresa/...,
  el slug de la oferta y /trabajo/ID convergen en una sola tarjeta. Se conservan
  las claves de ingesta, registros fuente e identidades de cargos documentales.
- Victoria's Secret y faena Nueva Victoria no acreditan trabajo en la comuna
  de Victoria. Se contrastan también los títulos truncados con su URL individual.
  Las tarjetas que dicen explícitamente comuna de Ercilla y estaban clasificadas
  como Angol quedan fuera de la representación pública, sin cambiar sus originales.
- El mismo cron existente revisa páginas completas de hasta cuarenta registros
  por paso al cambiar la política. Se crean versiones inmutables del feed; no se
  borran las tablas originales ni los snapshots históricos.
- El primer despliegue detectó un error TypeScript preexistente: Buffer no tenía
  importación explícita en public-source-http.ts. Se corrigió y el despliegue
  posterior terminó ready. La versión final aplicada es 1792453057521, sin errores
  de frontend, backend o red en QA. Persisten las dos advertencias previas de
  inspección de iconos PWA.

Estas reglas corrigen fallos acreditados. No equivalen a revalidar la totalidad
de las ofertas heredadas ni resuelven todos sus empleadores o ubicaciones.

## Fuentes nuevas examinadas

La ejecución [39338338692](https://github.com/mrvvergara-afk/Trabajo-Cerca-/actions/runs/39338338692)
terminó correctamente y conservó los originales en la rama
radar-document-reader-state, commit c6c63586f2af6b9053b2aa106c2c42927f4aaa41.

Se capturaron tres publicaciones individuales distintas de Mulchén: profesional
de oficina técnica, conductores CORMA y labores de campo/cuidado de parcela.
El HTML es accesible y aporta requisitos y atención OMIL, pero no acredita fecha
editorial original ni identifica al empleador contratante. En conductores el
lugar de trabajo solo dice rutas de la región del Biobío. No se atribuye trabajo
en Mulchén únicamente porque allí esté la oficina que recibe postulaciones.
La ruta de subida de una imagen no se convirtió en fecha de publicación.

También se capturaron tres páginas del índice oficial del Servicio de Salud
Araucanía Norte. Se extrajeron 27 convocatorias conservando por tarjeta su fecha
original literal, estado, establecimiento y enlace individual. Se verificaron
los hashes SHA-256 de los bytes originales antes de procesar el respaldo.
Las diez convocatorias en etapa de postulación de esas páginas corresponden a
Lonquimay, fuera de las nueve comunas objetivo. Las demás no aportan una vacante
abierta reciente confirmada para el territorio pedido. No se confunde la sede
del servicio en Angol con el lugar real del cargo.

El índice SSAN enlaza metadatos públicos que respondieron 403. No se intentó
evadirlo. El lector específico usa las fechas visibles de cada convocatoria y
evita repetir esa consulta al índice. La fecha de modificación de una página
o de otra convocatoria no puede suministrar la fecha original que falta.

Las dos imágenes nuevas de Mulchén y la prueba pública de CMPC quedan separadas
de los PDFs y renderizados agotados de las tandas anteriores. No se repitió OCR
de aquellas cuatro referencias ni de la edición Malleco 7 del 15; tampoco se
volvió a renderizar Los Sauces o Nacimiento ni se eludió acceso social.

## Pruebas y límites

223 pruebas Python y 22 archivos de pruebas Node aprobados. Incluyen migración
con conservación de cada registro fuente, cargos municipales distintos,
equivalencias de URL, rechazo de búsquedas, conflicto de ubicación, fechas
vinculadas a su propia tarjeta y restauración de originales por hash.

La terminal volvió a rechazar red y se continuó mediante los conectores y
Actions; no se repitió indefinidamente la solicitud de permisos. Las pruebas
explícitas no invocaron proveedores pagos. Tras aprobar los dos cargos de CMPC
se usó la firma OIDC de GitHub y el receptor existente; no se crearon ni editaron
credenciales. Los estados de entrega y publicación se distinguen en la evidencia.
Los crons preexistentes capaces de usar proveedores permanecen como estaban.

Se conservan exactamente los seis crons y sus frecuencias, credenciales, main
y registros históricos. No se contactó a instituciones ni se enviaron mensajes
a terceros. El lector de la rama de reparación sigue siendo un trabajo acotado;
no se afirma una instalación permanente de OCR programado desde esa rama.

Para seguir ampliando hace falta cerrar ese mismo circuito con más fuentes:
original actual con fecha, empleador, lugar y postulación acreditados, revisión
por cargo, receptor firmado e IDs confirmados en el feed y en las tarjetas.
Los cambios de calidad no deben presentarse como crecimiento de oferta laboral.

[Evidencia JSON de esta tanda](evidence/calidad-y-fuentes-nocturnas-2026-10-19.json).


## Resultado visible de la limpieza y recuperación

La ejecución [39339407358](https://github.com/mrvvergara-afk/Trabajo-Cerca-/actions/runs/39339407358)
comprobó por SDK el cambio de 58 registros a 31 (29 tipados como oferta y dos
publicaciones comunitarias), sin altas en ese paso. La portada quedó con ocho
tarjetas iniciales y conserva Cargar más: tampoco ocho es el total de vacantes.
Los 27 IDs apartados de esa primera proyección constan en el JSON. No se atribuye
ninguna de esas salidas a vencimientos: hubo reglas de procedencia, ubicación,
equivalencia y un caso de recuperación pendiente.

Se encontró y corrigió ese último caso: la copia ganadora de Trabajador Social
tenía Angol aunque su título decía Ercilla; al excluirla, la copia de Ercilla que
había perdido la deduplicación tampoco volvía sola. La revisión v5 recupera los
miembros de equivalencias desde el manifiesto inmutable a7425daf-c460-4d88-98fc-adfae0b807fd
y vuelve a evaluar sus registros originales actuales. Nunca copia ciegamente un
snapshot antiguo. El checkpoint solo se confirma al terminar de encolarlos;
una escritura parcial falla y se puede repetir sin duplicar publicaciones.
El ID que corresponda recuperar sigue siendo una oferta heredada, no una nueva.

Esta limpieza no verifica todos los datos heredados. Quedan empleadores llamados
como el dominio del portal y ubicaciones sospechosas, por ejemplo Laboratorista
de Áridos — Santiago asociado a Ercilla. Esos casos requieren contraste individual;
ni el contador ni una bandera verified heredada acreditan una vacante nueva.

## Dos fichas primarias de CMPC y entrega firmada

La primera prueba de CMPC mostró un fallo propio: se bloqueaba en nuestra lista
permitida la búsqueda pública que usa su página. Se permitió exclusivamente
/rec-job-search/external/jobs del host observado us.api.csod.com, previa lectura
de robots. Se rechazaron otros endpoints, sesiones y parámetros de credenciales.
No se confundió ese bloqueo interno con ausencia de vacantes o con un bloqueo
del publicador. La prueba [39341465859](https://github.com/mrvvergara-afk/Trabajo-Cerca-/actions/runs/39341465859)
recibió datos públicos y respaldó sus bytes; los títulos de plantilla Nombre del
cargo / copy no se aprobaron.

La prueba individual [39342088220](https://github.com/mrvvergara-afk/Trabajo-Cerca-/actions/runs/39342088220)
leyó dos fichas completas sin iniciar sesión. Cada una coincide con una sola
requisición en la respuesta oficial, con texto de requisitos, empleador CMPC,
ubicación, fecha editorial y botón Apply Now. La postulación se dirige a esa
ficha oficial; completar una candidatura puede exigir una cuenta del postulante.
No se inició sesión ni se envió una postulación.

| Cargo | Trabajo real | Fecha editorial | Cierre informado |
| --- | --- | --- | --- |
| [Ingeniero/a Procesos y Excelencia Sr](https://cmpc.csod.com/ux/ats/careersite/4/home/requisition/18859?c=cmpc) | Collipulli, Planta Pacífico–Mininco | 13-oct-2026 | 9-ene-2027 |
| [Inspector de Vibraciones](https://cmpc.csod.com/ux/ats/careersite/4/home/requisition/18943?c=cmpc) | Nacimiento, Planta Santa Fe | 6-oct-2026 | 20-oct-2026 |

Las fechas del portal tienen formato mes/día/año y precisión de día. No se
atribuye una hora editorial que la fuente no da. Para no prolongar un plazo de
hora desconocida, la aplicación retira preventivamente al comenzar la fecha de
cierre en America/Santiago. Por ello el inspector puede dejar de verse el 20:
es un plazo acreditado y una política conservadora, no pérdida del registro.

El receptor incorpora un método específico para CMPC. Exige URL de requisición
y tenant exactos, hash del texto completo y de la respuesta original, coincidencia
de título/ID, lugar chileno, fechas de su propio cargo, lugar literal de faena y
postulación. No se declaró que la fuente tenía JobPosting: no lo tiene. La prueba
queda guardada junto al registro externo y en la rama documental con sus 40
entradas previas conservadas. Cambiar el adaptador no aprueba otras páginas ni
sus búsquedas por defecto.

La ejecución [39342961738](https://github.com/mrvvergara-afk/Trabajo-Cerca-/actions/runs/39342961738)
revalida las fichas para entregar, firma el lote de dos cargos mediante el receptor
autorizado y exige recibos, feed SDK completo y tarjetas públicas antes de contar
publicaciones. La primera comprobación terminó antes de que el SDK devolviera datos y falló.
Se corrigió con espera explícita del panel y del feed completo en Playwright.
La prueba de recuperación [39343502509](https://github.com/mrvvergara-afk/Trabajo-Cerca-/actions/runs/39343502509)
observa la misma entrega 39342961738: no vuelve a capturar ni a firmar.
Estado final: **dos publicaciones confirmadas**, a las 20:51 del 19 de octubre
(Chile), con los mismos IDs en recibos, feed completo y tarjetas públicas:

- Ingeniero/a Procesos y Excelencia Sr: d73ebbc0-c815-455d-b6ed-015e620cedf6.
- Inspector de Vibraciones: 9fc7362f-fb6e-41cf-ae38-68f016c257c5.

El inventario final tiene 33 registros / 31 tipados como oferta y nueve tarjetas
en la carga inicial; esos 31 no se presentan como nuevas vacantes verificadas.
El manifiesto final es e9e7ee52-8225-40fc-9d93-733af9dfe4d0. Se confirmaron
las dos tarjetas nuevas y los tres IDs de Traiguén. Frente a la línea base de
58 registros hay exactamente dos IDs nuevos y 27 fuera de proyección:
21 por reglas de procedencia o ubicación y seis por equivalencia con otro ID.
El original de Ercilla 0b54a8ad-1f4a-47f4-b351-8aa8dfa582f1 volvió a verse,
con su ID y antigüedad anteriores. No se suma como oferta nueva.
El checkpoint SDK acredita 11 referencias de equivalencias encoladas por la v5;
la comprobación local de las reglas finales no encuentra índices o duplicados
de las clases corregidas en este snapshot. No demuestra calidad total heredada.

La prueba y el inventario final se respaldaron en
3422ad5482ceda3dca590f66be4f61dc6f0f2781. El recibo de publicación quedó
en 678d3c95d96ba15905fe32e34864a90a6763330a de radar-state-laboratorio.
La [comparación CSV por ID](evidence/diferencias-inventario-2026-10-19.csv)
conserva entradas, salidas, recuperación y motivos; ninguna salida se atribuyó
a vencimiento. [Snapshot final](evidence/inventario-despues-cmpc-2026-10-19.json). Los originales de
esa entrega están en 10df64b04653e452b9ad69aae71e394f470c1898 y el intercambio en
5ef3a39f84dba1fe709f63e4c10324a2045717c9. La base SQLite anterior queda intacta.

## OCR nuevo y trabajo que aún falta

La ejecución [39340562836](https://github.com/mrvvergara-afk/Trabajo-Cerca-/actions/runs/39340562836)
leyó solo dos imágenes nuevas de Mulchén con Tesseract local: un banner genérico
y un afiche de labores de campo/cuidado de parcela. El segundo confirma requisitos
y atención presencial OMIL, pero ninguno aporta fecha editorial original ni
empleador identificable. No se aprobaron. Sus originales y OCR están en
369310263304aba0859169398fd780fbc1dee08e. No se volvió a leer ningún PDF agotado.

Esta tanda cubre nuevas fuentes municipales de Mulchén, el índice SSAN y fichas
forestales de CMPC; no es un barrido completo renovado de las nueve comunas.
La siguiente prioridad es ampliar cargos primarios accesibles y cerrar cada uno
con la misma evidencia. Falta instalar un descubrimiento y aprobación recurrentes
para más fuentes dentro de la arquitectura autorizada: estos jobs son explícitos
de la rama de reparación. No se afirma automatización general de redes sociales
ni un lector programado permanente desde una rama no principal.

Facebook e Instagram siguen sin una vía pública nueva acreditada. Las APIs de
noticias de Los Sauces y Nacimiento continúan excluidas por robots y no se repitió
su renderizado. Mininco se acredita aquí como lugar de trabajo de una empresa;
esto no acredita el canal oficial de Radio Mininco, que sigue pendiente. No se
contactó a instituciones ni se confundió falta de acceso con ausencia de avisos.


Los registros externos exigen comprobación fresca de menos de 24 horas, además
del cierre editorial. La validación de CMPC de esta tanda aún no tiene el ciclo
nativo periódico que sí tienen los tres cargos documentales de Traiguén. Por
tanto, mantener visible el cargo de Collipulli después de esa ventana requiere
revalidarlo por una vía pública y gratuita; no basta con su cierre de enero.
Este es un pendiente operativo explícito, no una cobertura continua ya instalada.
La continuación debe separar esa revalidación de cualquier publicación nueva.
