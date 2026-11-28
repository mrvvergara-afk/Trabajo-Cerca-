# Estado de la entrega integrada

Se consolidó un paquete de 54 archivos sobre la versión oficial `1795744970786`. Incluye la corrección de recuperación de ChatGPT, el conteo de ofertas únicas en las 12 comunas, la recuperación de fotografías institucionales, la ampliación del respaldo cifrado y la confirmación individual de pruebas de notificaciones. Las pruebas locales del paquete completo pasaron. La ejecución AppDeploy `1795804026239` corresponde al paquete anterior, de 46 archivos. La publicación espera la validación integrada en QA, una restauración independiente verificada y un procedimiento de costo total cero.

| Control | Resultado |
|---|---|
| Integración y compilación | 54 archivos. Vite 8, 49 pruebas locales y reproducción de lotes reales aprobadas. Compilación AppDeploy del paquete de 54 pendiente. |
| B/C y telemetría | OCR de un documento de Negrete y recuperación de rechazos del verificador en C. El panel distingue cero procesados, errores y falta de reporte. El historial señala lecturas parciales. La reproducción de informes de GitHub conserva la última medición de ChatGPT cuando la onda más reciente solo registra una señal de estado. Sigue pendiente comprobar el panel autenticado en AppDeploy. |
| Publicación | Ficha real de Angol nueva en QA, confirmada por la API y sin duplicado al repetir. La entrada al Motor C fue controlada. |
| Importadores | La reproducción local de los lotes registrados en GitHub pasó por la ruta pública de la candidata. En ChatGPT, 10 de 11 registros históricos quedaron visibles como ofertas verificadas y uno vencido quedó fuera. Gemini conservó el avance de importación y verificación tras un HTTP 503, ingresó 52 de 55 registros principales a revisión y excluyó los 137 complementarios. La validación con un lote nuevo de cada productor en AppDeploy sigue pendiente. |
| Recuperación | El exportador v4 integra seis tablas de publicidad y seguimiento territorial. En Chromium se comprobó la reanudación tras un fallo, la descarga cifrada y la recuperación de siete registros y un archivo de prueba en una base temporal de otro contexto de navegador, con cero diferencias. La restauración independiente del respaldo nativo de producción sigue pendiente. |
| Experiencia pública | El total territorial cuenta cada oferta verificada una vez, aunque corresponda a varias comunas. La portada, el filtro por comuna y el menú sin sesión pasaron en Chromium con datos simulados. |
| Acceso administrativo | La prueba local de /admin confirma el cierre del área privada por sesión vencida o permisos revocados. Una respuesta anterior no reabre el panel. Un fallo temporal de conexión permite reanudar la copia cifrada. La sesión real en AppDeploy sigue pendiente. |
| Notificaciones | La prueba diferencia la aceptación del proveedor de la recepción en el dispositivo. Chromium con SDK simulado comprobó que ignora otros envíos y reconoce la confirmación antes o después de la respuesta del servidor. La entrega en Android con la app instalada y cerrada sigue pendiente. |
| Publicidad | Seis láminas en dos ediciones verificadas en Chromium con archivos del banco y servicios simulados. Las fotos mantienen el encuadre con tarjetas de distinta altura. Si falta la foto en el primer origen, la candidata prueba la otra copia. También se verificó la prioridad y caducidad comercial en el navegador. Falta validar esta candidata en AppDeploy. |
| Producción | Versión publicada `1795744970786`. El paquete y la reversión están en [la entrega](integration/release-1795744970786/README.md). |

## Condiciones pendientes para producción

- AppDeploy conserva un respaldo consistente de producción del 26 de noviembre (`1795664276412`) y el respaldo del procedimiento híbrido del 21 de noviembre (`1795209664148`). La copia consistente del laboratorio (`1795701319580`) pertenece a ese entorno.
- El procedimiento nativo documentado por soporte restaura datos en la aplicación de origen. El ZIP es de custodia. Sigue pendiente una alternativa que permita probar recuperación en una instancia independiente y confirme costo total cero.
- La consulta al proveedor se envió el 27 de noviembre. Al revisar el hilo solo figuraba el envío. La etapa de producción espera una vía verificable que cumpla ambas condiciones.
