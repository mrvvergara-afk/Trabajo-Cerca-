# Trabajo Cerca — Resultado verificable del piloto documental ($0)

**Fecha:** 2026-10-25  
**Estado:** piloto aislado, solo lectura. NO integrado al cron ni a la base de datos.  
**PR borrador:** https://github.com/mrvvergara-afk/Trabajo-Cerca-/pull/3  
**Ejecución CI:** https://github.com/mrvvergara-afk/Trabajo-Cerca-/actions/runs/40197204925  
**Artefacto probatorio:** GitHub Actions ID 12599888098 (reporte_municipal.json, reporte_descubrimiento.json y reporte_documental.json).

## Pruebas reales

- Python, PyMuPDF y Tesseract español instalados en GitHub Actions gratuito (repositorio público).
- La ejecución CI concluyó correctamente y los tests unitarios de lectura/restricciones/adjuntos pasaron.
- Cinco URL públicas procesadas: tres páginas HTML leídas, un documento PDF parcial y una página Ercilla omitida por permiso de rastreo no confirmado.
- Entre tres índices municipales examinados, se encontraron dos enlaces potenciales, se leyeron ambos y ninguno resultó una vacante validada.
- El PDF oficial de Traiguén (`DAEX-BASES-Y-CALENDARIO.pdf`, 13.988.452 bytes, sha256 `a1a889d657913e233cb2ba50aa44e6bd55b42dc1e669078f0bee00693d19318f`) inicialmente excedía el límite de 6MB.
- Al habilitar el máximo documental de 16MiB, se detectó que excedía 30 páginas; el lector se restringió a seis páginas y encontró señales `vacante` / `llamado a concurso`. Resultado deliberadamente `documento_parcial_revision_obligatoria`, **no publicado**.
- El endpoint público del laboratorio `/api/ops/free-public-sources` responde contenido `text/html` a un cliente HTTP GitHub Actions. Por tanto NO se obtuvo `documentWork.items`; la cola real de 52 pendientes NO se procesó. El código frontend usa `@appdeploy/client`, que dispone de transporte interno no equivalente a un GET genérico externo.

## Lectura conservadora

La prueba demuestra extracción gratuita y control de recursos, no automatización de Instagram/Facebook. Tampoco confirma nuevos avisos utilizable para el catálogo. Se requiere una vía de intercambio con autenticación y autorización explícita; no se abrirán los endpoints internos ni se usará una clave publicada en GitHub.

## Para pasar a integración

1. Diseñar un **exportador administrativo seguro** dentro de la app, usando `api.get('/api/ops/free-public-sources')`, que entregue solo URL/documentos públicos sin PII ni secretos; exportación manual acotada como primer puente. Los endpoints actuales pueden ser públicos pero no equivalen a acceso HTTP directo por dominio.
2. Crear una cola revisable para candidatos de PDF y afiches, con fecha ORIGINAL verificable, vínculo de postulación, localidad de trabajo, deduplicación y control de expiración.
3. Enlazar ingestion automáticamente solo tras demostrar autenticación del puente y recibos idempotentes.
4. Medir por fuente `visitadas → enlaces → documentos → candidatos → verificadas → publicadas`, conservando rechazos y motivos.
5. Mantener en cero los servicios pagados (Bright Data, IA/OCR externos) y no eliminar controles de seguridad.

**Sin modificar AppDeploy:** versión `1792931465127` y siete tareas habilitadas.  
**Sin merges:** PR #2 y PR #3 sin fusionar.  
**Sin ofertar resultados inexistentes:** cero nuevas publicaciones por este piloto.
