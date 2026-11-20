# Trabajo Cerca · LAB — PWA Android y permisos administrativos (20-11-2026)

## Entornos y estado
- **LAB aislado** AppDeploy: `trabajo-cerca-lab-aislado-xirg9w`, versión `1795194052562`, estado `READY`, QA automático AppDeploy `frontend_errors=[]`, `network_errors=[]`.
- **Producción**: `trabajo-cerca-laboratorio-3ojgro`, versión `1795180490226`, **sin cambios**.
- La vista pública de ofertas y avisos en LAB utiliza APIs públicas de solo lectura. Las pruebas en CI no deben hacer carga contra esas APIs; únicamente un *smoke* de bajo volumen.

## Error detectado y corregido — formularios con actualización PWA
Causa en `src/pwa-update.tsx`: `hasUnsentInput()` únicamente comparaba `input.value` con `input.defaultValue`. Los campos controlados por React pueden sincronizar ambas propiedades durante un rerender; el usuario podía tener contenido sin enviar y la PWA no exigir confirmación antes de `SKIP_WAITING`.

Corrección realizada **en LAB únicamente**: se registran interacciones `input` y `change` en formularios activos mediante `WeakSet<HTMLFormElement>`, además de conservar la comparación anterior. Los formularios desmontados dejan de considerarse activos; los formularios de búsqueda se excluyen del seguimiento adicional. El código exacto validado está conservado en:
`integrations/appdeploy/lab-overrides/src/pwa-update.tsx`.

**Importante:** este archivo se guarda como referencia de laboratorio; no está fusionado en el frontend productivo. El traslado exige revisión de diferencias, pruebas y promoción controlada, no copiar sin inspección.

## Evidencia automática real
**Playwright Chromium móvil, 390×844, sin dispositivo físico**:
- Ejecución con `src/pwa-update.tsx` antiguo: run GitHub `44778817303`, intento 1 job `136435864820`, 3/4 aprobadas; falló la confirmación al actualizar con `value === defaultValue` en un formulario interactuado.
- Después de desplegar el arreglo LAB: reejecución del mismo job, intento 2 job `136437211233`, **4/4 aprobadas**, incluyendo selector Stitch de comunas, identidad PWA/íconos PNG 192 y 512, instalación de service worker, «Más tarde» preservando datos y «Actualizar» exigiendo confirmación que el usuario puede rechazar.
- Script: `scripts/lab-mobile-pwa.mjs`; workflow: `.github/workflows/lab-mobile-pwa.yml`.

**Comprobación de permisos públicos**:
- GitHub run `44779584301`, job `136438567276`, **10/10 aprobadas, 18 solicitudes**; los cinco accesos anónimos de lectura/moderación administrativa respondieron 401/403 y no modificaron publicaciones. Validó empleo, publicidad segmentada, directorio sin datos privados, formulario incompleto rechazado, íconos y SVG. No sustituye un E2E autenticado de aprobación.
- Script: `scripts/lab-release-smoke.mjs`.

## Restricciones y condiciones que siguen pendientes
1. **Android físico:** instalar PWA, abrir con una versión previa, mantener borrador sin enviar, optar por «Más tarde», aceptar después una actualización y comprobar estado / ícono. El test de Chromium **no reemplaza Android instalado**.
2. **Manifiesto:** AppDeploy aún informa «custom manifest build layout or app base cannot be established safely»; los íconos y el service worker pasan las comprobaciones HTTP/Chromium, pero hay que resolver o descartar la advertencia con evidencia antes de GO.
3. **Administrador autenticado:** crear ficha ficticia, iniciar sesión autorizada, aprobar, verla públicamente, retirarla y validar bitácora/permisos, sin copiar datos personales.
4. **Base de datos:** recuperación real, respaldo externo cifrado y restauración en otra BD aislada siguen **NO-GO**. El éxito de rollback de código o rehidratación en memoria no acredita DR.
5. **Capacidad:** 25 VU / 120 solicitudes locales sin errores; faltan pruebas controladas a mayor escala antes de producción.

## Política de promoción
- Trabajar sobre LAB y su rama de QA.
- Agrupar cambios y pruebas, no desplegar por cada detalle.
- Nunca promover ramas LAB enteras a producción sin revisar divergencias y características solo-lectura; jamás copiar base, secretos ni crons.
- GitHub PR #93 permanece borrador; seguimiento central issue #74; motor de rastreo por separado.

**GO de producción:** no autorizado. Aunque la PWA superó estas comprobaciones, los bloqueos de DR y pruebas E2E administrativas siguen abiertos.
