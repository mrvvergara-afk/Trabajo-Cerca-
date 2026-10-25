# Trabajo Cerca — Puente privado de revisión a verificación

Fecha: 25 de octubre de 2026. Laboratorio AppDeploy: `trabajo-cerca-laboratorio-3ojgro`. Snapshot: **1792948121848**.

## Cambios instalados

- Bandeja administrativa de revisión de candidatos importados por JSON.
- `POST /api/admin/radar-review/check`: comprueba fuente individual contra `evaluatePublicJob` con respeto de robots.txt, edad máxima 20 días, comuna real, postulación activa y duplicación por URL + cargo/empresa/comuna.
- `POST /api/admin/radar-review/submit`: **solo autenticado y correo incluido en allowlist**. Repite la comprobación en el servidor. Inserta en `radar_jobs` con ID determinista `tcq_<candidate_key>`, **review:true, verified:false**; realiza CAS de estado y registra cambio de feed. No realiza publicación directa. El cron existente `verify-publish` decide verificación y visibilidad posterior.
- `POST /api/admin/radar-review/status`: consulta solo lectura de la fila del candidato, registro `radar_jobs` y el manifiesto `public_feed`. Distingue pendiente, inactivo/rechazado, en espera de manifest y confirmado visible. Nunca afirma publicado por `queued:true` ni por compilación.
- UI privada: `Comprobar fuente y fecha`, `Enviar al verificador`, `Consultar publicación`. La prueba requiere intervención de un administrador autenticado.
- No se modificaron los siete crons ni el inventario previo. Proveedores externos nuevos: **$0**.

## Evidencia de seguridad

Prueba GitHub Actions: https://github.com/mrvvergara-afk/Trabajo-Cerca-/actions/runs/40215281734
- **7/7** rutas de administración rechazaron consultas anónimas con **HTTP 401**.
- Ninguna escritura en AppDeploy en la prueba de acceso anónimo.
- PR QA #5 cerrado sin merge. Artefacto id 12607196519.
- El QA de AppDeploy informó compilación válida, sin errores frontend ni network; snapshot en estado `ready`.
- Los mensajes HTTP 401 posteriores en los logs son consecuencia esperada de la prueba anónima.
- Dos warnings de íconos PWA ajenos a este cambio persisten.

## Pendiente real

- **No se importó el lote de 10 candidatos ni se creó ninguna oferta pública** mediante este nuevo flujo.
- Sin sesión administrativa autorizada no podemos probar en vivo una importación, una inserción idempotente y una publicación real; eso requiere acceso legítimo del propietario.
- El archivo listo es `Trabajo_Cerca_10_Candidatos_Revision_Admin_2026-10-25.json` con 10 elementos, IDs hexadecimales de 22 caracteres, estado `revision_obligatoria`. Incluye Chiletrabajos, Kit Empleo, Traiguencity, Mulchén y Las Noticias de Malleco.
- Algunos candidatos usan agregadores, artículos sin JobPosting u OCR parcial. Es correcto que NO avancen sin fuente individual verificable; deben conservarse con motivo pendiente.
- Los cambios AppDeploy están **en su almacenamiento de código**, no se han reconciliado automáticamente con la rama GitHub `main`; no sobrescribir el snapshot del laboratorio fusionando PR antiguos sin auditoría diferencial.
- Se han observado 503 intermitentes al reconstruir el feed. Revisar rendimiento y reconstrucción con los reportes de estado antes del lanzamiento final.

## Uso

1. Abrir https://trabajo-cerca-laboratorio-3ojgro.v2.appdeploy.ai/#operacion e iniciar sesión admin.
2. Importar el lote JSON desde el equipo o teléfono y cargar la bandeja.
3. En cada candidato, marcar `Revisión final` y ejecutar `Comprobar fuente y fecha`.
4. Solo si la comprobación es positiva, ejecutar `Enviar al verificador`.
5. Después, usar `Consultar publicación` y verificar `published_confirmed` antes de contar el aviso.

Este registro distingue **candidatos** de **avisos publicados**; una publicación no puede inferirse de una prueba técnica o de un estado en cola.
