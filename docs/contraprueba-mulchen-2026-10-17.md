# Corrección acotada del descubrimiento de ofertas de Mulchén

## Resultado

Rama independiente `repair/mulchen-captura-2026-10-17`, basada en `5571c27`. No se modificó `main`, no se desplegó la app, no se ejecutó el publicador ni se alteró el histórico o las credenciales.

Se descargaron directamente el `robots.txt`, el [listado laboral municipal](https://www.munimulchen.cl/pagina-central-ofertas-laborales/), una ficha individual y la imagen enlazada. Se respetaron las reglas recuperadas de robots. Los originales se conservaron fuera del repositorio con URL, hora, MIME, tamaño y SHA-256.

El HTML original del listado contiene siete enlaces marcados como cerrados. La diferencia con la lectura anterior que devolvía cuatro abiertos no tiene causa probada; el original descargado permite documentar este estado sin atribuirlo a JavaScript. No se confirmó fecha original de publicación o cierre.

## Fallas comprobadas y correcciones

1. **Entrada del recolector:** el catálogo y el piloto apuntaban a `/?s=oferta+laboral`. Su respuesta devuelve otros concursos y contenido como una feria navideña de 2025; no devuelve los siete enlaces del boletín. Ambos archivos ahora apuntan al listado laboral dedicado.
2. **Selección de enlaces:** al reproducir el HTML original en `web_work`, el motor descubría siete fichas pero encolaba seis. Se agregó un límite configurable por fuente entre 1 y 12, con valor predeterminado de seis. Mulchén usa 12 para incluir sus siete fichas. El presupuesto de procesamiento por ejecución, la persistencia, la verificación y la publicación no se modificaron. No se declara cobertura completa.

No se implementó paginación ilimitada: una fuente con más enlaces que su límite sigue necesitando otro mecanismo de recorrido. Esta reparación resuelve el caso de siete fichas observado, no toda la cobertura territorial o social.

## Pruebas

- Antes/después con el mismo HTML original archivado: siete enlaces detectados; seis fichas encoladas antes y siete después. Es reproducción local de una captura real, no una ejecución programada ni una publicación.
- Regresión con el patrón de siete enlaces: la cola conserva todos los enlaces al cerrar y reabrir SQLite, respeta el límite de trabajo por ejecución y procesa cada ficha una sola vez. Los documentos de esa prueba son fixtures sin fecha y no se convierten en ofertas elegibles.
- Configuraciones fuera de rango se rechazan antes de abrir una URL.
- `python -m unittest tests.test_mulchen_discovery tests.test_radar_v2 tests.test_radar_v2_structural tests.test_source_coverage tests.test_local_source_audit`: **50 pruebas aprobadas**.
- `git diff --check`: aprobado.

El OCR real se ejecutó sobre la imagen descargada y se inspeccionó visualmente. Es una portada genérica con el texto «Nueva Oferta Laboral», no un afiche con cargo, requisitos y contacto. El motor local solo tiene inglés y OSD instalados: la extracción obtuvo una confianza media de 37,4 y no constituye una prueba satisfactoria de lectura de un aviso laboral real. El workflow ya prevé instalar español, pero esa disponibilidad no debe suponerse en todos los entornos.

## Pendiente para obtener publicaciones difíciles

Ninguno de estos siete avisos queda aprobado para publicar como vigente o como histórico de hasta 45 días. Se requiere un aviso original real con fecha comprobable, adquisición permitida de su afiche/PDF y lectura suficiente de sus campos. Si vive únicamente en Facebook/Instagram, debe comprobarse la vía de acceso a esa publicación; instalar un navegador o un OCR no concede ese acceso.

La siguiente prueba debe usar un afiche laboral específico y conservar página de origen, archivo, fecha, texto extraído y motivos de aceptación o revisión. No se prometen publicaciones automáticas por corregir este listado. No se iniciaron tareas en segundo plano ni se contrataron servicios.
