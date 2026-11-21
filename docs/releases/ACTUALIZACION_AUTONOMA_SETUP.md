# Actualizaciones autónomas de Trabajo Cerca — configuración y renovación segura

Actualizado: 20-11-2026. **Estado: PREPARADO, NO ACTIVADO.** Este documento define el procedimiento para que un administrador haga un despliegue sin ChatGPT. No representa autorización para modificar producción antes de los resguardos de seguridad.

## 1. Entornos y seguridad
- LAB aislado: `trabajo-cerca-lab-aislado-xirg9w`.
- Aplicación oficial pública: `trabajo-cerca-laboratorio-3ojgro` (aunque su nombre contenga «laboratorio»).
- GitHub: `mrvvergara-afk/Trabajo-Cerca-`.
- Dashboard administrativo LAB: https://trabajo-cerca-lab-aislado-xirg9w.v2.appdeploy.ai/admin → Actualizaciones.
- AppDeploy dashboard propietario: https://dashboard.appdeploy.ai.
- No copiar las bases de datos, fuentes OCR ni conectores LAB a producción.
- Rollback del ejecutor restaura el **código** anterior; nunca se debe describir como restauración de bases de datos.
- GitHub release workflow `.github/workflows/trabajo-cerca-release.yml` vive en `main`, únicamente `workflow_dispatch`; no se dispara por cualquier push.
- El archivo candidato `release/payload.json` contiene únicamente diffs acotados; no se acepta subir una instantánea LAB completa ni un destino proporcionado por el cliente.

## 2. Configurar la credencial AppDeploy en GitHub, una sola vez
Se necesita una credencial **de la cuenta dueña** de la aplicación oficial con capacidad de consulta/despliegue y rollback mediante MCP. Un API key que cree una identidad distinta (agent-...) no sirve. No compartir tokens por chat ni copiarlos a archivos del repositorio.

En GitHub, abrir repositorio → Settings → Environments → `production`. Restringir deployment branches al `main`. Bajo Environment secrets guardar **`TC_APPDEPLOY_MCP_TOKEN`** usando el mecanismo de autorización oficial del propietario, con la mínima vigencia y permisos adecuados. La obtención, renovación y revocación deben comprobarse con documentación/soporte de AppDeploy. **No introduzcas una clave de tu sesión de ChatGPT en este campo**; las conexiones son identidades distintas y su consentimiento no es transferible.

Antes de autorizar un despliegue real, el workflow admite `dry_run: true` para probar exclusivamente identidad propietaria, estado AppDeploy y lectura pública, sin escrituras. Evitar usar release real hasta que la conexión dry-run sea exitosa. Registrar solo el resultado, nunca token.

**Advertencia documentada sobre credenciales de larga duración (20-11-2026):** según la política oficial de AppDeploy, los tokens OAuth MCP de acceso caducan después de aproximadamente **1 hora**, y los tokens de renovación tienen vigencia de **30 días**. Por lo tanto, **guardar un access token de propietario una vez en GitHub Secrets NO resuelve la autonomía permanente**: caducará y el botón fallará. Tampoco sirve generar `ak_...` con `/mcp/api-key` y asumir que pertenece al dueño: ese mecanismo crea una identidad de agente independiente salvo confirmación expresa del proveedor y un proceso autorizado de vinculación/transferencia.

**Criterio de habilitación obligatorio:** antes de usar `TC_RELEASE_ENABLE=approved`, AppDeploy debe confirmar una modalidad estable de despliegue para **la cuenta propietaria**, preferiblemente una identidad de servicio restringida a esa aplicación, o un OAuth con **renovación automática verificada, rotación segura, revocación y alertas de caducidad**. Una conexión temporal que solo pasa `dry_run` no acredita operación permanente. Nunca conservar refresh tokens en repositorios, registros, URLs, mensajes ni archivos de compilación. No dar por resuelta esta condición hasta completar un ensayo de expiración/renovación sin interacción con ChatGPT.

Fuentes: https://appdeploy.ai/privacy y https://appdeploy.ai/mcp-docs. Si el proveedor no ofrece una credencial propietaria de servicio, solicitar por su soporte el mecanismo recomendado para GitHub Actions sin interacción repetida.

## 3. Recuperación y continuidad
Actualmente el exportador propio declara `rolling_non_atomic`, `fullPlatformBackup:false`, `restoreValidated:false`. Antes de activar:
- Disponer de una copia **consistente** y cifrada de la BD productiva y almacenamiento asociado. No basta con exportar páginas sueltas.
- Restaurar en una app/BD diferente con datos sanitizados y registrar resultado, conteo de filas, integridad, RPO/RTO y fecha.
- Probar que no desaparecen las ofertas durante promoción; el código PROD tiene diagnóstico `PUBLIC_FEED_DEGRADED visible=0` en reconstrucción. La prueba de despliegue debe registrar disponibilidad de API con límite de tasa respetado.
- Cerrar E2E con cuenta autorizada: publicación pendiente→aprobada, cobertura por distintas comunas, reseña con otra cuenta, baja/ocultación y sesiones PWA.
- Entregar al ejecutor evidencias verificables emitidas por la tarea de CI/DR, no fechas inventadas ni solo casillas visuales.

El ejecutor ya **no admite fechas manuales** como prueba suficiente. Requiere el certificado de recuperación firmado Ed25519, vinculado al commit, al paquete de cambios y al snapshot oficial, según [contrato técnico de respaldo y restauración](RESPALDO_RESTAURACION_RELEASE.md). Los secrets de GitHub Environment son `TC_RELEASE_PROOF_JSON`, `TC_RELEASE_PROOF_SIGNATURE` y `TC_RELEASE_PROOF_PUBLIC_KEY`, emitidos por el proceso independiente después de la restauración real. Variable `TC_RELEASE_ENABLE=approved` solo tras comprobación completa. Sin la firma y comprobantes correctos, el ejecutor **no debe llamar** a `deploy_app`.

## 4. Botón del LAB ↔ GitHub: conexión OIDC sin token estático

**Implementado y probado en GitHub real (21-11-2026):**
- `.github/workflows/trabajo-cerca-oidc-connect.yml` obtiene una identidad firmada por GitHub OIDC, comprobada en LAB mediante ruta `/api/internal/release/oidc-check`. Ejecución **44849388642**, resultado **CONEXIÓN VERIFICADA**.
- `.github/workflows/trabajo-cerca-release-poller.yml` sondea el LAB cada **15 minutos** con `id-token:write`, sin PAT ni credencial GitHub permanente dentro del laboratorio. Ruta `POST /api/internal/release/poll`, valida firma RS256 del JWT mediante JWKS, audiencia, repositorio, branch y workflow_ref exactos. Ejecución **44849947957**, resultado **SONDEO CONECTADO**.
- El panel protegido `POST /api/admin/release/execute` puede registrar una solicitud `pending_poll` **solamente si todos los controles de seguridad están aprobados**. El sondeo toma un bloqueo idempotente antes de intentar disparar el flujo GitHub de producción. Sin backup/restore, no recibe ninguna solicitud.
- Un resultado de GitHub se devuelve al LAB mediante otro token OIDC `trabajo-cerca-release-result-v1`, aceptado únicamente desde `trabajo-cerca-release.yml` y ligado a la ejecución. El panel `GET /api/admin/release/execution` muestra cola, ejecución y resultado, sin confundir aceptación con publicación.
- No requiere `TC_GITHUB_RELEASE_TOKEN`; la antigua ruta con PAT permanece como alternativa, pero **no debe configurarse** si OIDC sigue operativo.

**Alcance de la prueba:** autenticación y sondeo sin candidato aprobado. Todavía NO se ha realizado una promoción productiva con este circuito; el respaldo real y el permiso AppDeploy del propietario siguen pendientes. La programación de GitHub Actions puede demorarse y su intervalo no constituye una garantía de tiempo exacto.

Para seguridad, GitHub usa `id-token: write` y `actions: write` restringidos a la tarea. El receptor solo admite JWT del repositorio y workflow exactos desde `main`; no expone versiones, correos ni tokens a visitantes.

## 5. Uso normal una vez habilitado
1. El desarrollador presenta un cambio en LAB y el CI genera un `release/payload.json` revisado, sin archivos de prueba/credenciales.
2. El sistema registra candidato inmutable aprobado, versión actual PROD y pruebas completas.
3. El administrador entra en LAB → Administrador → Actualizaciones → «Comprobar y publicar actualización».
4. Si alguna condición falta, se detiene con causa específica. No existe un “despliegue parcialmente aprobado”.
5. Con todo aprobado, el administrador registra una sola solicitud; GitHub OIDC la recoge, inicia el CI de `main`, ejecuta `deploy_app`, espera `READY`, verifica oferta pública y frontend, y revierte código ante regresión.
6. Solo marcar **publicado** al confirmar resultado final del workflow más estado AppDeploy y feed público. 202 de GitHub significa **aceptado en cola**, no éxito.

## 6. Incidencia real de capacidad
El 20-11-2026, APIs LAB y oficial respondieron `HTTP 402 APP_TEMPORARILY_UNAVAILABLE` al agotar el presupuesto **diario** Plus. AppDeploy bloqueó nuevos despliegues con `CREDITS_USAGE_LIMIT_REACHED` y programó reset diario 21-11-2026 00:00 UTC (Chile continental 20-11 21:00). Mientras ocurra, la actualización debe bloquearse; cuenta PLUS activa o saldo mensual positivo no prueban cuota diaria.

## 7. QA y propiedad
- Infraestructura desde PR #94, fusionada en `main`. Unit tests `node --test scripts/release-runner.test.mjs` — mocks sin escrituras.
- Botón LAB actualizado a la versión `1795224195083` — protegido por correo autorizado; pantalla móvil, seguimiento de estado, OIDC firmado y firma independiente. Aún sin respaldo real certificado.
- Seguir avance en issue #74; PR #93 permanece en borrador y no debe fusionarse entero.
- **NO-GO hasta propietario OAuth/AppDeploy credential + DR real + feed atómico + CI firmada + botón LAB completo.**

## 8. Monitoreo independiente y límites de créditos
- GitHub monitor externo `.github/workflows/appdeploy-availability-watch.yml`, cada 3 horas, estado e incidencias en https://github.com/mrvvergara-afk/Trabajo-Cerca-/issues/95.
- Detecta HTTP 200 con catálogo no vacío, HTTP 402/503 y caída de conexión; registra **solo cambios confirmados de disponibilidad**.
- No puede anticipar consumo diario ni mensual porque no está conectado el estado de facturación del dueño.
- El panel LAB → Actualizaciones muestra salud observada y aclara «Saldo no conectado»; la única cifra oficial disponible para el dueño se consulta en https://dashboard.appdeploy.ai/my/dashboard.
- El monitoreo externo no evita por sí mismo la interrupción de hosting cuando se consumen créditos. La operación de producción requiere alerta temprana de capacidad desde AppDeploy, reserva de créditos/top-ups, o una estrategia de infraestructura alternativa.
