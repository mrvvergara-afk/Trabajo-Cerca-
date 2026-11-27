# Estado de la entrega integrada

Se consolidó un paquete de 49 archivos sobre la versión oficial `1795744970786`. Incluye la corrección de recuperación de ChatGPT, el conteo de ofertas únicas en las 12 comunas, la recuperación de fotografías institucionales y la ampliación del respaldo cifrado. Las pruebas locales del paquete completo pasaron. La ejecución AppDeploy `1795804026239` corresponde al paquete anterior, de 46 archivos. La publicación espera la validación integrada en QA, una restauración independiente verificada y un procedimiento de costo total cero.

| Control | Resultado |
|---|---|
| Integración y compilación | 49 archivos. Vite 8, 42 pruebas locales y reproducción de lotes reales aprobadas. Compilación AppDeploy del paquete de 49 pendiente. |
| B/C y telemetría | OCR de un documento de Negrete, recuperación de rechazos del verificador en C e historial móvil de B/C. |
| Publicación | Ficha real de Angol nueva en QA, confirmada por la API y sin duplicado al repetir. La entrada al Motor C fue controlada. |
| Importadores | Reproducción local con lotes reales. ChatGPT recorrió 4 lotes con 11 registros, dio salida terminal a 1 oferta vencida y proyectó 10 en el catálogo local. Gemini recibió 55 registros principales, admitió 52 a revisión y excluyó los 137 complementarios. La corrección de recuperación quedó incluida en el paquete. Queda pendiente validar el runtime con un lote nuevo de cada productor. [Evidencia](https://github.com/mrvvergara-afk/Trabajo-Cerca-/blob/fix/chatgpt-reanudar-lote-vencido-20261127/integration/evidencias/traspasos-github-reproduccion-local-20261127.json) |
| Recuperación | El exportador v4 integra seis tablas de publicidad y seguimiento territorial. En Chromium se comprobó la reanudación tras un fallo, la descarga cifrada y la recuperación de siete registros y un archivo de prueba en una base temporal de otro contexto de navegador, con cero diferencias. La restauración independiente del respaldo nativo de producción sigue pendiente. |
| Experiencia pública | El total territorial cuenta cada oferta verificada una vez, aunque corresponda a varias comunas. La portada, el filtro por comuna y el menú sin sesión pasaron en Chromium con datos simulados. |
| Publicidad | Seis láminas en dos ediciones verificadas en Chromium con archivos del banco y servicios simulados. Las fotos mantienen el encuadre con tarjetas de distinta altura. Si falta la foto en el primer origen, la candidata prueba la otra copia. También se verificó la prioridad y caducidad comercial en el navegador. Falta validar esta candidata en AppDeploy. |
| Producción | Versión publicada `1795744970786`. El paquete y la reversión están en [la entrega](integration/release-1795744970786/README.md). |

## Condiciones pendientes para producción

- AppDeploy conserva un respaldo consistente de producción del 26 de noviembre (`1795664276412`) y el respaldo del procedimiento híbrido del 21 de noviembre (`1795209664148`). La copia consistente del laboratorio (`1795701319580`) pertenece a ese entorno.
- El procedimiento nativo documentado por soporte restaura datos en la aplicación de origen. El ZIP es de custodia. Sigue pendiente una alternativa que permita probar recuperación en una instancia independiente y confirme costo total cero.
- La consulta al proveedor se envió el 27 de noviembre. Al revisar el hilo solo figuraba el envío. La etapa de producción espera una vía verificable que cumpla ambas condiciones.
