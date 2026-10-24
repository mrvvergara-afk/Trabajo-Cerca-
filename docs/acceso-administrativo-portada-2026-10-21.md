# Acceso administrativo desde la portada — 21 octubre 2026

Se añadió Administración en las cabeceras de ambas variantes de la app, visible únicamente con sesión y respuesta positiva del servidor a /api/admin/session. No se infiere el rol desde un correo en el navegador ni se guarda un permiso en localStorage. Se verifica al montar, recuperar foco/visibilidad y pulsar el botón; una denegación o fallo oculta el acceso. La navegación usa #operacion y recarga para abrir correctamente el panel existente.

Los controles administrativos tienen separación, altura mínima de 44 px, foco visible y disposición vertical móvil. No se cambió el backend ni sus permisos, credenciales, datos, main o crons. Quien no haya iniciado sesión en la app instalada debe autenticarse una vez en ese mismo contexto: una sesión en otro navegador puede no compartirse. No se agregó un botón administrativo para público anónimo.

Versión AppDeploy 1792620782797 ready, sin errores registrados. Cuatro casos unitarios de visibilidad aprobados: anónimo sin consulta, autorización positiva estricta, fallo/401/403, payload ausente. El permiso autenticado real fue confirmado por el titular en su captura previa; la visibilidad del botón nuevo con esa sesión no ha sido comprobada automáticamente. Respaldo integral y demás bloqueantes de producción siguen pendientes. Cero ofertas nuevas por este cambio.
