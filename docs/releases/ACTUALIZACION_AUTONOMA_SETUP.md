# Actualizaciones autónomas de Trabajo Cerca — habilitación única

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

## 3. Recuperación y continuidad
Actualmente el exportador propio declara `rolling_non_atomic`, `fullPlatformBackup:false`, `restoreValidated:false`. Antes de activar:
- Disponer de una copia **consistente** y cifrada de la BD productiva y almacenamiento asociado. No basta con exportar páginas sueltas.
- Restaurar en una app/BD diferente con datos sanitizados y registrar resultado, conteo de filas, integridad, RPO/RTO y fecha.
- Probar que no desaparecen las ofertas durante promoción; el código PROD tiene diagnóstico `PUBLIC_FEED_DEGRADED visible=0` en reconstrucción. La prueba de despliegue debe registrar disponibilidad de API con límite de tasa respetado.
- Cerrar E2E con cuenta autorizada: publicación pendiente→aprobada, cobertura por distintas comunas, reseña con otra cuenta, baja/ocultación y sesiones PWA.
- Entregar al ejecutor evidencias verificables emitidas por la tarea de CI/DR, no fechas inventadas ni solo casillas visuales.

Environment secrets del workflow (solo tras certificar): `TC_RESTORE_VERIFIED_AT`, `TC_FEED_ATOMIC_VERIFIED_AT`, `TC_ADMIN_E2E_VERIFIED_AT`. Variable Environment `TC_RELEASE_ENABLE=approved`. Sin ellas, el ejecutor debe fallar sin llamar a `deploy_app`.

## 4. Vincular el botón del LAB a GitHub
El LAB todavía no tiene secretos configurados (`list_app_secrets=[]` al 20-11). En AppDeploy, mediante formulario **seguro de secretos** de la propia cuenta, vincular:
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
- Botón LAB de la versión `1795215434003` — protegido por correo autorizado.
- Seguir avance en issue #74; PR #93 permanece en borrador y no debe fusionarse entero.
- **NO-GO hasta propietario OAuth/AppDeploy credential + DR real + feed atómico + CI firmada + botón LAB completo.**
