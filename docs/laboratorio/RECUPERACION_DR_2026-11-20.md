# Trabajo Cerca — procedimiento de recuperación (LAB)
Fecha: 20 de noviembre de 2026 · Estado: **recuperación de datos NO aprobada**

## Entornos
- Laboratorio aislado: `trabajo-cerca-lab-aislado-xirg9w` (AppDeploy).
- Producción: `trabajo-cerca-laboratorio-3ojgro`. El nombre de esta instancia es histórico: **es producción**.
- No se comparten secretos, bases, usuarios, actividades de rastreo ni permisos.
- El LAB sí lee el feed de ofertas y publicidad ya públicas de producción mediante APIs GET. **Nunca** usar esas rutas de lectura indirecta como destino de pruebas de carga.

## Evidencia de reversión del código (no de datos)
1. Versión de referencia del LAB: `1795191038682` (v8).
2. Reversión a `1795190432904` (v7) mediante `get_app_versions` y `apply_app_version`: AppDeploy confirmó `ready`; catálogo y autopromoción accesibles, QA móvil/web sin errores de red.
3. Recuperación a `1795191038682` (v8): AppDeploy confirmó `ready`, QA móvil/web sin errores frontend ni de red.
4. Producción permaneció en `1795180490226` antes del ensayo y **no recibió despliegues de este ciclo**.
5. Esto valida **reversión de código**; no constituye restauración de una base ni garantiza continuidad de operaciones concurrentes.

## Estado del exportador actual
Ruta: `POST /api/admin/backup/page` (solo administrador autenticado/autorizado), en `backend/admin-backup.ts`.

El propio endpoint `kind=scope` declara:
- `revision: application-backup-v2`
- `consistency: rolling_non_atomic`
- `fullPlatformBackup: false`
- `restoreValidated: false`

Exporta tablas por páginas de hasta 5 registros, inventario de archivos en storage y archivo individual. No congela escrituras, no realiza snapshot atómico, no ofrece operación de restauración ni acredita respaldo externo cifrado. Un error o un cursor incompleto debe invalidar el conjunto. Nunca publicar páginas, tokens de sesión, correos, teléfonos, fotografías ni registros de usuarios en GitHub o en logs de CI.

## Gate de integridad offline (datos ficticios)
- Código: `scripts/backup-safety-gate.mjs`.
- Prueba: `node scripts/backup-safety-gate.mjs --self-test`.
- Reproduce páginas ficticias con SHA-256, prueba reconstrucción en **memoria** y rechaza datos alterados, cursores truncados, registros duplicados, archivos faltantes y un origen declarado como producción.
- CI: `.github/workflows/lab-backup-integrity.yml`.
- **Resultado del 20/11**: 6/6 escenarios aprobados (job GitHub `136425292731`).
- Esto **no** restaura una base real ni demuestra cifrado o sincronización de un backup de producción.

## Gate de recuperación real — pendiente obligatorio
No marcar GO hasta que exista evidencia verificable de cada condición:
1. Un backup **consistente** y **completo**, con inventario de tablas y objetos, checksum SHA-256, cifrado en repositorio externo separado y política de retención/compliance.
2. Evidencia de autorización administrativa; registros privados no deben quedar en logs o GitHub.
3. Restauración de ese respaldo en una **segunda base LAB vacía y aislada**, sin conectar a producción ni permitir crons.
4. Comparación de recuentos e integridad antes/después, referencialidad, fotos y enlaces, contactos sujetos a política de privacidad, permisos y acceso.
5. Prueba de lectura y edición con datos sintéticos restaurados, eliminación controlada y verificación de no exposición pública indebida.
6. Medir tiempo efectivo de recuperación (RTO) y antigüedad de datos recuperados (RPO); establecer umbrales aprobados antes de GO.
7. Simular fallos: backup corrupto, página perdida, token caducado, corte de red y restablecimiento fallido; cada caso debe bloquear promoción.

La versión anterior del código puede recuperarse con `apply_app_version`, pero no aplicar ese mecanismo a producción durante pruebas. Tampoco confundir su éxito con respaldo de datos. No añadir endpoints públicos de importación ni credenciales reutilizables para conseguir artificialmente un PASS.

## Estado general
- Smoke de APIs aisladas: 9/9.
- Publicación sintética en LAB + limpieza: 6/6.
- Concurrencia LAB local: 120 solicitudes / 0 fallos (5, 10 y 25 VU).
- Integridad offline de exportación ficticia: 6/6.
- Código revertido y recuperado en LAB: v8 → v7 → v8.
- Restauración plataforma / base de datos real: **SIN CERTIFICAR (NO-GO)**.
- PWA Android físico, moderación administradora completa y carga >25 VU: pendientes.

Seguimiento: issue #74 · PR borrador #93. Si hay acceso a funciones nativas de backup/restore de AppDeploy, preferirlas sobre desarrollar una ruta custom con permisos de escritura.
