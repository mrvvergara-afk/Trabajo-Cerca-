# Preparación de restauración aislada y puerta de producción

22 de octubre de 2026 UTC. Trabajo limitado a repair/mulchen-captura-2026-10-17. No se modifica main ni el despliegue actual 1792632646829.

## Evidencia recibida y alcance

El usuario entregó el informe trabajo-cerca-auditoria-archivos.json, checkedAt 2026-10-22T01:44:00.718Z: 68 tablas, 4666 registros, cero archivos capturados. El listado SDK terminó con una petición y cero objetos. Cero referencias de almacenamiento conocidas, cero valores sin clasificar y cero referencias faltantes. No hubo subida de contraseña/cuerpos ni escrituras de producción. Este informe es evidencia producida en el navegador del usuario; no una ejecución repetida por el agente. Solo cubre campos conocidos y el SDK accesible, no todo el almacenamiento de plataforma ni tablas omitidas. Complementa el informe previo de recuperación local con cero diferencias.

## Nuevo importador de ensayo

integrations/appdeploy/isolated-restore.mjs reutiliza la validación criptográfica existente. Prepara y valida todos los bloques/manifiesto antes de tocar destino. Construye unidades para tablas incluso vacías, registros con ID original y archivos con ruta/contenido original. No renueva fechas ni activa históricos. Conserva referencias sin transformarlas.

El único destino implementado es SQLite local temporal y vacío. No hay adaptador de AppDeploy ni endpoint de restauración. Se rechaza un destino ya poblado; cada importación usa transacción, con rollback en fallo. Las unidades se cifran AES-256-GCM con clave efímera que no se guarda. Tras commit se cierra/reabre SQLite, se cotejan conteos y SHA-256 por unidad y se pueden leer registros/archivos recuperados. El consumidor debe ejecutar dispose() en finally; las pruebas verifican eliminación del directorio y ausencia de texto privado en el archivo. La clave se limpia del buffer al desechar el destino, sin prometer borrado físico seguro en sistemas con swap o copias de memoria.

No se implementa un CLI que pida la clave al usuario ni se solicita subirla. No se necesita otra acción del usuario para estas pruebas sintéticas.

## Pruebas ejecutadas

node isolated-restore.test.mjs, Node 24.19.0: seis casos aprobados, cero fallos/omisiones. Casos: IDs/fechas/cerrados/relaciones y archivos tras reapertura durable; destino poblado rechazado; contraseña equivocada/app ajena/copia truncada rechazadas; plan alterado y adaptador ajeno rechazados antes de escribir; fallo de inserción revierte todas las filas; ausencia de texto privado en SQLite y limpieza del directorio temporal.

Son pruebas sintéticas del importador local. No equivalen a ejecutar la app sobre SQLite, restaurar sesiones, secretos o notificaciones, ni importar los 4666 registros reales. No se desplegaron cambios, crearon apps, tocaron históricos o alteraron tareas. No hubo llamadas a proveedores ni recolectores. La suite histórica completa no se repitió porque no cambió el runtime desplegado; el último run completo 39706237206 aprobó 243 Python y 302 Node antes de este módulo nuevo.

## Pendientes concretos para restaurar en AppDeploy

1. Destino separado, vacío, con aislamiento de datos y autorización de consumo acreditados. No se ha creado porque no está demostrado un coste incremental cero.
2. Adaptador SDK validado: comprobar asignación de IDs físicos y, si cambian, inventariar/reconstruir todas las referencias antes de publicar cualquier feed. El simulador local conserva IDs, no prueba que el SDK lo permita.
3. Restauración de código, configuración no secreta y recursos del despliegue; determinar recuperación de usuarios/secretos mediante mecanismos oficiales de plataforma sin copiarlos al informe.
4. Impedir cron, recepción productiva, notificaciones y llamadas externas en el destino de ensayo antes de cualquier importación.
5. Ejecutar copia real en ese destino y probar consultas, tarjetas, postulación, sesión administrativa y permisos. Conservar diferencias por ID/hash y comprobación de archivos antes de declarar recuperación funcional.

## Puerta de producción actualizada

- Recuperación local del respaldo del usuario: aprobada según su informe; no es restauración de plataforma.
- Auditoría de referencias de archivos: sin faltantes en el alcance conocido según informe recibido.
- Importador local SQLite: preparado y probado con fixtures; no es importador SDK instalado.
- A08: continúa abierto hasta completar restauración funcional integral.
- A11: siguen pendientes los dos PNG de 512 dañados; la entrega de assets debe respetar el flujo de recursos de AppDeploy.
- A12: el run 39706237206 seguía observando ausentes CSP, HSTS, X-Frame-Options, nosniff, Referrer-Policy y Permissions-Policy en HTML público. Requiere solución efectiva de plataforma y nueva comprobación HTTP.
- A07: identificación legal completa pendiente, tal como declara el texto público observado. El email administrativo no constituye identificación legal completa ni autoriza publicar datos personales adicionales.
- Catálogo/revalidación: el inventario bruto no acredita vigencia; la lectura anterior tenía revalidaciones vencidas. No se ha reparado o revalidado en esta tanda, ni se publicaron ofertas nuevas.
- CI/protección de main: no se cambió política de rama. Debe probarse un gate obligatorio antes de integrar; las suites aprobadas por sí solas no acreditan esa protección.
- A15/cobertura editorial: no se realizaron carga ni muestreo editorial nuevos. No declarar estos hallazgos cerrados.

Dictamen: todavía no apto para lanzamiento público general. No hace falta rehacer la aplicación; falta cerrar y demostrar estos controles.
