# Trabajo Cerca — RC5 · Centro de Control con indicadores homologados

**Fecha:** 19-11-2026. **Estado:** código preparado en GitHub y sujeto a QA; **NO desplegado en AppDeploy**.
Este RC5 **sustituye** a RC4, RC3, RC2 y RC1: una única actualización final, no cinco despliegues.

## Diseño del cuadro de mando

Inspiración visual solicitada por propietario: paneles OWOX, Datapine, AgencyAnalytics y Geckoboard. No copiar sus marcas ni datos ficticios. Diseño propio responsive con:
- Franja superior de cinco KPI con tonos azul, turquesa, violeta, ámbar y verde.
- Gráfico de líneas/área de actividad de A/B/C (selector por unidad; no sumar fuentes con documentos).
- Anillo de lecturas accesibles/intentadas para A/D/ChatGPT/Gemini.
- Barras horizontales de ofertas **visibles** en las 12 comunas originales.
- Tabla comparativa de los seis motores (estado, intento, lecturas, hallazgos, cola, publicación acreditada).
- Indicadores explícitos de calidad del dato, edad del reporte, historial incompleto y ausencia de evidencia.
- Ajuste de móvil sin scroll horizontal salvo tabla detallada; respetar `prefers-reduced-motion`.

## Homologación operativa

Contrato puro en `appdeploy_staging/engine-metrics-contract.ts`:
- `scheduled`: fuentes previstas del universo propio del motor (nulo si no se conoce).
- `attempted`: fuentes intentadas, o documentos visitados en B/C; unidad explícita.
- `useful`: lecturas accesibles, sin challenge, según el comprobante de cada motor (nulo si no consta).
- `blocked`: restricciones/errores de acceso reportados con campo inequívoco.
- `candidates`: detecciones o fichas revisadas según rol; no homologar automáticamente como ofertas aptas.
- `verified`: aprobaciones de verificador solo con testimonio directo.
- `queued`: cola o nuevas entradas que **no son publicaciones**.
- `publishedConfirmed`: solo conteos de origen conciliados con feed público; de lo contrario **null**.
- `processed`: documentos/enlaces tratados por motores B/C, sin equipararlos a fuentes.
- `observedAt`: fecha y hora original del reporte. Si está desactualizado, se marca como tal.

Los seis motores tienen identificador y contrato. Sus **roles son distintos**: A/D/ChatGPT/Gemini descubrimiento, B/C procesamiento documental. Está prohibido comparar productividad mediante sumas de unidades heterogéneas.

## Fuentes y permisos

`GET /api/admin/ops-telemetry` se añade **solo** al router existente mediante
`requireAuth()` + `requireAdminEmailAllowlist(ADMIN_EMAILS)`, `Cache-Control:no-store,private`.

Fuentes:
- A: `free_public_source_cursor_v3` + muestra de `free_public_source_runs`.
- B: `motor_b_latest` + muestra de `motor_b_runs`.
- C: `motor_c_local_latest` + muestra de `motor_c_local_runs`.
- D: `motor_d_bridge_status` y `producer_heartbeat.json` público.
- ChatGPT: auditoría pública GitHub `automation/chatgpt_coverage/YYYYMMDD.json` (solo del día local Santiago; sin informe = ausencia, nunca inventar).
- Gemini: `gemini_github_pull_status` y auditoría privada `output/gemini_source_audit_v2.json`, usando servidor y secreto **ya existente** `MOTOR_C_GITHUB_READ_TOKEN` cuando esté disponible.

El importador y el rastreador de Gemini informan etapas diferentes; no asumir que 16 importadas son 16 nuevas fuentes ni 16 publicadas.
Adaptadores remotos realizan GET sobre rutas exactas, con timeouts de 5 segundos y caché de cuatro minutos; responden **solo métricas agregadas**. Nunca retornan token, emails, teléfonos, listados de candidatos ni URLs individuales.

Las tendencias de A/B/C usan una muestra de máximo 60 registros por colección, no historia certificada completa. No atribuir publicaciones a un motor por tener un candidato en cola. El catálogo público sigue siendo la única fuente de verdad de ofertas visibles; la conciliación única origen-oferta-feed sigue pendiente.

## Seguridad y aceptación

1. CI: adaptar fixtures de los seis motores (incluyendo sin datos, cero genuino y latidos stale), tests de 12 comunas y de roles, compilación TSX/CSS y backend, manifiesto RC5 con SHA de los 24 archivos.
2. QA visual en móvil 320/360/390/430 px y desktop 768/1440 px. Gráficos, donut, barras y tabla deben mantenerse legibles sin desbordes.
3. QA de acceso: usuario anónimo 401, usuario no habilitado 403, administrador autorizado 200; ningún GET debe escribir DB ni exponer secretos.
4. QA de fuentes: informes ausentes, GitHub 404/403/429, secreto no configurado, fuente stale y diferencia entre 'checked_found' y 'failed'; todo se muestra sin datos falsos.
5. QA de consistencia: recuento de ofertas por comuna vs feed, métricas A vs su último sumario, D vs heartbeat, Gemini vs su auditoría, ChatGPT vs el archivo del día, B/C vs latest.
6. QA de carga (solo LAB aislado): 20/50 usuarios simultáneos visitando frontend, refresco dashboard admin, tiempos de API y consumo de cuotas DB. La ruta privada no debe sobrecargar rastreo.
7. LAB independiente con separación real de BD, secretos, crons y storage, respaldo y restauración ensayados.
8. Un **solo despliegue productivo** posterior, autorizado, únicamente sobre snapshot compatible. Anotar rollback de código y estado de datos.

## Limitaciones explícitas al cierre de código

El nuevo contrato es real y completo, pero **no toda la instrumentación de producción está cerrada**. No se ha demostrado la conciliación de una nueva vacante visible por motor, ni la historia diaria exhaustiva de cada fuente. Los motores B y C no tienen métricas de páginas útiles estrictamente equivalentes a A y D. El panel presenta esas ausencias y evita porcentajes engañosos.

**NO-GO para producción mientras no se verifiquen laboratorio, restauración, seguridad, carga y recorrido real hasta el feed.** Una ejecución satisfactoria de GitHub Actions no equivale a validación operacional.

## Fuentes del paquete
- `docs/releases/TRABAJO_CERCA_CONSOLIDATED_RC5_APPDEPLOY_FILES.json` (21 archivos únicos; 16 RC4 + 5 módulos/rutas adicionales y 3 archivos de panel actualizados).
- `automation/test_release_candidate_rc5.py`.
- `.github/workflows/engine-telemetry-visual-bi-qa.yml`.
- Plan Maestro: `docs/PLAN_MAESTRO_PREPRODUCCION_Y_CONTINUIDAD_20261118.md`.
