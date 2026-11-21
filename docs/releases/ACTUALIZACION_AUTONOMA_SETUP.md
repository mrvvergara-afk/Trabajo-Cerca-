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

Environment secrets del workflow (solo tras certificar): `TC_RESTORE_VERIFIED_AT`, `TC_FEED_ATOMIC_VERIFIED_AT`, `TC_ADMIN_E2E_VERIFIED_AT`. Variable Environment `TC_RELEASE_ENABLE=approved`. Sin ellas, el ejecutor debe fallar sin llamar a `deploy_app`.

## 4. Vincular el botón del LAB a GitHub
El LAB todavía no tiene secretos configurados (`list_app_secrets=[]` en la última comprobación). En AppDeploy, mediante formulario **seguro de secretos** de la propia cuenta, vincular:
- `TC_GITHUB_RELEASE_TOKEN`: credencial GH con permisos limitados a ejecutar el workflow específico del repo; guardada solo en backend.
- `TC_RELEASE_RUNNER_ENABLED`: configuración de habilitación solo después de verificar permisos, DR, carga, baseline y candidato.

No habilitar el botón simplemente porque los nombres de secretos existan. El backend debe comprobar que `trabajo-cerca-release.yml` esté activo en `main` y que la versión candidata y el baseline sean compatibles.

## 5. Uso normal una vez habilitado
1. El desarrollador presenta un cambio en LAB y el CI genera un `release/payload.json` revisado, sin archivos de prueba/credenciales.
2. El sistema registra candidato inmutable aprobado, versión actual PROD y pruebas completas.
3. El administrador entra en LAB → Administrador → Actualizaciones → «Comprobar y publicar actualización».
4. Si alguna condición falta, se detiene con causa específica. No existe un “despliegue parcialmente aprobado”.
5. Con todo aprobado, CI ejecuta en `main` comprobaciones, `deploy_app`, espera `READY`, verifica oferta pública y front, y revierte código ante regresión.
6. Solo marcar **publicado** al confirmar resultado final del workflow más estado AppDeploy y feed público. 202 de GitHub significa **aceptado en cola**, no éxito.

## 6. Incidencia real de capacidad
El 20-11-2026, APIs LAB y oficial respondieron `HTTP 402 APP_TEMPORARILY_UNAVAILABLE` al agotar el presupuesto **diario** Plus. AppDeploy bloqueó nuevos despliegues con `CREDITS_USAGE_LIMIT_REACHED` y programó reset diario 21-11-2026 00:00 UTC (Chile continental 20-11 21:00). Mientras ocurra, la actualización debe bloquearse; cuenta PLUS activa o saldo mensual positivo no prueban cuota diaria.

## 7. QA y propiedad
- Infraestructura desde PR #94, fusionada en `main`. Unit tests `node --test scripts/release-runner.test.mjs` — mocks sin escrituras.
- Botón LAB actualizado a la versión `1795219838976` — protegido por correo autorizado.
- Seguir avance en issue #74; PR #93 permanece en borrador y no debe fusionarse entero.
- **NO-GO hasta propietario OAuth/AppDeploy credential + DR real + feed atómico + CI firmada + botón LAB completo.**

## 8. Monitoreo independiente y límites de créditos
- GitHub monitor externo `.github/workflows/appdeploy-availability-watch.yml`, cada 3 horas, estado e incidencias en https://github.com/mrvvergara-afk/Trabajo-Cerca-/issues/95.
- Detecta HTTP 200 con catálogo no vacío, HTTP 402/503 y caída de conexión; registra **solo cambios confirmados de disponibilidad**.
- No puede anticipar consumo diario ni mensual porque no está conectado el estado de facturación del dueño.
- El panel LAB → Actualizaciones muestra salud observada y aclara «Saldo no conectado»; la única cifra oficial disponible para el dueño se consulta en https://dashboard.appdeploy.ai/my/dashboard.
- El monitoreo externo no evita por sí mismo la interrupción de hosting cuando se consumen créditos. La operación de producción requiere alerta temprana de capacidad desde AppDeploy, reserva de créditos/top-ups, o una estrategia de infraestructura alternativa.
