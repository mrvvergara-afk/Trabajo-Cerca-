# Operación del gestor publicitario

Repositorio `mrvvergara-afk/Trabajo-Cerca-` y rama
`feat/gestor-publicitario-autonomo-20261126`. Todas las escrituras del consumidor
quedan acotadas a `marketing/archive/`, `marketing/metricool/` y
`marketing/social/`. Los motores y la rama principal tienen sus propios flujos.

## Ciclo diario

1. Consulta las rutas de la API de cada destino en
   `https://api-v2.appdeploy.ai/app/<app_id>/api/growth/institutional`.
   Recupera el manifiesto y luego `/archive` y `/bridge`. Si la aplicación
   oficial aún no tiene estas rutas, procesa únicamente el laboratorio.
2. Ejecuta `node marketing/bridge-payload.mjs archive cola.json`. Para cada
   archivo devuelve una ruta inmutable y el contenido que se debe respaldar.
   Usa GitHub conectado para crear archivos ausentes con la revisión actual de
   la rama. Lee cada resultado. Si la ruta ya existe y el JSON coincide, es
   una confirmación. Si difiere, conserva ambas evidencias y señala la excepción.
3. Lee en Metricool la marca 7187503 para los últimos 14 días en
   America/Santiago. Consulta por separado Facebook, en orden FBPO01, FBPO09,
   FBPO18, FBPO20, e Instagram, en orden IGPO01, IGPO14, IGPO28. Conserva los
   errores del proveedor. Una respuesta válida sin filas se conserva como
   datos ausentes. Convierte con `node marketing/bridge-payload.mjs metrics
   facebook.json instagram.json AAAA-MM-DD AAAA-MM-DD` y cifra con
   `node marketing/seal-metricool.mjs puente.json reporte.json`. Escribe sólo el
   sobre cifrado en `marketing/metricool/lab.json` o `marketing/metricool/prod.json`,
   usando el SHA vigente. Actualiza como máximo una vez por día por destino.
4. Si el puente corresponde a producción y `organicEnabled` es verdadero,
   ejecuta `node marketing/bridge-payload.mjs plan puente.json`. El resultado
   entrega la campaña de la semana, el momento de publicación y los
   parámetros exactos para Metricool. Verifica que el JPEG fijo responda 200,
   tenga tamaño válido y que estén vinculadas las dos redes de la marca.
5. Lee el recibo de GitHub de esa campaña y consulta el planificador Metricool
   para toda la semana. Busca la etiqueta exacta de campaña y comprueba la
   disponibilidad del cupo del plan. Si no hay recibo ni publicación, crea
   un recibo inmutable inicial `reserved` mediante GitHub y confirma la escritura
   antes de invocar Metricool. Usa exclusivamente `createscheduledpost` con
   `blogId`, `date`, `info` serializado como JSON y `mediaFiles` del resultado.
   Al confirmar el ID de Metricool, actualiza ese recibo con SHA vigente,
   estado `scheduled` y hora. Una reserva preexistente obliga a consultar el
   planificador mediante la etiqueta. Un resultado indeterminado se conserva
   para revisión, sin repetir la mutación.
6. En el siguiente ciclo actualiza los recibos pendientes. Para acreditar
   publicación, exige estado PUBLISHED y URL pública de Facebook e Instagram.
   Si el resultado es parcial, guarda qué red se publicó y cuál requiere
   revisión. El planificador y la base interna se conservan en sus ámbitos.
7. Emite una alerta sólo ante una excepción que obligue a intervenir, como
   una conexión social revocada, conflicto de manifiesto, reserva cuyo
   resultado siga indeterminado o publicación parcial. Un ciclo sano,
   ausencia de candidatas o una métrica retirada se resuelve en silencio.

## Límites y recuperación

Una campaña por semana. El modo laboratorio archiva y lee métricas con
`organicEnabled: false`. La automatización usa planificación orgánica
y nunca compra anuncios, aumenta planes o modifica la publicidad comercial.

El banco se actualiza en GitHub sin recompilar AppDeploy. Para incorporar
nuevas imágenes, conserva el origen autorizado, etiquetas y derivados
inmutables del generador `prepare-bank.py`. AppDeploy acepta una edición
únicamente tras confirmar todos los medios y preserva la edición anterior.
Restaurar en Campañas propias mantiene la edición recuperada hasta la
siguiente semana o una comprobación solicitada expresamente.
