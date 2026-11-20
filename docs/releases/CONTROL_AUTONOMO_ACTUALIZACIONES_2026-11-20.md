# Trabajo Cerca · Botón autónomo de actualización (etapa de habilitación)

**Estado al 20/11/2026**: interfaz y preflight integrados únicamente en LAB `trabajo-cerca-lab-aislado-xirg9w`, AppDeploy `1795215211643` READY. El disparador de publicación **NO está habilitado**: no hay credenciales de despliegue autónomo, recuperación completa de BD validada ni CI de promoción certificado. La versión productiva `trabajo-cerca-laboratorio-3ojgro` no se cambió en este ciclo.

## Experiencia esperada
Panel administrativo → sección inicial → **«Comprobar y publicar actualización»**.

Una pulsación ejecuta el chequeo server-side `POST /api/admin/release/execute` con `requireAuth()` y `requireAdminEmailAllowlist`. No acepta URL, destino, correo ni commit arbitrarios en la solicitud. Devuelve lista visible de 7 condiciones con resultado verificable, y si hay fallas HTTP 409 sin desplegar. El estado se consulta con `GET /api/admin/release/status` bajo los mismos permisos.

Antes de GO real requiere:
1. Conectividad de catálogo público LAB y PROD (una sola consulta ligera; **no** es load test).
2. Un candidato `approvedCandidate` SHA de 40 caracteres, `baseline` productiva y CI de hasta 48 h, evidenciado en tabla interna `tc_release_signed_evidence/current`. Debe ser escrito únicamente por el runner verificado, nunca mediante un formulario público ni desde el navegador.
3. Respaldo **completo, consistente, cifrado externamente y restaurado en segunda BD** con RPO/RTO medidos; fecha de verificación `restoreVerifiedAt`.
4. Feed atómico sin momento `PUBLIC_FEED_DEGRADED visible=0`; fecha `atomicFeedVerifiedAt`.
5. Formulario y moderación admin autenticados + reseñas y rollback E2E; fecha `adminQaVerifiedAt`.
6. Ejecutor independiente y restringido, con secretos separados `TC_GITHUB_RELEASE_TOKEN` y `TC_RELEASE_RUNNER_ENABLED` en AppDeploy. Ninguna clave debe vivir en frontend, logs o GitHub fuente.
7. Workflow de promoción `.github/workflows/trabajo-cerca-release.yml` integrado en rama `main`, revisado, con credenciales no interactivas **de la cuenta propietaria** de AppDeploy, ambiente protegido GitHub, lock por release, paquete explícito de archivos y pruebas postdeploy.

El endpoint solo intentará enviar `workflow_dispatch` en un destino **fijo** cuando las siete condiciones estén satisfechas. Respuesta 202 = **solicitud enviada**, nunca publicación terminada. Debe existir un registro de finalización verificable en el panel antes de anunciar éxito.

## Reglas de seguridad
- No migrar/copiar la BD LAB ni sus endpoints de vista pública readonly a producción.
- Nunca reemplazar el snapshot entero de LAB en PROD; generar un paquete de diferencias autorizado contra la base actual.
- Si hay mismatch de versiones/baseline, detener; no hacer force push ni sobrescribir cambios posteriores.
- Tests automáticos con DB sintética y sin carga a API productiva.
- Despliegue sobre usuarios reales solamente tras comprobación de backup/restore y cero caída de feed.
- Si falla verificación postdeploy, ejecutar rollback de código desde versión estable y comprobar catálogo. **El rollback de código NO restaura datos**.
- No emitir notificación al público hasta que AppDeploy marque READY y smoke CI valide frontend, backend y contenido.
- Auditar quién disparó el ciclo sin publicar correos ni claves en logs.
- En caso de fallar el despacho antes de confirmación, no reintentar automáticamente: revisar el bloqueo de idempotencia `tc_release_dispatch_locks` y el workflow.

## Bloqueo actual y siguiente tramo técnico
AppDeploy conectado en este chat dispone de OAuth para herramientas MCP, pero no hay configurada una credencial de servicio de despliegue para el runtime o GitHub Actions de la app. `list_app_secrets` en LAB devolvió **0 secretos**; la cuenta conectada de ChatGPT no se puede transferir automáticamente al servidor. El exportador actual de respaldo devuelve `rolling_non_atomic` y `restoreValidated:false`. NO podemos dar por funcional un botón que «hace todo» aún.

Después de incorporar un runner de despliegues externo con identidad de servicio y certificar DR/atomicidad, las verificaciones de CI alimentarán la evidencia interna. El administrador podrá ejecutar despliegues sin usar ChatGPT. Una única configuración de credenciales con canal secreto será necesaria; **nunca solicitar contraseñas en el chat**.

Seguimiento: issue #74; pruebas y trabajo de LAB en PR #93. Esta implementación inicial está desplegada en LAB, **no producción**.
