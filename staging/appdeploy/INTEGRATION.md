# Preparación de integración AppDeploy — NO desplegado
Snapshot de referencia: 1795439168119 (23-11-2026).

El repositorio GitHub **no contiene** la estructura compilable completa del laboratorio AppDeploy. Este archivo está en staging y no modifica producción.

En el snapshot real de AppDeploy, añadir `backend/motor-b-idle-assist.ts` y modificar `backend/fast-bc-pipeline.ts`:

1. Importar `assistMotorCWhenBIdle` desde `./motor-b-idle-assist`.
2. Después de verificar que `pdfOutcome` y `htmlOutcome` terminaron correctamente, ejecutar `const bIdleAssist=await assistMotorCWhenBIdle(result.processed,result.totalDocuments)`.
3. Añadir `bIdleAssist` al recibo de etapa B/C y no reutilizar contadores antiguos cuando esté ocioso.
4. Probar que B no ayuda a C si existen PDF elegibles; si no existen, revisa como máximo 2 candidatos de C `ready_for_final_check` por ciclo.
5. Word/DOCX permanece expresamente pendiente de implementar; un `PDF=0` no equivale a documentos resueltos.
6. Validar flujo ID→verificación→cola→catálogo con registros reales, duplicados y bloqueo de fuente, antes de un solo despliegue.

**Última prueba observada:** cron verify-publish procesó 13 (1 verificado, 12 mantenidos), pero fast B/C siguió en 0 procesados. No afirmar que 1 está publicado sin comprobación en el feed.
