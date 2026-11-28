# Actualización y continuidad de Trabajo Cerca

## Qué ve un usuario

La instalación conserva su identidad mientras el dominio, el identificador y el alcance de la PWA sigan iguales. El usuario puede continuar con la app abierta y elegir **Más tarde** o **Actualizar aquí** cuando aparezca el aviso. La interfaz pide confirmación antes de descartar un formulario con cambios. La candidata también recupera la portada guardada cuando el servidor devuelve un error 5xx y hay una copia disponible. El catálogo y las operaciones todavía necesitan el servidor cuando solicitan datos nuevos. [Ciclo de vida del service worker](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers#updating_your_service_worker)

## Procedimiento para futuras versiones

1. Clasificar el cambio. Las campañas y contenidos que ya se administran como datos se comprueban desde sus vistas publicadas. Los cambios de código se prueban como una sola versión candidata.
2. En el entorno aislado, probar el acceso normal y una instalación anterior con la app abierta. Comprobar el catálogo, formularios, publicidad, sesión administrativa y alertas. Medir tiempos y errores en un ensayo de carga autorizado. Una prueba funcional con 500 cuentas simuladas no acredita capacidad para 500 personas conectadas.
3. Antes de promover, fijar la versión activa y su opción de reversión. Para cambios de datos, verificar recuperación independiente y compatibilidad entre versiones. Confirmar costo cero y disponibilidad del entorno aislado. El lanzamiento actual conserva NO-GO.
4. Tras una promoción autorizada, verificar desde una sesión que sigue abierta en la versión anterior y desde una que acepta la actualización. Revisar inicio, catálogo, publicación y sesión. Ante fallos graves, revertir el código a la versión estable y volver a comprobar el catálogo. La recuperación de datos es una decisión separada y requiere verificar qué registros posteriores se verían afectados.

## Alerta de Rigger en Angol

La fuente pública fechó el aviso de Rigger en Angol el 27 de noviembre. La regla anterior podía perder avisos verificados antes del último ciclo que ingresaban al catálogo después. La búsqueda individual de preferencias también terminaba tras las primeras 200 cuentas. La candidata registra la primera aparición observada en el catálogo confirmado, reintenta cuando el proveedor rechaza el envío y pagina la búsqueda de preferencias. [Aviso en Chiletrabajos](https://www.chiletrabajos.cl/trabajo/rigger-angol-3940244)

El ensayo usó el aviso como referencia y 500 cuentas simuladas. Recuperó la preferencia de la última cuenta, reintentó el rechazo simulado y registró un único envío aceptado. Quedan pendientes el diagnóstico del envío real de esa oferta y la prueba de recepción en Android con la aplicación instalada y cerrada.
