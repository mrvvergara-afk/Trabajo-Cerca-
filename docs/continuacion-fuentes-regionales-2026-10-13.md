# Continuación del radar regional — 13 de octubre de 2026

La reparación está aplicada en la app indicada por el usuario: https://trabajo-cerca-laboratorio-3ojgro.v2.appdeploy.ai/, versión **1791920772060**, estado `ready`. Se confirmó **una oferta nueva de BNE visible en el feed**, además de las dos ofertas del piloto anterior. No equivale a haber resuelto la cobertura de Facebook, Instagram o los afiches de las nueve comunas.

El código y los parches se conservan en `repair/radar-audit-2026-10-11`. La reparación nativa corresponde a `795c4947d3148ab0d9dc9e36abab456017eb94b4`; el catálogo y el lector externo actualizado, a `4793ce273297df199f5085013a42eca13897078f`. **No se integró `main`**: conserva `fab392b824e4100a4bba6dfe9289825297d24707`. No se borraron ofertas históricas ni se modificaron credenciales. No se contrataron servicios ni se iniciaron capturas con proveedores pagos; los calendarios y cuotas preexistentes permanecen iguales.

## Publicación real comprobada

Fuente: https://www.bne.gob.cl/oferta/2026-109726. Aviso de cajeros de peaje en Negrete, de O & C SERVICIOS GENERALES SPA, con 20 vacantes. La fuente indica publicación el **15/09/2026** y cierre el **17/11/2026**. Tiene 28 días de antigüedad en la comprobación; son **20 plazas en una publicación**, no 20 ofertas nuevas.

La lectura mediante el SDK de la app terminó el **13/10/2026 a las 19:52:06 UTC**: cinco fuentes, ocho lecturas HTTP, tres candidatos comprobados, uno verificado y uno guardado. En ese instante se contabilizaron cero publicaciones. Se esperó el ciclo existente del escritor, sin ejecutarlo manualmente. El feed se actualizó a las **20:05:39 UTC** y la lectura posterior de las **20:06:22 UTC** confirmó este ID visible:

`free-d294f2d92f9e56840e53553adef2420f48b30847`

También seguían visibles los IDs anteriores `2ca4362e-d4fb-4d6c-a12e-dfa42849b019` y `c4be30bb-57c1-45c1-9832-18065b54d498`. La generación del feed era completa, con 54 elementos públicos informados por su manifiesto. Ese total incluye el inventario anterior; no se atribuyen 54 publicaciones nuevas a esta reparación. El recibo antiguo de ingesta firmada sigue informando dos publicaciones porque pertenece al piloto externo; la oferta nueva proviene del recolector público nativo y tiene un recibo separado.

La prueba de interfaz y la suite anterior terminaron correctamente en [Actions 38458175368](https://github.com/mrvvergara-afk/Trabajo-Cerca-/actions/runs/38458175368). La evidencia compacta con IDs, horas, bloqueos y lecturas se conserva en [regional-source-observation-2026-10-13.json](../integrations/appdeploy/regional-source-observation-2026-10-13.json).

## Errores encontrados y cambios realizados

| Problema confirmado | Reparación y alcance |
| --- | --- |
| BNE tiene datos laborales útiles en etiquetas HTML propias; exigir exclusivamente `JobPosting` descartaba esta fuente. | Adaptador específico de página individual: título, empresa, región/comuna, fechas y postulación. Se valida que el contenido corresponde a la misma oferta. El método declara lectura de etiquetas oficiales, sin afirmar que la fuente contiene JSON-LD. El piloto pasó de candidato a publicación visible. |
| La decodificación fija en UTF-8 dañaba acentos en páginas con otra codificación, incluida BNE. | Lectores nativo y externo respetan las codificaciones admitidas del encabezado o del HTML. Una codificación no admitida queda pendiente. |
| Las portadas corporativas no eran las rutas concretas de empleo. | El catálogo nativo ahora apunta a `cmpc.trabajando.cl` y `jobs.arauco.com/Chile/search/`. Se añadió identidad estable para páginas individuales de Arauco. Una portada o una vacante forestal de otra región no se publica como empleo de una comuna solicitada. |
| La cola nativa estaba cerca de su límite de 100 candidatos; el orden favorecía enlaces de portales y documentos que el lector HTML no podía resolver. | Selección rotativa entre avisos locales, portales y agregadores; pequeña cola separada para incorporación de fuentes revisadas y reverificación. El piloto nuevo pudo entrar sin desalojar pendientes anteriores. Los documentos quedan señalados para el lector local. |
| Se confundían navegación municipal y texto genérico sobre equipos de trabajo con avisos. | Se excluyen navegación, cabeceras y pies de página; el descubrimiento exige señales concretas de contratación. Las pruebas cubren los falsos positivos. |
| Los enlaces descubiertos fuera de la capacidad de la cola podían perderse. | Cada lectura guarda su evidencia de candidatos en `free_public_source_reads`. Cursores, recibo, estados de fuentes y evidencia se escriben mediante una transacción y con límites de bytes comprobados. Guardar esa evidencia no afirma que todos sus enlaces estén ya procesados. |
| Había poca diversidad de medios revisados. | Se incorporaron Radio Viaducto de Collipulli y Las Noticias de Malleco; sus portadas respondieron HTTP 200. Los perfiles de Facebook e Instagram enlazados por Las Noticias quedaron registrados para lectura pública, sin agregarlos como objetivos pagos. No se comprobó una publicación laboral nueva de esos medios. |
| La comprobación de publicación estaba centrada en el recibo del piloto firmado y podía omitir una oferta del recolector nativo. | El observador relaciona cada recibo nuevo con su ID visible y espera el escritor existente. Se comprobó BNE por esa ruta, conservando la distinción entre detectado, guardado y publicado. |

Los parches de los cinco archivos nativos están en [regional-source-repair.json](../integrations/appdeploy/regional-source-repair.json), y el cambio acotado del catálogo en [regional-source-index-diff.json](../integrations/appdeploy/regional-source-index-diff.json). No se sustituyó el backend completo ni se modificó el frontend en esta continuación.

La [entrega anterior](ampliacion-fuentes-publicas-2026-10-13.md) documenta otras correcciones que siguen vigentes: fechas literales de Chiletrabajos, adaptadores de Indeed/Computrabajo/LinkedIn/Laborum, resolución del origen de Opción Empleo, reverificación antes de las 24 horas, ingesta con recibos y reconstrucción del feed por páginas. Las pruebas de conservación y escritura parcial siguen en la suite.

## Fuentes y bloqueos observados

El catálogo nativo tiene **62 direcciones** y mantiene ocho lecturas HTTP por ciclo. El registro externo tiene **31 entradas**, de las cuales **18** son fuentes HTML admitidas; las restantes incluyen perfiles sociales e identidades pendientes. Son conteos distintos: registrar una dirección no acredita cobertura histórica ni una oferta publicada.

La inspección directa de [Actions 38435343271](https://github.com/mrvvergara-afk/Trabajo-Cerca-/actions/runs/38435343271) comprobó BNE, CMPC, Arauco y los dos medios regionales. También encontró:

- La búsqueda RSS de empleo de Mulchén devolvió HTTP 500. La consulta WordPress equivalente respondió HTTP 200 con una lista vacía. Esto describe esas rutas; no prueba que la municipalidad no tenga avisos en otros canales.
- El RSS de Negrete respondió HTTP 200, pero un aviso de postulación a puestos de venta no demuestra una vacante laboral.
- En la lectura nativa, Indeed y Computrabajo para Los Sauces respondieron HTTP 403. CMPC respondió HTTP 200, sin aportar candidatos verificables en esa lectura. La página OMIL de Negrete quedó pendiente por falta de datos de una oferta individual, y un candidato de LinkedIn por evidencia insuficiente de empleador/postulación.
- Radio Mininco está acreditada territorialmente por una nota de Corprix del 6 de octubre y un acta municipal de Collipulli. Sigue pendiente identificar su canal oficial publicador; la dirección provisional no se habilitó como identidad validada.
- Una fecha reciente del buscador, del rastreo o de una página espejo no convierte un anuncio antiguo en actual. Se encontraron referencias municipales de años o temporadas anteriores. Se mantiene la fecha original, el límite de 45 días y la obligación de comprobar vigencia.

## Pruebas ejecutadas

**225 pruebas aprobadas: 91 Python y 134 Node.** La revisión final del catálogo pasó en [Actions 38461230472](https://github.com/mrvvergara-afk/Trabajo-Cerca-/actions/runs/38461230472), sobre `4793ce273297df199f5085013a42eca13897078f`. Los jobs de productores, publicación externa y captura manual quedaron omitidos en esa revisión; la observación de la app fue de lectura.

Comandos reproducibles:

```sh
python -m unittest discover -s tests -v
for suite in tests/*.test.mjs; do node "$suite"; done
git diff --check
```

Se probaron fechas originales y cierres, lugares incompatibles, empresa/postulación ausentes, otra URL canónica o varios avisos, identidad BNE/Arauco, codificación, redirecciones, cola llena sin desalojos, selección de medios, conservación del descubrimiento y recuperación transaccional. La suite completa conserva las pruebas de OCR/PDF, persistencia, idempotencia, reverificación e ingesta/feed. Usa avisos ficticios y no los inserta en la app.

AppDeploy informó `ready`, sin errores reportados de frontend, backend o red. No devolvió resultados individuales de sus pruebas E2E; no se atribuye una cifra de pruebas de navegador a ese estado. La prueba real separada es el ID de BNE observado en el feed.

## Qué falta para ampliar las publicaciones automáticas

1. **Conectar los afiches/PDF al recorrido programado.** La última lectura nativa dejó 96 candidatos pendientes, incluidos 29 documentos que necesitan el lector local gratuito. Tesseract/Poppler y la extracción literal están preparados y probados en el productor externo. El recolector nativo sigue leyendo HTML; no se presentó como OCR automático ya conectado. El productor actualizado requiere integración revisada en `main` o un ejecutor equivalente autorizado con persistencia y el mismo puente de ingesta.
2. **Confirmar los canales exactos de las nueve OMIL, radios y empresas.** Los sitios municipales de Angol, Lumaco, Los Sauces, Traiguén, Renaico, Nacimiento, Negrete, Mulchén y Collipulli están registrados. Falta comprobar sus perfiles publicadores de Facebook/Instagram, el de Radio Mininco y más empleadores agrícolas/locales. No se inventaron URLs para cubrir la lista.
3. **Resolver el acceso permitido a redes sociales.** Los perfiles conocidos pueden mostrar login, bloqueo o contenido no entregado por HTTP público. Para esos casos hacen falta canales accesibles, archivos o exportaciones autorizadas del publicador, o un acceso permitido. El OCR no recupera una imagen que no puede descargarse. Esta entrega no contrató servicios ni inició capturas pagas.
4. **Completar la recuperación de hasta 45 días.** Se conserva paginación, rotación y evidencia, pero no se acreditó haber recorrido todos los avisos de cada canal. Hay que continuar el recorrido, resolver las fuentes bloqueadas y medir ofertas únicas verificadas/publicadas por comuna. Los históricos anteriores se conservan como datos aunque ya no sean publicables.
5. **Verificar avisos locales incompletos sin inventar vigencia.** Teléfonos y correos sirven como datos de postulación, pero no bastan para acreditar fecha original, empleador y lugar. Avisos sin fecha, con cierre desconocido o con varios cargos siguen necesitando evidencia suficiente; no se marcaron vigentes por la fecha de captura.
6. **Observar los próximos ciclos del recolector y la reverificación.** La publicación del nuevo aviso mediante el escritor automático quedó comprobada. El calendario del recolector permanece activo; todavía falta observar un ciclo programado completo con esta versión y continuidad después de las 24 horas. No se reiniciaron proveedores para forzar el resultado.
7. **Cerrar la operación del productor externo y su respaldo.** El respaldo anterior y `radar-public-evidence` permanecen intactos. Los artefactos de Actions duran siete días y no sustituyen una base durable. Antes de depender de `main` hay que revisar sus cambios, comprobar restauración/ingesta y definir retención del histórico. No se fusiona esta rama automáticamente.

El trabajo gratuito permite procesar HTML público, imágenes/PDF descargables y fuentes empresariales accesibles. Para avanzar en Meta, el recurso que falta en los casos bloqueados es el acceso al contenido y la identificación del canal correcto. No hay evidencia que justifique contratar otro proveedor antes de completar estas conexiones y comprobar su rendimiento.
