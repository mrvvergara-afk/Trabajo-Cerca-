# Estado de la entrega integrada

Se consolidó un paquete de 47 archivos sobre la versión oficial `1795744970786`. Incluye la corrección de recuperación de ChatGPT. Las pruebas locales del paquete completo pasaron. La ejecución AppDeploy `1795804026239` corresponde al paquete anterior, de 46 archivos. La publicación espera la validación integrada en QA, una restauración independiente verificada y un procedimiento de costo total cero.

| Control | Resultado |
|---|---|
| Integración y compilación | 47 archivos. Vite 8, 41 pruebas locales y reproducción de lotes reales aprobadas. Compilación AppDeploy del paquete de 47 pendiente. |
| B/C y telemetría | OCR de un documento de Negrete, recuperación de rechazos del verificador en C e historial móvil de B/C. |
| Publicación | Ficha real de Angol nueva en QA, confirmada por la API y sin duplicado al repetir. La entrada al Motor C fue controlada. |
| Importadores | Reproducción local con lotes reales. ChatGPT recorrió 4 lotes con 11 registros, dio salida terminal a 1 oferta vencida y proyectó 10 en el catálogo local. Gemini recibió 55 registros principales, admitió 52 a revisión y excluyó los 137 complementarios. La corrección de recuperación quedó incluida en el paquete. Queda pendiente validar el runtime con un lote nuevo de cada productor. [Evidencia](https://github.com/mrvvergara-afk/Trabajo-Cerca-/blob/fix/chatgpt-reanudar-lote-vencido-20261127/integration/evidencias/traspasos-github-reproduccion-local-20261127.json) |
| Recuperación | Cinco registros y un archivo de prueba recuperados con el SDK real. Pendientes la copia nativa actual, su restauración independiente y el panel autenticado con datos reales. |
| Publicidad | Seis láminas observadas en la aplicación oficial. Algunos medios faltaban en el almacenamiento aislado de QA. |
| Producción | Versión publicada `1795744970786`. El paquete y la reversión están en [la entrega](integration/release-1795744970786/README.md). |

## Condiciones pendientes para producción

- AppDeploy conserva un respaldo consistente de producción del 26 de noviembre (`1795664276412`) y el respaldo del procedimiento híbrido del 21 de noviembre (`1795209664148`). La copia consistente del laboratorio (`1795701319580`) pertenece a ese entorno.
- El procedimiento nativo documentado por soporte restaura datos en la aplicación de origen. El ZIP es de custodia. Sigue pendiente una alternativa que permita probar recuperación en una instancia independiente y confirme costo total cero.
- La consulta al proveedor se envió el 27 de noviembre. Al revisar el hilo solo figuraba el envío. La etapa de producción espera una vía verificable que cumpla ambas condiciones.
