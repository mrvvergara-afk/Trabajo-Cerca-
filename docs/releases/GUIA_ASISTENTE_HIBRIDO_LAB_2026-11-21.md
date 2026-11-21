# Trabajo Cerca — guía de prueba del asistente de actualizaciones (modalidad A)
**Fecha:** 21-11-2026. **Ámbito:** LAB aislado, sin actualizar la aplicación oficial.
**Estado:** interfaz y backend desplegados y compilados; pruebas prácticas con sesión administradora y respaldo real PENDIENTES.

## Para entrar cuando puedas

Abre https://trabajo-cerca-lab-aislado-xirg9w.v2.appdeploy.ai/admin?seccion=actualizaciones con tu cuenta administradora. La cabecera del laboratorio debe indicar `R2026.11.21-H`. En **Actualizaciones** aparece **Asistente de respaldo y actualización**, con cuatro pasos navegables.

### Paso 1 — Preparación
Lee qué aplicación se respaldará. Marca las dos confirmaciones solo cuando estés seguro de usar la **aplicación oficial** y de que el respaldo consistente puede pausar el servicio. Este paso no afecta producción.

### Paso 2 — Crear respaldo manual
Desde la cuenta propietaria, ve a **AppDeploy → aplicación oficial → Settings → Backups (Beta) → Create backup**, activa **Pause the app for a consistent backup** y espera una confirmación de término. La pausa puede causar indisponibilidad temporal: elige una ventana apropiada.

Descarga el ZIP original. **Importante:** AppDeploy no cifra el ZIP completo como archivo; guárdalo en una ubicación privada cifrada e independiente, y custodia su contraseña por separado. Luego, en el asistente, anota referencia del respaldo, **versión de la app oficial**, fecha/hora real y confirma los tres puntos; no marques afirmaciones que no puedas acreditar.

### Paso 3 — Comprobar ZIP
Selecciona el ZIP original, de 1 KiB a 250 MiB. El navegador comprueba su cabecera ZIP y calcula SHA-256 localmente. **No se envía ZIP, fotos, contraseña, contenido ni tokens** a Trabajo Cerca.

Al registrar, se guarda únicamente referencia/versión/fecha/huella/tamaño y una declaración del administrador. El servidor registra el historial y el comprobante actual en **una misma transacción**. No registra nada si las casillas están incompletas o la fecha es futura o más antigua que 24 horas.

### Paso 4 — Revisión
Consulta el último registro, selecciona nuevamente el mismo ZIP y busca **COINCIDE**. Si cambias un byte del ZIP o seleccionas otro, debe indicar **NO COINCIDE**. Después revisa los controles técnicos mostrados bajo el asistente.

El botón de publicar **permanece deshabilitado**. El SHA-256 solo verifica que seleccionaste el mismo archivo, no que el backup realmente sea restaurable; AppDeploy tampoco ofrece una API para certificarlo. El despliegue asistido sigue pendiente de pruebas, credenciales/autoridad propietaria y aceptación explícita del riesgo residual; nunca se autoriza solo mediante casillas.

## Plan de pruebas prácticas, sin tocar producción inicialmente

- **A. Acceso:** fuera de sesión e iniciando sesión como no administrador, GET/POST a `/api/admin/release/manual-backup` deben devolver 401/403 y no exponer comprobantes. Una sesión administradora autorizada puede consultar el estado.
- **B. Navegación:** recorrer los cuatro pasos, anterior/siguiente, en Android pequeño; etiquetas legibles, sin desplazamiento horizontal ni botones cortados.
- **C. Archivo falso:** seleccionar PDF o texto renombrado como ZIP; debe rechazarse. Archivo ZIP legítimo pequeño de prueba permite SHA-256 y no debe producir solicitud de envío del archivo.
- **D. Primera escritura:** registrar comprobante **sintético en LAB** con datos de prueba; comprobar que el estado y el registro histórico se actualizan juntos. Al recargar, debe verse el registro sin errores de la base de datos. Nunca inventar un backup real en la app oficial.
- **E. Repetición y alteración:** guardar el mismo comprobante nuevamente sin duplicar el historial; seleccionar el mismo ZIP y comprobar coincidencia, luego otro ZIP para comprobar rechazo.
- **F. Seguridad:** servidor debe rechazar campos adicionales tipo contraseña/archivo, timestamps futuros o mayores a 24 h, SHA corto, tamaño inválido, casillas falsas. En fallo de transacción no debe quedar un comprobante aparentemente completo.
- **G. Bloqueo de despliegue:** aun con comprobante registrado, la API `/api/admin/release/status` debe seguir indicando publicación no autorizada; no debe ejecutar `deploy_app` ni tocar registros oficiales.
- **H. Antes de un respaldo oficial real:** confirmar ventana de mantenimiento, credenciales propietarias, disponibilidad de cuotas, lugar seguro cifrado y procedimiento de recuperación. No probar un Restore en la app oficial porque sustituye sus datos.

## Resultado técnico verificado hasta el momento

LAB `1795266219331` **READY**, validación de AppDeploy `valid=true`, QA de frontend/red sin errores. Las rutas admin tienen `requireAuth` y `requireAdminEmailAllowlist`; el bloqueo de publicación no fue retirado.

**Todavía no está acreditado:** ejecución E2E con cuenta real, prueba de primera escritura en DB, existencia de un respaldo oficial nuevo, copia cifrada custodiada, restauración de datos ni promoción asistida. No declarar GO con esas pruebas pendientes.

Documentos relacionados: `docs/releases/PROCEDIMIENTO_HIBRIDO_A_RESPALDO_MANUAL_2026-11-21.md` y issue #74.
