# Trabajo Cerca: diseño compacto aplicado y verificado

Fecha: 22 de octubre de 2026. Laboratorio: https://trabajo-cerca-laboratorio-3ojgro.v2.appdeploy.ai/ . AppDeploy ready `1792676091153`, base `1792632646829`. Rama exclusiva `repair/mulchen-captura-2026-10-17`. Sin integración a main ni lanzamiento general.

## Resultado visible
- Cabecera móvil de 64 px, de una sola línea; sale de pantalla al desplazarse. Cuenta y administración autorizada dentro de Menú.
- Búsqueda con comuna y tres accesos claros: buscar trabajo, ofrecer trabajo/oficio y contratar. Los formularios existentes se conservan.
- Navegación inferior de 58 px con cuatro accesos, oculta durante formularios; pie de página accesible.
- Campañas HOUSE_AD compactas y diferenciadas de empleos. Rotación y prioridades comerciales reutilizan el sistema existente. Ciudades complementarias y actualidad laboral después de resultados.

## Validación
Run final [39788894809](https://github.com/mrvvergara-afk/Trabajo-Cerca-/actions/runs/39788894809), job 119859309237, aprobado. 243 pruebas Python y 325 Node; Vite, TypeScript y Playwright correctos. Cuatro tamaños: 320×568, 390×844, 768×1024 y 1440×1000. Sin desbordamiento lateral, formularios adecuados, menú con Escape, pie sin solapamiento. Ensayo sin anunciantes ni profesionales aprobado, con SDK simulado solo en qa/. Las tres tarjetas sintéticas de medición NO se desplegaron ni cuentan como ofertas.

Navegación live aprobada a 390×844 y 1440×1000: menú y cuenta, acceso administrativo anónimo denegado, ciudades con regreso al catálogo, formulario comercial abierto y cerrado sin envío, diálogos legales con foco y Escape. Sin errores de página. QA AppDeploy sin errores frontend/backend/red.

Lectura SDK completa: 57 registros, 56 tipados job_offer en cuatro páginas, 11 tarjetas de empleo iniciales. Los tres IDs de Traiguén están en el feed. Es inventario heredado observado, no una certificación editorial de 56 vacantes ni publicaciones nuevas. Esta intervención publicó **cero ofertas nuevas**. Se conserva captura por ID; no se atribuyen diferencias con fechas anteriores a vencimiento sin prueba.

Política desplegada `security-containment-v2`: proveedores pagos, IA remota, analítica externa y operaciones manuales false. Las siete comprobaciones SDK conservan las denegaciones esperadas: seis 401 y carga remota de foto 503. Carga de foto deshabilitada con explicación desde el menú. No se recolectaron fuentes ni se enviaron formularios comerciales.

## Errores encontrados durante la comprobación
El primer observador seguía buscando `.neoTileRadar`, eliminado por el nuevo menú; el run 39788432474 llegó a aprobar inventario, navegación y revisión pasiva pero falló en ese selector antiguo. Se actualizó el observador para abrir Compartir un aviso con el Radar desde Menú, conservando las siete aserciones de seguridad. El run final pasó completo. Un ensayo anterior de geometría medía durante el desplazamiento suave; se corrigió la sincronización de medición usando desplazamiento instantáneo, sin falsear espacios ni eliminar aserciones.

## Límites y pendientes
Continúan los dos PNG de 512 px inválidos y las cabeceras de seguridad ausentes; sitemap devuelve 403. La identificación legal completa y la restauración integral de plataforma siguen sin certificarse. Este cambio visual no declara la app apta para lanzamiento general. PostHog sigue deshabilitado; las métricas propias usan primera parte. La administración de campañas y la aprobación comercial se probaron mediante adaptador local; no se suplantó al propietario ni se activaron clientes de ensayo en el laboratorio. La reserva contractual de impresiones requiere un sistema comercial adicional; aquí se conserva prioridad y ubicación existentes.

No se cambiaron credenciales, historial ni cantidad/frecuencia de crons. Los cambios desplegados excluyen qa/, fixtures y sustitutos del SDK. El contrato JSON conserva las 16 comprobaciones anteriores y agrega dos verificaciones seguras del diseño; AppDeploy recomienda reducir su cantidad, sin error de validación.

## Evidencia durable
Los JSON de inventario, navegación, seguridad, límites de producción y ensayo quedan en docs/evidence/*diseno-compacto-2026-10-22.json. Artefacto final 12431086291: SHA-256 f592eeaeb4c2690990086896d6f173cb6496c9520118675c1165d4c183d00cd6. Las evidencias se conservan en Git además del artefacto temporal de CI.
