# Adecuaciones territoriales del diseño actual — 21 de octubre de 2026

La versión `1792577207641` está ready en el laboratorio Trabajo Cerca. Implementación: `90c4516d1cea5127bca8ebb82f2c7ce2fc8f3b3b`, exclusivamente en `repair/mulchen-captura-2026-10-17`.

Se conservó el diseño actual y se agregó Buscar también en Los Ángeles, Victoria y Temuco con elección explícita y conteos del inventario completo. Las ofertas exclusivas de esas ciudades no se mezclan con la vista local; no se borraron registros. Los recolectores públicos existentes alternan esas ciudades con menor prioridad dentro del presupuesto existente. No se aumentaron crons ni frecuencias.

La publicidad ahora aparece junto al buscador y dentro del listado; acepta campaña exacta de la comuna o regional, y descarta una campaña de otra comuna. Sin campaña se muestra un espacio disponible, no un anuncio pagado ficticio. La impresión requiere al menos 50% visible durante un segundo; cargar la campaña no cuenta como impresión. Se mantiene el formulario existente sin cobros automáticos.

Actualidad laboral muestra una noticia revisada de Tiempo21, publicada originalmente el 30 de septiembre de 2026, sobre desocupación regional del trimestre junio–agosto. Tiene fuente, fecha y enlace original. Los siete accesos oficiales son recursos permanentes, separados de las noticias y del contador de ofertas. La selección es editorial manual; no se instaló sincronización automática de noticias.

Validación previa: los 30 archivos de pruebas Node pasaron; entre ellos seis casos nuevos del modelo territorial, 24 del recolector y 18 de adaptadores públicos. AppDeploy compiló y quedó ready sin errores frontend, backend ni de red reportados. No existe un resultado E2E detallado de AppDeploy (QA run not found); no se atribuyen siete pruebas aprobadas a ese servicio. Se prepara una comprobación real de lectura mediante el job existente site-inventory-proof, sin crear tareas nuevas: SDK completo, navegación móvil/escritorio, ciudades, publicidad y noticias.

Advertencias heredadas: AppDeploy sigue señalando dos iconos PWA no inspeccionables. Los siete casos configurados generan una recomendación de reducir a 3–5, no un error de validación.

Respaldo anterior comprimido con hashes: `docs/evidence/diseno-territorial-respaldo-2026-10-21.json`. Manifiesto de cambios: `integrations/appdeploy/territorial-design-update.json`. No se modificaron main, credenciales ni originales históricos. Esta continuación publicó **cero ofertas nuevas**: el objetivo fue la interfaz y su funcionamiento. Los resultados de inventario y navegación se agregarán tras observar la app.
