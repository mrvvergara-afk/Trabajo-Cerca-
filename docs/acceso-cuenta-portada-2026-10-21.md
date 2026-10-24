# Acceso de cuenta visible antes de validar administrador — 21 octubre 2026 (Chile)

Causa: AdministratorShortcut retornaba null si no había sesión ya autorizada, por lo que no existía una entrada desde la portada para iniciar sesión en ese dispositivo. No se puede deducir de la captura si faltaba sesión, expiró o falló la validación; el fallo de navegación era reproducible por diseño.

Se añade Mi cuenta para todos, con Iniciar sesión por popup SDK, cambio de cuenta y cierre de sesión. Administración continúa condicionado exclusivamente a /api/admin/session. Se vuelve a validar al recuperar foco/visibilidad y al abrir el panel. El flujo de login actualiza la condición inmediatamente; las comprobaciones de foco se suspenden durante la autenticación para evitar respuestas concurrentes obsoletas. No se habilitan privilegios mediante correo del formulario ni se cambian backend, credenciales, registros, main o crons.

El menú móvil se ancla a la cabecera y los controles se distribuyen sin forzar una única fila. La prueba de navegador comprueba Mi cuenta → Iniciar sesión → Cerrar menú en móvil/escritorio, sin entregar credenciales ni iniciar sesión en nombre del titular. El rol permitido sigue probado por las pruebas previas y la confirmación real del titular; no se afirma un nuevo login autenticado automático.
