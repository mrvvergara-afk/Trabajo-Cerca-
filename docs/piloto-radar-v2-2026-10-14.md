# Piloto aislado del radar — 14 de octubre de 2026

Se implementó la primera versión del motor propuesto en [la decisión de arquitectura](decision-arquitectura-radar-2026-10-14.md), dentro de la rama independiente. El piloto no despliega código en AppDeploy, no publica ofertas, no integra `main`, no modifica credenciales ni ejecuta proveedores pagos. Es una comprobación de captación y procesamiento antes de conectar una nueva vía de publicación.

## Alcance y fuentes

Las comunas iniciales son Renaico y Negrete. Se prueban sus sitios municipales/OMIL y los dos Facebook municipales enlazados desde fuentes primarias. Los perfiles municipales no se presentan como perfiles dedicados de OMIL. El catálogo incluye Radio Barnachea como fuente regional que declara cobertura de Negrete, con acceso pendiente de la comprobación real, y el portal CMPC enlazado por su página corporativa. CMPC es una empresa regional; no se atribuye trabajo en las dos comunas a partir de su nombre.

El catálogo de seis entradas está en `config/radar-v2-pilot.json`. Todavía falta una muestra independiente de avisos reales que permita medir qué recupera el lector y qué omite. Una lista de fuentes o una ejecución exitosa no prueba cobertura de 45 días.

## Cambios del motor

- Cola SQLite independiente con identidad de tareas, intentos, leases y recuperación después de una interrupción. Un intento viejo no puede sobrescribir uno nuevo. Los reintentos son acotados y los fallos permanecen registrados.
- Archivo por hash de documentos e imágenes, con límites de tamaño y comprobación de integridad. Se conserva el original descargado; el lector no sustituye el histórico anterior.
- Lectura pública mediante navegador de los dos perfiles Facebook, sin iniciar sesión. Extrae solo publicaciones ligadas al perfil revisado, archivos de sus adjuntos y fechas literales del mismo objeto Story cuando existen. El horario de captura, una etiqueta relativa o un Story diferente no suministran la fecha original.
- Descubrimiento, descarga, lectura de cada página y evaluación son tareas separadas. Un PDF largo puede continuar en otra pasada; no se declara completo por haber leído la primera página.
- Dos pasadas por ejecución para comprobar continuación y reutilización de trabajo. Hasta 18 tareas por pasada, con tiempo y almacenamiento acotados.
- Entrada local de aportes mediante `python -m scripts.radar_v2_intake manifest.json --state state/radar-v2`. El manifiesto contiene `source_url`, `file` y, opcionalmente, `declared_publication_date`. Guarda el afiche/PDF sin peticiones de red ni publicación. Una fecha declarada y un archivo aportado requieren confirmar su origen antes de considerarlos verificados.
- El respaldo usa una rama de datos distinta, `radar-pilot-v2-state`; no sustituye `radar-state-laboratorio`, las ofertas publicadas ni sus recibos. Los snapshots anteriores y archivos originales quedan conservados en Git.

Ejemplo de un manifiesto de aportes, para un archivo real situado junto al manifiesto:

```json
[
  {"source_url":"URL real de la publicación original","file":"afiche.png","declared_publication_date":"fecha ISO declarada por el aportante"}
]
```

## Pruebas y ejecución

Las regresiones comprueban reanudación tras caída, rechazo de leases viejos, creación atómica de trabajos hijos, límites de reintento, snapshots y hashes, conservación de fechas por publicador, aportes sin confirmación y fechas sociales ligadas al Story exacto. Una prueba con un PDF escaneado ficticio de cinco páginas usa Poppler/Tesseract reales y comprueba que no pueda verificarse antes de procesar todas sus páginas. Las ofertas ficticias no se envían a la app.

La ejecución gratuita explícita usa `[radar v2 pilot]` o el input `radar_v2_pilot` en la rama de reparación de este repositorio público. No añade un cron ni autoejecuciones continuas. El resultado real se incorporará al terminar las dos pasadas y comprobar el respaldo.

## Condiciones pendientes

La lectura social puede no entregar la fecha o los archivos necesarios. Se registra la falta de datos y no se inventa la fecha. El piloto mantiene deshabilitada la publicación y no amplía la lista de fuentes admitidas por el puente de producción. Una oferta social que parezca completa sigue requiriendo validar esa integración antes de publicarla.

La muestra independiente, una prueba laboral real de cada vía difícil, siete días de observación y la colaboración de publicadores siguen pendientes. No se contactó a OMIL, medios ni empresas, ni se acordó una colaboración en su nombre. Este primer piloto no constituye una prueba completa de viabilidad del servicio ni una migración terminada.
