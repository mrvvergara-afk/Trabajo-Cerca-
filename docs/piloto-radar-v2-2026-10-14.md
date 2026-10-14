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

## Primera ejecución real

La ejecución [38570040009](https://github.com/mrvvergara-afk/Trabajo-Cerca-/actions/runs/38570040009) terminó correctamente sobre `576d0539d9edd4ad5d442a422782b86471bd0cb6`, con **264 pruebas aprobadas: 120 Python y 144 Node**. El navegador encontró un enlace público en cada perfil Facebook, pero no obtuvo fecha ni adjuntos en el HTML/JSON de esos perfiles. Los cuatro puntos web se leyeron y la cola continuó en la segunda pasada.

La primera pasada completó 18 tareas y dejó siete pendientes. La segunda completó doce más; el inventario terminó con 30 tareas realizadas, 30 intentos, 98 observaciones y 20 objetos archivados. Se evaluaron 11 casos y ninguno fue elegible. El snapshot `89dc35744fea0bb7e3b8142fe8e2a55a0e5d8a4e` quedó en la rama aislada `radar-pilot-v2-state`; no se tocó el respaldo del radar anterior. La evidencia compacta está en [primer resultado](evidence/radar-v2-first-pilot-2026-10-14.json).

Esta pasada identificó dos defectos de captación: faltaba abrir cada publicación social y leer sus elementos propios, y varios archivos locales conservaban la URL de un índice general como identidad de evaluación. También se estaba omitiendo la selección de algunos enlaces PDF titulados «Bases» o «Decreto». Se preparó una corrección que conserva el índice como procedencia y usa el archivo original como identidad cuando el publicador ya es admitido.

La segunda comprobación abrirá las publicaciones individuales, leerá sus adjuntos y probará obtener una fecha completa visible del mismo enlace. Una antigüedad relativa seguirá sin convertirse en fecha original. Se amplió además el contador de días observados y se mantiene compatibilidad con el snapshot anterior, sin reiniciar la base. No hubo publicaciones del piloto ni llamadas a proveedores pagos.

## Segunda ejecución y continuidad del respaldo

La ejecución [38573547778](https://github.com/mrvvergara-afk/Trabajo-Cerca-/actions/runs/38573547778), sobre `a3c71c9491e33b14bf7226bde6265bf3b4deb9a3`, aprobó **269 pruebas: 123 Python y 146 Node**. Restauró la base y los originales del primer piloto, mantuvo sus 30 tareas terminadas y continuó el trabajo con el lector corregido.

Terminó con 87 tareas registradas, 66 realizadas y 21 pendientes; 47 objetos originales/resultados archivados, 394 observaciones y cuatro pasadas acumuladas en un día. El respaldo posterior es `eadd99c2b4a3985772818d04098fdc0cab5214d6`. Se evaluaron 18 casos sin un aviso elegible. Las páginas públicas de Facebook volvieron a variar: Renaico no entregó enlaces y Negrete entregó uno, sin fecha completa ni adjuntos recuperables en esta lectura. No se forzó inicio de sesión ni se sustituyó esa falta de fecha por el horario del navegador.

El cambio sí permitió descubrir y descargar PDF municipales que antes quedaban fuera por estar enlazados como «Bases» o «Decreto». Sus páginas quedaron en la cola para continuar, con el archivo original y su índice separados. Se añadió una pasada final que procesa únicamente trabajo ya recuperado, sin otra lectura de perfiles. Su resultado se incorpora al completar el respaldo siguiente. La evidencia de esta fase está en [segundo resultado](evidence/radar-v2-second-pilot-2026-10-14.json).

## Condiciones pendientes

La lectura social puede no entregar la fecha o los archivos necesarios. Se registra la falta de datos y no se inventa la fecha. El piloto mantiene deshabilitada la publicación y no amplía la lista de fuentes admitidas por el puente de producción. Una oferta social que parezca completa sigue requiriendo validar esa integración antes de publicarla.

La muestra independiente, una prueba laboral real de cada vía difícil, siete días de observación y la colaboración de publicadores siguen pendientes. No se contactó a OMIL, medios ni empresas, ni se acordó una colaboración en su nombre. Este primer piloto no constituye una prueba completa de viabilidad del servicio ni una migración terminada.
