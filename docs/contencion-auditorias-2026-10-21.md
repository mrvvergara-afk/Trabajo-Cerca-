# Contención de auditorías — 21 de octubre de 2026

La segunda auditoría aportada por el usuario confirma el orden de reparación. Se incorpora su precisión sobre mergeRediscoveredEvidence, el aviso legal alternativo y que el job scan ejecutaba diez suites Node explícitas, no todas.

Esta primera etapa está preparada para el laboratorio, exclusivamente en repair/mulchen-captura-2026-10-17. No es una promoción a producción.

- Rutas manuales: requireAuth del SDK y denegación adicional para cualquier usuario. No se inventó un administrador. El receptor nativo firmado sigue ejecutándose en su ciclo existente; la invocación manual por navegador queda cerrada.
- Política central: proveedores pagos, IA remota, analítica externa y operaciones manuales deshabilitados por código. La presencia de un secreto no los activa. Los crons sociales se conservan y registran skipped, no captación exitosa.
- Lectura heredada: pasa por el lector gratuito con publicadores permitidos, robots, HTTPS, límites de red y redirecciones comprobadas. Se rechazan IPs y hosts locales, incluidos formatos normalizados.
- Abuso: cuotas persistentes con comparación condicional, límite global y por dirección del evento del servidor. El cuerpo y forwarding headers no controlan la identidad; si no hay dirección, hay bucket conservador compartido. Los errores de estado/DB deniegan acceso. Los contadores requieren todavía política de purga y calibración de volumen.
- Tokens propietarios nuevos: randomBytes(32). Los tokens ya emitidos no se invalidan.
- Fecha original: mergeRediscoveredEvidence ya no sustituye una fecha original existente por una posterior de redescubrimiento. Sigue pendiente revisar todos los caminos de autoridad de fecha.
- Analítica: se corrigieron evento y propiedades de impresión, pero su salida externa permanece apagada. No afirmar impresiones efectivamente enviadas ni ingresos.
- Foto: lectura remota apagada y explicación visible; texto/enlace siguen disponibles.

Antes de la desconexión del entorno local pasaron ocho casos nuevos, las 31 suites Node y las 243 pruebas Python. El servicio del entorno luego informó connectivity offline; se continúa por conectores y validación en GitHub. La suite remota es la comprobación de los archivos finalmente guardados antes de desplegar.

Respaldo fuente de la versión anterior: docs/evidence/security-containment-source-backup-2026-10-21.json. El manifiesto incremental está en integrations/appdeploy/security-containment-update.json. Los tests usan security-containment-index.ts como copia exacta del backend propuesto, no como un nuevo servicio.

Pendientes: autorización real de un operador, DNS/egress en profundidad, restauración integral de AppDeploy, calidad y revalidaciones, notificaciones, legales, cabeceras/infraestructura, PWA, accesibilidad y gate de release. Esta etapa no cierra los 18 hallazgos ni declara la app apta. No se cambian credenciales, main, históricos ni número/frecuencia de crons. Cero ofertas publicadas por esta reparación.
