# Respaldo AppDeploy: preparación y prueba aislada — 21 octubre 2026

## Entrega y alcance
Se incorpora scripts/appdeploy-backup.mjs, sin importaciones de SDK, rutas HTTP, credenciales ni funciones de escritura a producción. Recibe adaptadores de lectura autorizada y un destino durable proporcionados por el futuro operador. No está conectado ni desplegado en la app. No se exportaron datos reales ni se restauró AppDeploy. A08 permanece abierto.

El inventario estático identifica 37 nombres de tabla y dos patrones dinámicos: radar_external_<hash de 32 caracteres> y public_feed_page_<número>. config/appdeploy-backup-scope.json es una referencia de código, no un catálogo real certificado. Deben recuperarse nombres de tablas dinámicas desde referencias originales y confrontarlos con la plataforma; el SDK no documenta una operación para enumerar todas las tablas.

## Comportamiento comprobado
Cada paso lee una página de hasta 20 registros o una página de hasta cinco rutas con sus archivos. El checkpoint avanza solo después del acuse del destino durable. Detecta bucles de paginación, identificadores duplicados, archivos desaparecidos, copias incompletas, cambio de ámbito y corrupción SHA-256. Los errores de cuota se propagan sin reintentos automáticos. Preserva registros cerrados, IDs físicos, campos privados y el contenido original de storage.read sin asumir su codificación.

restoreIsolated verifica el archivo completo y crea únicamente mapas en memoria. No acepta un escritor SDK ni produce efectos sobre la app. Las seis pruebas utilizan datos sintéticos, incluidos un ownerToken y un contacto ficticios. No constituyen una restauración real.

## Pendientes para cerrar A08
1. Identidad administradora explícita y autenticación SDK verificada. Pregunta enviada al titular; ningún correo inferido o promovido automáticamente.
2. Adaptador del SDK con exportación paginada protegida, presupuesto de bytes/tiempo y checkpoint durable externo. No se habilitó una ruta de descarga privada sin identidad autorizada.
3. Destino privado cifrado y control de integridad autenticado externo. Los hashes detectan corrupción, no acreditan autenticidad ante un atacante que pueda reescribir también el manifiesto. El módulo no cifra por sí mismo: no utilizar un bucket público ni este repositorio público como destino de datos reales.
4. Consistencia: lecturas rolling_non_atomic, sin transacción de snapshot. Deben reconciliarse escrituras concurrentes antes de certificar una copia. Un complete=true indica recorrido del ámbito declarado, no recuperación integral acreditada.
5. SDK storage.read no entrega MIME ni metadatos originales; se requiere inventario de metadatos para restauración fiel. Auth y secretos administrados por la plataforma requieren su propio procedimiento de recuperación, sin imprimir ni modificar credenciales.
6. Restauración real en aislamiento autorizado, comparación de tablas/filas/archivos/campos y prueba funcional; la restauración sobre datos actuales queda excluida.

No cambian main, app desplegada, históricos, cantidad/frecuencia de jobs o crons. Cero ofertas nuevas publicadas. Se conserva la contención previa. No apto todavía para lanzamiento público general.
