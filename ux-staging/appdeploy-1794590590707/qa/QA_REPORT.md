# QA definitivo de integración aislada — Trabajo Cerca (13-11-2026)

**Estado:** aprobado en preflight aislado. **NO desplegado** ni mezclado con el radar.

## Evidencia aprobada
- 36/36: territorio, alias, ubicación de trabajo, campaña comercial, vigencia, fallback institucional, sintaxis y contratos UI. [GitHub Actions](https://github.com/mrvvergara-afk/Trabajo-Cerca-/actions/runs/43522222593).
- Compilación React/Vite del frontend completo reconstruido desde AppDeploy snapshot `1794590590707`, con alias de pruebas `@appdeploy/client` aislado. [Build Vite aprobado](https://github.com/mrvvergara-afk/Trabajo-Cerca-/actions/runs/43522222590).
- 46/46: Chromium real con datos simulados en 320, 360, 390, 412, 768 y 1440 píxeles. [QA Chromium aprobado](https://github.com/mrvvergara-afk/Trabajo-Cerca-/actions/runs/43522222548).
- Se obtuvieron seis capturas de pantalla de la simulación. Están como artefacto del workflow Chromium.
- Se descubrió y corrigió un bloqueo de la navegación inferior causado por el banner de consentimiento; ahora existe un test geométrico que verifica que no se superpongan.
- Se comprobaron los 4 flujos de publicación sin enviar datos: ofrecer trabajo, solicitar servicio, solicitar trabajadores y aportar aviso al Radar.
- Se verificó la navegación de oficios, servicios, comercio y empleos, manifiesto de PWA, 12 comunas principales y Exclusión de Quilaco.

## Archivos a aplicar (solo tras autorización)
1. `src/App.tsx`
2. `src/local-directory.tsx`
3. `src/territorial-exploration.ts`
4. `src/ux-polish-2026-11.css` (nuevo)

Fuente consolidada de 92 archivos reconstruidos y 4 modificados/añadidos:
`ux-staging/appdeploy-1794590590707/preview/`.

## Límites
- El SDK real de AppDeploy **no** se probó en la simulación. El stub `qa/appdeploy-client-stub.ts` no puede conectarse a datos reales y **NO** debe desplegarse.
- Pruebas con catálogo sintético vacío no son medición de integridad de publicaciones reales.
- No se midieron LCP/CLS ni latencias en el backend de producción.
- No se probó la autorización real del panel administrativo ni la instalación completa de la PWA, solo el manifiesto.
- Los binarios públicos, motores A/B/C/D y backend productivo no se modificaron.

## Puerta de release
Ver `qa/RELEASE_GATE.md`: versión v99/1794590590707 reservada como rollback; confirmar snapshot antes de aplicar, autorización explícita, un único despliegue, QA real y reconciliación del catálogo.
