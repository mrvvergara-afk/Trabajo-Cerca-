# Piloto aislado del radar — 14 de octubre de 2026

Se implementó la primera versión del motor propuesto en [la decisión de arquitectura](decision-arquitectura-radar-2026-10-14.md), dentro de la rama independiente. El piloto no despliega código en AppDeploy, no publica ofertas, no integra `main`, no modifica credenciales ni ejecuta proveedores pagos. Es una comprobación de captación y procesamiento antes de conectar una nueva vía de publicación.

## Alcance y fuentes

Las comunas iniciales son Renaico y Negrete. Se prueban sus sitios municipales/OMIL y los dos Facebook municipales enlazados desde fuentes primarias. Los perfiles municipales no se presentan como perfiles dedicados de OMIL. El catálogo incluye Radio Barnachea como fuente regional que declara cobertura de Negrete, con acceso pendiente de la comprobación real, y el portal CMPC enlazado por su página corporativa. CMPC es una empresa regional; no se atribuye trabajo en las dos comunas a partir de su nombre.

El catálogo de seis entradas está en `config/radar-v2-pilot.json`. Los cuatro puntos web respondieron en las ejecuciones reales. Eso confirma acceso a esas páginas, no cobertura de su contenido dinámico o de sus archivos históricos. Todavía falta una muestra independiente de avisos reales que permita medir qué recupera el lector y qué omite. Una lista de fuentes o una ejecución exitosa no prueba cobertura de 45 días.

## Cambios del motor

- Cola SQLite independiente con identidad de tareas, intentos, leases y recuperación después de una interrupción. Un intento viejo no puede sobrescribir uno nuevo. Los reintentos son acotados y los fallos permanecen registrados.
- Archivo por hash de documentos e imágenes, con límites de tamaño y comprobación de integridad. Se conserva el original descargado; el lector no sustituye el histórico anterior.
- Lectura pública mediante navegador de los dos perfiles Facebook, sin iniciar sesión. Extrae solo publicaciones ligadas al perfil revisado, archivos de sus adjuntos y fechas literales del mismo objeto Story cuando existen. El horario de captura, una etiqueta relativa o un Story diferente no suministran la fecha original.
- Descubrimiento, descarga, lectura de cada página y evaluación son tareas separadas. Un PDF largo puede continuar en otra pasada; no se declara completo por haber leído la primera página.
- Dos pasadas de hasta 18 tareas y una pasada final de hasta 40 tareas ya en cola, con tiempo y almacenamiento acotados. La última no vuelve a abrir perfiles sociales.
- Directorios separados de avisos individuales: la antigüedad del directorio no bloquea sus enlaces y su fecha no se transmite a los afiches/PDF. La verificación de cada aviso conserva el límite de 45 días.
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

La ejecución gratuita explícita usa `[radar v2 pilot]` o el input `radar_v2_pilot` en la rama de reparación de este repositorio público. No añade un cron ni autoejecuciones continuas. Las tres ejecuciones y sus respaldos se detallan abajo.

## Primera ejecución real

La ejecución [38570040009](https://github.com/mrvvergara-afk/Trabajo-Cerca-/actions/runs/38570040009) terminó correctamente sobre `576d0539d9edd4ad5d442a422782b86471bd0cb6`, con **264 pruebas aprobadas: 120 Python y 144 Node**. El navegador encontró un enlace público en cada perfil Facebook, pero no obtuvo fecha ni adjuntos en el HTML/JSON de esos perfiles. Los cuatro puntos web se leyeron y la cola continuó en la segunda pasada.

La primera pasada completó 18 tareas y dejó siete pendientes. La segunda completó doce más; el inventario terminó con 30 tareas realizadas, 30 intentos, 98 observaciones y 20 objetos archivados. Se evaluaron 11 casos y ninguno fue elegible. El snapshot `89dc35744fea0bb7e3b8142fe8e2a55a0e5d8a4e` quedó en la rama aislada `radar-pilot-v2-state`; no se tocó el respaldo del radar anterior. La evidencia compacta está en [primer resultado](evidence/radar-v2-first-pilot-2026-10-14.json).

Esta pasada identificó dos defectos de captación: faltaba abrir cada publicación social y leer sus elementos propios, y varios archivos locales conservaban la URL de un índice general como identidad de evaluación. También se estaba omitiendo la selección de algunos enlaces PDF titulados «Bases» o «Decreto». Se preparó una corrección que conserva el índice como procedencia y usa el archivo original como identidad cuando el publicador ya es admitido.

La segunda comprobación abrirá las publicaciones individuales, leerá sus adjuntos y probará obtener una fecha completa visible del mismo enlace. Una antigüedad relativa seguirá sin convertirse en fecha original. Se amplió además el contador de días observados y se mantiene compatibilidad con el snapshot anterior, sin reiniciar la base. No hubo publicaciones del piloto ni llamadas a proveedores pagos.

## Segunda ejecución y continuidad del respaldo

La ejecución [38573547778](https://github.com/mrvvergara-afk/Trabajo-Cerca-/actions/runs/38573547778), sobre `a3c71c9491e33b14bf7226bde6265bf3b4deb9a3`, aprobó **269 pruebas: 123 Python y 146 Node**. Restauró la base y los originales del primer piloto, mantuvo sus 30 tareas terminadas y continuó el trabajo con el lector corregido.

Terminó con 87 tareas registradas, 66 realizadas y 21 pendientes; 47 objetos originales/resultados archivados, 394 observaciones y cuatro pasadas acumuladas en un día. El respaldo posterior es `eadd99c2b4a3985772818d04098fdc0cab5214d6`. Se evaluaron 18 casos sin un aviso elegible. Las páginas públicas de Facebook volvieron a variar: Renaico no entregó enlaces y Negrete entregó uno, sin fecha completa ni adjuntos recuperables en esta lectura. No se forzó inicio de sesión ni se sustituyó esa falta de fecha por el horario del navegador.

El cambio sí permitió descubrir y descargar PDF municipales que antes quedaban fuera por estar enlazados como «Bases» o «Decreto». Sus páginas quedaron en la cola para continuar, con el archivo original y su índice separados. Se añadió una pasada final que procesa únicamente trabajo ya recuperado, sin otra lectura de perfiles. Su resultado se incorpora al completar el respaldo siguiente. La evidencia de esta fase está en [segundo resultado](evidence/radar-v2-second-pilot-2026-10-14.json).

## Tercera ejecución: documentos terminados y límite real de la captación

La ejecución [38576653077](https://github.com/mrvvergara-afk/Trabajo-Cerca-/actions/runs/38576653077), sobre `6aa54cc5f80f53593019e64a74be3f28a24c71b6`, aprobó las mismas **269 pruebas** y continuó el snapshot anterior. Terminó con **94 tareas realizadas, cero pendientes, 94 intentos, 704 observaciones y 69 objetos archivados**. Conserva los 47 objetos del respaldo anterior. La integridad de SQLite devolvió `ok`. El nuevo snapshot es `9d73a79f6529272f1c0da5a5b824527f99ade751`, en la rama de datos independiente.

Se completaron **40 páginas de cinco PDF** y cinco páginas de imágenes. No se confundió un límite de trabajo por pasada con un documento terminado. Tres documentos largos quedaron señalados como incompletos para la evaluación porque el texto reunido se trunca o la confianza OCR no basta, aunque sus páginas y resultados individuales están archivados. Leer todas las páginas no garantiza extracción suficiente para publicar.

Hubo **24 evaluaciones acumuladas y cero avisos elegibles**. Los motivos fueron: 13 casos con puente social/empresarial sin validar, cinco sin confirmación de aviso laboral, cinco sin fecha original suficiente y uno de más de 45 días. Son motivos de evaluación, no 24 ofertas laborales distintas. Los PDF enlazados desde Renaico incluyen concursos de junio/julio y un archivo de 2023; el índice primario revisado contiene un cierre de julio. Su ruta o fecha de captura no se usa como fecha original del aviso.

Facebook entregó un enlace en cada municipio, sin fecha literal recuperable ni archivos. Las tres observaciones ocurrieron el **14 de octubre**, con siete pasadas acumuladas; no equivalen a siete días. No hubo publicaciones del piloto ni llamadas a proveedores pagos. [Evidencia de la tercera ejecución](evidence/radar-v2-third-pilot-2026-10-14.json).

En paralelo, la comprobación de lectura de AppDeploy encontró los tres IDs de BNE ya publicados en un feed completo. Es conservación de publicaciones anteriores, no una publicación nueva de este piloto. No se desplegó otra versión de la app.

## Corrección final de directorios y pruebas

La revisión detectó que una página de directorio con una fecha antigua detenía sus enlaces, y que una fecha reciente del mismo directorio podía heredarse a documentos sin fecha. El cambio final etiqueta los cuatro puntos web como directorios, sigue sus enlaces y conserva su fecha solo como metadato de la página. No evalúa el conjunto del directorio como una oferta individual. Los hijos recuperan evidencia propia.

Dos regresiones nuevas comprueban un directorio antiguo que enlaza una oferta/PDF y un directorio reciente que contiene un afiche sin fecha. La suite final suma **271 pruebas: 125 Python y 146 Node**. Esta última corrección se comprobó con casos controlados; las cifras de la tercera ejecución corresponden a su commit anterior. No se volvió a rastrear Facebook para comprobar un cambio sobre directorios.

## Qué falta para publicaciones automáticas reales

La lectura social puede no entregar la fecha o los archivos necesarios. Se registra la falta de datos y no se inventa la fecha. El piloto mantiene deshabilitada la publicación y no amplía la lista de fuentes admitidas por el puente de producción. Una oferta social que parezca completa sigue requiriendo validar esa integración antes de publicarla.

1. Obtener una muestra independiente de 10–20 avisos reales de hasta 45 días, con URL original, fecha y archivo. Los enlaces municipales encontrados no sustituyen esa muestra; la precisión de captación aún no se puede medir.
2. Conseguir evidencia accesible de los avisos sociales mediante publicaciones públicas legibles, acceso autorizado cuando sea aplicable o aportes originales del publicador. La entrada local de archivos está implementada, pero no hay un formulario desplegado ni acuerdos con OMIL/medios/empresas. No se inició contacto en su nombre.
3. Ajustar la extracción con esa muestra: formularios y textos dinámicos de empresas, afiches sin etiquetas explícitas, documentos largos y datos de contacto del empleador. Instagram y el resto de comunas/fuentes prioritarias todavía no forman parte de este piloto de dos comunas.
4. Observar al menos siete días, comprobar recuperación de avisos conocidos, fechas y duplicados. Completar la cola actual no acredita haber recorrido un histórico de 45 días.
5. Con avisos realmente verificables, conectar el nuevo motor al intercambio firmado de AppDeploy, comprobar persistencia y aparición de cada ID en el feed, y revisar la activación programada. Este motor no dispone aún de esa ruta de publicación. La integración de `main` sigue pendiente de revisión.

La cola, el archivo y la reanudación se comprobaron con trabajo real. La captación social suficiente y la publicación automática difícil siguen sin demostrarse. El piloto conserva la app y los históricos y permite probar esas vías sin reiniciar el proyecto ni contratar servicios.
