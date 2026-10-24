# Respaldo cifrado desde administración — 21 octubre 2026 (Chile)

## Implementación
Se agrega POST /api/admin/backup/page detrás de requireAuth() y requireAdminEmailAllowlist con la única cuenta indicada por el titular. El endpoint lee una página de cinco registros, una página de cinco rutas o un archivo; no escribe, no restaura, no reintenta cuotas y no genera enlaces públicos. Respuestas privadas Cache-Control no-store. Se rechazan tablas fuera del inventario fijo/patrones permitidos, rutas inválidas, cursores no válidos y resultados mayores a 1,5 MB. La lista de 37 tablas permanece explícita.

En el panel autorizado se agrega creación, descarga y comprobación local de copias. La contraseña (mínimo 12 caracteres, repetida) nunca se envía al servidor. PBKDF2 SHA-256 de 310000 iteraciones deriva una clave AES-256-GCM con sal aleatoria de 16 bytes. Cada bloque tiene IV aleatorio de 12 bytes y datos autenticados que lo vinculan al formato, ID de copia y posición. El manifiesto final cifrado vincula cantidades de tablas, registros, archivos y bloques. Se rechazan alteraciones, reordenamientos, truncamientos, IDs duplicados y parámetros KDF ajenos al formato.

El navegador descubre nombres dinámicos referenciados en las páginas, recorre los archivos accesibles, cifra cada bloque y verifica la copia antes de ofrecer la descarga. Límites de 1000 solicitudes, 10 minutos, 2000 bloques y aproximadamente 45 MB de contenido cifrado. Un error no produce una copia completa; si existen bloques cifrados puede descargarse una copia PARCIAL que el verificador rechaza como incompleta. No existe reanudación durable automática. Cerrar la pestaña antes de descargar puede perder esa copia.

## Qué no acredita
A08 continúa abierto: no se exportaron los datos privados reales desde esta sesión del agente ni se restauraron en otra app. El titular debe ejecutar la descarga con su propia sesión y conservar la contraseña. El acceso confirmado por el titular no concede una sesión al agente.
Las lecturas son rolling_non_atomic mientras la app funciona. El SDK no permite enumerar todas las tablas; tablas huérfanas sin referencias no quedan certificadas. No se incluyen catálogo de usuarios, secretos, metadatos MIME originales de storage ni código fuente en este archivo. La comprobación local verifica descifrado e integridad del ámbito capturado; no equivale a recuperación funcional en AppDeploy. La copia es manual y no instala una recurrencia ni un destino remoto.
La creación de la copia no modifica ofertas, históricos, credenciales, main ni cantidad/frecuencia de crons. No habilita proveedores pagos ni operaciones manuales del radar. Cero publicaciones nuevas por esta reparación.

## Pruebas
Ocho casos nuevos locales aprobados: cifrado/descifrado con histórico cerrado y campo privado sintético, contraseña incorrecta, alteración/truncamiento/reordenamiento/KDF inválido, IDs/cantidades inconsistentes, lectura acotada y encabezados privados, rechazo de tabla/ruta/cursor antes del SDK, falta de archivo/exceso de bytes/cuota y ámbito estático/lectura storage acotada.
Se amplía la prueba de composición de rutas para anónimo 401, otra cuenta 403 y administrador permitido mediante mocks del SDK. Se añade comprobación anónima real al observador de política, sin exportar datos.
## Uso
Administración → ingresar/verificar acceso → Respaldo cifrado → definir y repetir contraseña → Crear copia cifrada → Descargar copia cifrada. Conservar el archivo y la contraseña separados. Comprobar una copia permite volver a abrir el archivo localmente; no lo sube al servidor ni sobrescribe la app.
