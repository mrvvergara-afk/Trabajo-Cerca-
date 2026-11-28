# Auditoría de experiencia del panel administrativo

28 de noviembre de 2026 · Trabajo Cerca

La revisión comparó recorridos de la versión candidata anterior con la ruta `/admin` de la candidata compilada. Las comprobaciones de sesión y datos usaron un proveedor simulado.

| Recorrido | Hallazgo | Corrección y resultado |
|---|---|---|
| Inicio y navegación | Cinco accesos del menú volvían a aparecer en un desplegable del resumen. | Un menú con diez destinos. Inicio presenta cuatro indicadores y la fecha del último barrido. |
| Empleos y Rescate | Empleos repetía el acceso a Rescate y apilaba tres vistas. | Rescate queda en el menú. Empleos abre la bandeja de revisión y ofrece el inventario público en una pestaña. |
| Importación | Había que pasar por Sistema y seleccionar Importación. | Pasa de dos clics a uno desde Inicio. Respaldo tiene acceso directo. |
| Moderación | El acceso abría una pantalla puente con un enlace a la bandeja. | Pasa de dos clics a uno y abre dentro del panel. El enlace anterior sigue funcionando para sesiones autorizadas. |
| Fuentes y cobertura | Las cifras por comuna aparecían tanto en Empleos como en Motores. | Fuentes reúne el inventario filtrable y el detalle por comuna con una sola consulta. Las tablas tienen encabezado fijo en su área de desplazamiento. |
| Motores | Los totales de B/C se repetían en varias tarjetas fuera del detalle de cada motor. | Las cifras del ciclo se consultan desde cada motor. Los gráficos comparativos siguen en Motores y el último registro conjunto B/C queda disponible en un desplegable. |
| Publicidad | La vista comercial cargaba configuración y solicitudes que pertenecían a otras vistas. | Comerciales y Campañas propias tienen pestañas. Solicitudes carga su propia bandeja. Cada vista consulta sus datos al abrirse. |
| Uso en móvil | El menú tenía varias reglas superpuestas y controles pequeños. | El menú se organiza en cuatro filas en móvil. Sus botones tienen al menos 44 píxeles de alto. En escritorio el menú queda al costado. |

La compilación local, las 49 pruebas Node, la revisión del tablero y los recorridos de la ruta administrativa pasaron. Se verificaron los anchos 320, 375, 430 y 1440 píxeles. También se probó el cierre del panel ante una sesión vencida y la reanudación de una copia tras un fallo temporal.

La validación con una sesión real y la medición de tiempos de respuesta en AppDeploy quedan pendientes. El lanzamiento conserva el estado NO-GO.
