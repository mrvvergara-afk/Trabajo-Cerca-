# Trabajo Cerca — implementación Stitch (candidata en revisión)

> Este informe documenta la primera versión `e846939…`. La corrección posterior de fidelidad, sus adaptaciones y sus comprobaciones se documentan en [FIDELIDAD.md](FIDELIDAD.md). Los resultados de compilación históricos de abajo no validan automáticamente esa corrección.

## Base protegida

Rama nueva: `feature/redesign-stitch-2026-10`.
Base remota comprobada: `b8c5027311004c0c1c9fbf7a5933c8c98171baa6`, cabeza de `repair/admin-publication-circuit-2026-10-25` (PR #6).
Checkout independiente: `/workspace/redesign-stitch-2026-10`. No se alteraron los checkouts anteriores con cambios sin consolidar ni main/master ni las ramas de reparación.

El último laboratorio conocido es 1793032483929. GitHub y AppDeploy mantienen discrepancias documentadas anteriormente: esta rama no debe sustituir íntegramente el código nativo publicado. No se consultó ni desplegó AppDeploy durante este encargo y no se consumieron créditos de esa plataforma. No hubo migraciones, escrituras de datos, pagos ni servicios nuevos.

## Implementación real

- `src/stitch-brand.tsx` y `public/brand/`: logos horizontal/compacto suministrados en Stitch; radar extraído del grupo SVG de ese mismo logo. Marca móvil acompañada de nombre legible. SVG sin scripts ni dependencias externas. Iconos PWA anteriores preservados, no se cambió instalación/caché.
- `src/App.tsx`: encabezado y navegación desktop, copy de portada, radar/resumen móvil con conteos y selector reales, identidad y pie. Se reutilizan handlers y formularios existentes, no se agrega otro frontend ni otro catálogo.
- `src/vnext.css`: dueño de presentación de encabezado, portada, búsqueda, catálogo, tarjetas, pie y navegación inferior. Escritorio de tres columnas; móvil de una; tablet de dos. Búsqueda rápida, filtros avanzados conservados, controles mínimos de 44px, safe-area y foco.
- `src/compact-layout.css` y `src/premium-presentation.css`: retiradas las reglas de los componentes cuya presentación ahora pertenece a vnext.css. Conservadas reglas ajenas, diálogos, paneles y secciones secundarias. `css-consolidation.json` registra los selectores retirados por hoja.
- `src/house-advertising.tsx` y CSS propietario: familias visuales empleo, servicios y negocios sobre las seis campañas existentes. Solo se añadió un atributo de presentación; no se cambian selección, rotación, frecuencia, efectos, medición, destinos ni condiciones.

No se incorporan los empleadores, perfiles, distancias, números de cupos, contadores ficticios, testimonios, radios de 25km ni frases de rastreo en vivo de las maquetas. Las tres familias no reemplazan ni eliminan las seis campañas. Los anuncios comerciales conservan su precedencia. Los 20 fundadores/30 días y estándar de 14 días siguen en la configuración existente, sin hardcodearlos como disponibilidad real.

## Inspección del ZIP

Archivo: `stitch_trabajo_cerca_ui_design (3).zip`.
Contiene ocho propuestas HTML/screen.png (dos refinadas, componente de campañas, dos portadas con identidad oficial y tres logos) y territorial_craft/DESIGN.md. Las portadas con identidad oficial son la referencia principal. Los HTML de logos contienen SVG codificado en base64; se decodificó el original, no se copió una captura como logo.

DESIGN.md y las pantallas usan tonos azul/cian y textos de ejemplo; se conserva la estructura y jerarquía de Stitch adaptándola a la paleta verde oscuro/natural/lima exigida por el encargo. DESIGN.md se incluye como procedencia, no como instrucción que autorice cambios de negocio. No se ejecutan los scripts CDN ni Tailwind remoto del HTML exportado. El frontend sigue en React/Vite con dependencias ya existentes.

## Pruebas ejecutadas

- Node raíz: 51 archivos de pruebas aprobados, cero fallos reportados (`node --test tests/*.test.mjs`). El contador del runner corresponde a archivos de prueba; no se presenta como 51 recorridos reales de navegador.
- Node aplicación: 6 archivos aprobados, cero fallos reportados (`node --test tests/*.test.mjs`, desde el directorio de la app).
- Python: 245 pruebas aprobadas (`python -m unittest discover -s tests -p 'test*.py'`).
- TypeScript estricto: aprobado con `qa/tsconfig.stitch.json` y contrato SDK de referencia existente. No es verificación del SDK remoto.
- Build QA React/Vite: aprobado; 1631 módulos. Adaptador SDK aislado existente, sin conexión a producción.
- Build de componentes productivos: aprobado con `qa/vite.stitch-native.config.mjs`; 1626 módulos, SDK dejado externo para su inyección por plataforma. No equivale a ejecución remota.
- Backend: empaquetado sin modificación de sus fuentes; no se ejecutó ni se dispararon crons.
- Integridad: `git diff --check` aprobado; sin archivos cambiados en backend, shared, motores, reglas comerciales, auth, manifiesto o service worker. Recursos SVG verificables en check-preservation.py.

## Bloqueo visual: no declarar aprobado

Chromium local termina con `crashpad ... setsockopt: Operation not permitted`. Tras indicar un user-data-dir escribible persistió la restricción; los intentos con permisos adicionales no llegaron a ejecutarse. No se generaron capturas nuevas ni se afirmaron controles de desborde, navegación o accesibilidad en navegador como aprobados.

Se entrega `qa/stitch-browser-check.mjs` para la app React real con adaptador aislado: 360/390/430/768/1440, filtros, detalle, formularios sin envío, selección territorial, legales, capturas y errores. Este guion está preparado pero NO ejecutado. Rotula fixtures como pruebas, bloquea dominios externos y nunca debe presentarse como evidencia productiva. La carga de fotografías públicas y la persistencia real quedan fuera de este ensayo.

## Revisión e integración

Abrir como PR en borrador contra `repair/admin-publication-circuit-2026-10-25`, sin fusionar #2/#6 ni main. La revisión visual frente a Stitch y regresiones navegables es bloqueante para aprobar el diseño. No desplegar hasta contar con esas evidencias y autorización.

Para vista previa local, desde `integrations/appdeploy/house-ads`:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npx vite --config qa/vite.qa.config.mjs
```

El SDK es un adaptador de pruebas, no la API de AppDeploy. Sin parámetro de fixture el catálogo está vacío: no implica pérdida de ofertas reales. No copiar el adaptador a producción. Los datos sintéticos del modo de pruebas jamás deben incluirse en el build productivo.

Para ejecutar el guion: construir QA, iniciar `npx vite preview --config qa/vite.qa.config.mjs` y ejecutar `CHROME_PATH=/usr/bin/chromium node qa/stitch-browser-check.mjs` en otro terminal. Si Chromium no existe, usar una instalación autorizada compatible. No agregar infraestructura pagada para superar este bloqueo.

## Riesgos y reversión

El cambio visual es amplio y necesita inspección real de diálogos, filtros, imágenes, publicidad, radar y texto ampliado. La no modificación de lógica reduce riesgo, pero no prueba que todo sea pulsable. El SVG incluye texto con fuente del sistema: comprobar la legibilidad final. PWA conserva su icono anterior para no cambiar instalación dentro de un rediseño pendiente de aprobación. La conciliación GitHub/AppDeploy sigue siendo requisito antes de cualquier despliegue futuro.

Revertir únicamente el commit visual en esta rama restaura los componentes previos. Al no existir despliegue ni cambios de datos, no hay restauración de base de datos que realizar.
