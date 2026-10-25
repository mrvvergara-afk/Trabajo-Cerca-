# Adecuaciones territoriales del diseño actual — 21 de octubre de 2026

La versión `1792577207641` está ready en el laboratorio Trabajo Cerca. Implementación: `90c4516d1cea5127bca8ebb82f2c7ce2fc8f3b3b`, exclusivamente en `repair/mulchen-captura-2026-10-17`.

Se conservó el diseño actual y se agregó Buscar también en Los Ángeles, Victoria y Temuco con elección explícita y conteos del inventario completo. Las ofertas exclusivas de esas ciudades no se mezclan con la vista local; no se borraron registros. Los recolectores públicos existentes alternan esas ciudades con menor prioridad dentro del presupuesto existente. No se aumentaron crons ni frecuencias.

La publicidad ahora aparece junto al buscador y dentro del listado; acepta campaña exacta de la comuna o regional, y descarta una campaña de otra comuna. Sin campaña se muestra un espacio disponible, no un anuncio pagado ficticio. La impresión requiere al menos 50% visible durante un segundo; cargar la campaña no cuenta como impresión. Se mantiene el formulario existente sin cobros automáticos.

Actualidad laboral muestra una noticia revisada de Tiempo21, publicada originalmente el 30 de septiembre de 2026, sobre desocupación regional del trimestre junio–agosto. Tiene fuente, fecha y enlace original. Los siete accesos oficiales son recursos permanentes, separados de las noticias y del contador de ofertas. La selección es editorial manual; no se instaló sincronización automática de noticias.

Validación previa: los 30 archivos de pruebas Node pasaron; entre ellos seis casos nuevos del modelo territorial, 24 del recolector y 18 de adaptadores públicos. AppDeploy compiló y quedó ready sin errores frontend, backend ni de red reportados. No existe un resultado E2E detallado de AppDeploy (QA run not found); no se atribuyen siete pruebas aprobadas a ese servicio. La comprobación real del job existente site-inventory-proof terminó correctamente en el run 39583863308: SDK completo, navegación móvil/escritorio, ciudades, formulario publicitario y noticias. No se crearon tareas nuevas.

Advertencias heredadas: AppDeploy sigue señalando dos iconos PWA no inspeccionables. Los siete casos configurados generan una recomendación de reducir a 3–5, no un error de validación.

Respaldo anterior comprimido con hashes: `docs/evidence/diseno-territorial-respaldo-2026-10-21.json`. Manifiesto de cambios: `integrations/appdeploy/territorial-design-update.json`. No se modificaron main, credenciales ni originales históricos. Esta continuación publicó **cero ofertas nuevas**: el objetivo fue la interfaz y su funcionamiento. 

## Resultado observado en la app

Prueba de navegador del 21-oct-2026 a las 10:20 UTC, run [39583863308](https://github.com/mrvvergara-afk/Trabajo-Cerca-/actions/runs/39583863308), job 119167813040: éxito. Se leyó el feed completo mediante el SDK: **53 registros, 51 tipados como oferta**, manifiesto `d95bf3b3-5ec6-42fb-b388-81e577d0fe19`. La portada mostró 20 tarjetas de oferta en su primera página y el encabezado conservó el total 51. Son inventario heredado/publicado; no representan 51 vacantes nuevas o verificadas por esta continuación.

Los botones mostraron **Los Ángeles 3, Victoria 6 y Temuco 3**, coincidiendo con los registros del inventario completo cuyas comunas contienen cada ciudad. Un aviso de varias comunas puede contar en más de una ciudad: no sumar estos valores para inventar un total de empleos únicos. La calidad y ubicación heredadas siguen necesitando revisión individual; mostrar un conteo no revalida esos avisos.

En 390×844 y 1440×1000 se probó elegir cada ciudad, regresar a la zona local, conservar el total global, mostrar publicidad con el nombre de la ciudad, abrir y cerrar el formulario sin enviarlo, y mostrar la noticia fechada con su enlace y siete recursos oficiales. Cero errores JavaScript y cero desbordamiento horizontal. No se contrató publicidad ni se enviaron solicitudes o postulaciones. No había una campaña pagada de prueba; la medición de impresiones quedó instalada pero esta prueba no acredita ingresos ni métricas de una campaña real.

Los tres IDs existentes de Traiguén están presentes. El estado nativo informa revalidación exitosa el 21-oct a las 01:05:39 UTC y próxima revisión a las 13:05:39 UTC; se leyó ese estado, no se disparó otra revalidación ni se contó como publicación. La observación también conserva el ID existente CMPC del inventario, sin volver a publicar el cargo.

Se comprobó main en `fab392b824e4100a4bba6dfe9289825297d24707`, sin cambios. Los seis crons conservan sus expresiones y frecuencia. La prueba observó inventario actual, sin atribuir diferencias frente a capturas antiguas a vencimientos no demostrados. Evidencia completa con IDs: `docs/evidence/diseno-territorial-validacion-2026-10-21.json`.

Pendiente: revisar calidad heredada y nuevas ofertas concretas por fuente; comprobar el rendimiento de la captación secundaria con ejecuciones reales posteriores; mantener la selección de noticias con fechas y fuentes; revisar los iconos PWA heredados. No se promete captación recurrente de redes sociales bloqueadas ni sincronización automática de noticias.
