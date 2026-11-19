# Trabajo Cerca — RC3: ocho archivos anteriores + Centro de Control privado

**Estado:** código en preparación/QA; **NO desplegado**. RC3 supersede RC2 y RC1 para el próximo despliegue único, sin alterar la v99 existente mientras no se autorice.

## Contrato de la versión
- Paquete único: `docs/releases/TRABAJO_CERCA_CONSOLIDATED_RC3_APPDEPLOY_FILES.json` (**12 archivos** con SHAs Git de los orígenes; 5 diffs de archivos existentes + 7 módulos nuevos).
- Se conservan las seis correcciones backend de motores y dos cambios del carrusel fotográfico contenidos en RC2.
- Se agregan cuatro archivos UI: `src/administrator-access.tsx` (2 diffs), `src/executive-metrics.ts`, `src/executive-control-center.tsx` y `src/executive-control-center.css`.
- El archivo `backend/index.ts`, `src/App.tsx` y los módulos comerciales permanecen intactos.

## Centro de Control — primera etapa fiel al dato
El panel aparece solo tras autenticación administrativa y validación de allowlist existente. Su portada muestra exactamente **cinco KPI**:
1. **Ofertas visibles actualmente** (dato existente de `/api/ops/summary`). **No se llama ofertas nuevas del día.**
2. **Cobertura efectiva**: `Sin datos` hasta consolidar lecturas útiles por motor/URL.
3. **Motores saludables**: `Sin datos` hasta disponer de latidos y estados comparables de A/B/C/D/ChatGPT/Gemini.
4. **Candidatos pendientes** del resumen vigente (no son publicaciones).
5. **Campañas activas**, con solicitudes comerciales como nota.

Detalles privados: estados de reporte B/C y última importación de Gemini (NO se equipara a publicación), tabla expandible por las 12 comunas con ofertas visibles, fuentes con auditoría, fuentes previstas y fallidas. Temuco y Los Ángeles no aparecen en la tabla principal. Una fuente con registro de auditoría no se cuenta como leída efectivamente. La interfaz usa las rutas administrativas protegidas existentes: `GET /api/admin/territorial-coverage`, `GET /api/admin/gemini/status`, `GET /api/admin/motors/health`.

## Seguridad y fiabilidad
- Todas las rutas de datos ya requieren sesión autorizada y correo en allowlist en AppDeploy v99.
- El panel solo monta dentro de `allowed` (verificado por `GET /api/admin/session`); no implementa persistencia, ni `fetch` directo, ni POST/PUT, ni expone datos de contacto.
- Si fallan rutas, muestra `Sin datos` y avisa que la información es parcial; no convierte fallos en cifras cero.
- Estilos encapsulados, grid responsivo 5→3→2→1 columnas según ancho; detalles territoriales colapsables y tabla con scroll horizontal propio.
- No añade nuevos cron ni tareas de rastreo; carga 3 consultas paralelas solo cuando el administrador abre el panel.

## Pruebas
- `automation/test_release_candidate_rc3.py` confirma 12 fuentes inmutables, 12 comunas, acceso restringido, sin escrituras y resguardos de despliegue.
- `appdeploy_staging_ui/src/test_executive_metrics.ts`: prueba cero vs ausencia de datos, separación complementaria, 5 KPI con números reales y estados `Sin datos`.
- Compilación TSX del panel, administración y CSS en GitHub Actions.
- Antes de producción: QA navegador Android 360/390/430 px y escritorio, sesión 401/403, cierre de sesión y vuelta al inicio; PWA caché vieja/nueva, sin datos ni HTML privado en red pública; métricas de catálogo comparadas con el feed; prueba de carga de endpoints en LAB.

## Bloqueantes
El único despliegue público todavía no está autorizado. Continúa sin acreditarse una instancia LAB separada, backup/restauración, resultados de carga ni publicación E2E de los motores. **Aprobar la CI significa preparación técnica; no significa GO a producción**.

Se mantiene el Plan Maestro #74 y cierre de motores #72, con toda modificación consolidada para un solo despliegue cuando exista QA operacional y autorización expresa.
