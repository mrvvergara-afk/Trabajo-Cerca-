# Trabajo Cerca — puerta de salida UX (13 de noviembre de 2026)

## Identidad y rollback
- Aplicación: `trabajo-cerca-laboratorio-3ojgro`
- Fuente de verdad pre-release: AppDeploy **v99**, versión **1794590590707**.
- URL: https://trabajo-cerca-laboratorio-3ojgro.v2.appdeploy.ai/
- Versión de rollback verificada en AppDeploy: **1794590590707**.
- Rama/PR: `feature/ux-polish-2026-11`, PR #60, sin fusionar, no apto para mezclar directamente con radar en `main`.

## Entregables preparados para un único despliegue
Los únicos archivos del frontend que se deben reemplazar o añadir en AppDeploy:
1. `src/App.tsx` (modificado; incluye lazy JS para LocalDirectory, navegación y publicación).
2. `src/local-directory.tsx` (modificado; acceso a revisión administrativa solo si auth.getUser() devuelve usuario).
3. `src/territorial-exploration.ts` (modificado; la comuna laboral depende de la ejecución real).
4. `src/ux-polish-2026-11.css` (**nuevo**, importado por App.tsx; incluye fix del aviso de consentimiento).

Fuente lista para integración: `ux-staging/appdeploy-1794590590707/preview/src/`.
**Importante:** `App.tsx` mantiene `import './local-directory.css'` para conservar los estilos globales del portal/consentimiento; únicamente el JavaScript del directorio se carga al abrirlo.

No tocar `backend/`, `shared/`, tablas, workflows de motores A-D, PWA ni asignador comercial de producción.

## QA ejecutado
- [36 de 36 ensayos estáticos, territoriales y de asignación de anuncios](https://github.com/mrvvergara-afk/Trabajo-Cerca-/actions/runs/43518455855) (la rama ha evolucionado pero estas pruebas siguen activas).
- [Compilación React/Vite completa con SDK simulado, aprobada](https://github.com/mrvvergara-afk/Trabajo-Cerca-/actions/runs/43519747885) (ver última ejecución bajo workflow QA UX full frontend).
- [46 de 46 ensayos Chromium aprobados](https://github.com/mrvvergara-afk/Trabajo-Cerca-/actions/runs/43522222548): anchos 320/360/390/412/768/1440; rutas, formulario de publicación de cuatro tipos, 12 comunas, manifest PWA, Escape, directorio, ausencia de overflow/errores JS. 6 capturas sintéticas disponibles como artefacto en GitHub Actions.
- Se descubrió y corrigió que el consentimiento interfería físicamente con los controles móviles; el test ahora garantiza que no se superpongan.

## Limitaciones y pasos de publicación
1. Reconfirmar con AppDeploy que el snapshot sigue en **1794590590707**; si cambió, reconciliar antes de aplicar.
2. **Solicitar y obtener autorización explícita** para el despliegue productivo.
3. Aplicar exactamente los cuatro archivos en un único `deploy_app`; AppDeploy debe compilar con el SDK real.
4. Comparar integridad del inventario público: cantidad e IDs de ofertas, estados, comunas, contactos y campañas, antes y después. No crear, borrar, reemplazar o relanzar rastreos para esta validación.
5. Confirmar con QA real rutas, formularios, campañas múltiples, consentimiento, directorio, PWA e importación de ofertas.
6. Medir carga real (LCP/CLS, latencia feed, request count). La mejora de carga diferida **no** certifica que el problema de lentitud general esté resuelto.
7. Si falla la compilación SDK, publicaciones, seguridad o campañas, **no insistir en producción**. Volver a la versión v99 `1794590590707` y analizar sin borrar datos.

## Nunca confundir
- QA simulado aprobado ≠ conexión real al SDK.
- Capturas de prueba con lista vacía ≠ catálogo productivo vacío.
- «Vigente» no debe inferirse de fecha de descubrimiento.
- El PR #60 es un paquete de integración sobre snapshot, no una fusión de `main`.
