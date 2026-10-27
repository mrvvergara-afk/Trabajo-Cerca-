# Corrección de fidelidad a Stitch — 27 de octubre de 2026

Estado: corrección implementada, compilación y navegador aislado aprobados. Comparaciones inspeccionadas y diferencias corregidas en iteraciones. El PR sigue en borrador para revisión del propietario; no hay fusión ni despliegue.
Base exacta: `e8469394d00b17ef4132f651f925d5dfd3b0c370`, rama `feature/redesign-stitch-2026-10`, PR #7 en borrador.

## Referencias obligatorias

Se recuperó `stitch_trabajo_cerca_ui_design (3).zip` original. Se inspeccionaron tanto los HTML y sus clases/configuración Tailwind como los PNG de:

- `trabajo_cerca_portada_web_1440px_identidad_oficial`.
- `trabajo_cerca_portada_app_m_vil_390px_identidad_oficial`.
- `trabajo_cerca_componente_publicitario_din_mico_3_campa_as`.

Sus `screen.png` y `code.html` se conservan sin modificación en `qa/stitch-reference/{web,mobile,advertising}/`. Los PNG exportados tienen anchos reales de 1524 y 465 px; no son capturas nativas de 1440/390. El comparador conserva el archivo original y lo escala proporcionalmente al ancho solicitado, indicando la operación. No se presenta un porcentaje de similitud arbitrario.

## Cambios concretos

- Cabecera web de 64 px y móvil de 56 px. Tras comparar capturas, contenedor web de 1092 px con 40 px interiores (1012 px útiles), ajustado a la composición del PNG aprobado normalizado a 1440 px. El HTML nominal de 1280 px se inspeccionó como punto de partida; no se mantuvo su mayor ancho al comprobar la discrepancia visual. Navegación original Empleos / Ofrecer mi trabajo / Buscar servicios / Publicidad, botón de publicación y menú existente.
- Portada web: ondas de radar de 520 px a la derecha, tipografía Plus Jakarta Sans/Inter, título de 54 px y 650 px de ancho para reproducir el salto de línea observado, buscador de 12 columnas (5/4/3), rubros procedentes del catálogo y filtros por comuna.
- Portada móvil: cabecera con selector real; radar oscuro antes del buscador; buscador de 48 px y rubros horizontales; encabezado de oportunidades; tarjetas compactas; bloque de oficios; publicidad; otras ciudades y navegación Inicio / Empleos / Servicios / Publicar.
- Seis tarjetas por página web y cuatro por página móvil, con acceso a todas las restantes mediante la paginación existente. Tres columnas en escritorio, dos en tablet y una en móvil. Se conservan fuentes, estados y fechas, con detalle completo y truncamiento de textos largos.
- El bloque de oficios de Stitch usa un perfil real aprobado, si está disponible; en su ausencia presenta un estado vacío útil. No se copia el perfil ficticio, sus opiniones ni la supuesta verificación de la maqueta.
- `stitch-fidelity.css` sustituye la sección pública anterior de `vnext.css`. Los estilos de formularios, detalles, autenticación y operaciones se conservan.
- Tipografías originales alojadas localmente, con sus licencias OFL. Se conservan los SVG oficiales y los iconos de instalación PWA anteriores.

## Adaptaciones funcionales imprescindibles

- Paleta verde oscuro / natural / lima solicitada. No se reincorpora el azul/cian exportado.
- Conteos y comunas reales, sin distancias, radios de 25 km, rastreo «en vivo», actualización instantánea, cupos restantes o empleadores inventados.
- Se conservan las 13 localidades de esta rama y la configuración heredada de ciudades complementarias; no se resuelven automáticamente las diferencias de Quilaco/Victoria.
- Los anuncios comerciales conservan su precedencia y sus ubicaciones anteriores. Las campañas propias asignadas ocupan un único visor editorial, con selector entre los slots ya disponibles. El visor puede tener menos de tres opciones: no se fuerzan campañas fuera de la asignación existente para imitar una maqueta.
- Las seis HOUSE_AD, su selección, rotación de sesión, frecuencia máxima, destinos y reglas comerciales no cambian. Los observadores existentes permanecen montados; solo el banner visible puede generar impresión tras la visibilidad requerida. No se añade un temporizador de 7 segundos que reemplace el circuito comercial.
- Se conservan el radar interactivo y la actualidad como detalles secundarios, además del menú. Los formularios de personas, contratación, servicios, aportes, publicidad y legales siguen usando los handlers existentes.
- La nota de fundadores describe 20 negocios elegibles y 30 días individuales; la prueba estándar posterior es de 14 días. No indica disponibilidad ficticia ni activa pagos.

## Validación de esta corrección

Ejecutado localmente:

- Suite de la aplicación: 6 archivos, 0 fallos.
- Suite focalizada de raíz (permisos administrativos, inventario, presentación, revisión y exploración territorial): 6 archivos, 0 fallos, después de recuperar los archivos necesarios del checkout parcial.
- Comprobación sintáctica de scripts Node/Python y `git diff --check`.

Bloqueos locales:

- Chromium termina con `crashpad … setsockopt: Operation not permitted` incluso con perfil escribible. No se repiten escalaciones de navegador.
- El proxy de la terminal no permite recuperar dependencias; la instalación con permiso adicional quedó retenida y fue interrumpida. No se afirma una compilación local nueva ni se reutilizan los resultados de la versión anterior como prueba de esta corrección.

Se ejecutó una comprobación en GitHub Actions, restringida a esta rama y a repositorio público, con permisos de lectura, límite de 12 minutos, SDK aislado, rutas externas bloqueadas y artefactos de 2 días. No contiene despliegues, credenciales ni operaciones de backend. La ejecución final y sus evidencias se detallan abajo; los bloqueos locales no se presentan como pruebas aprobadas.

## Reproducción en otro entorno

Desde `integrations/appdeploy/house-ads`, en una máquina con Node 24, Python y navegador habilitado:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npx playwright install --with-deps chromium
python -m pip install Pillow==11.3.0
node qa/stitch-run.mjs
```

Esto ejecuta la suite de app, TypeScript estricto con el contrato SDK de referencia, build aislado, build nativo con SDK externo y pruebas/capturas a 1440/390/360/430/768 px. Las fotografías del ensayo se sirven desde los recursos locales; no se consulta producción. Los formularios se abren y cierran sin enviar solicitudes reales.

El resultado está en `qa-stitch-dist/` y la evidencia en `qa-output/stitch-fidelity/`. Para abrir la vista descargada:

```sh
cd qa-stitch-dist
python -m http.server 8000 --bind 127.0.0.1
```

Abrir `http://127.0.0.1:8000/` para comparar y `/qa/stitch-preview.html` para la app aislada. No publicar este build QA. Los datos sintéticos están rotulados y solo se incluyen mediante la configuración de pruebas.

El guion genera `1440-viewport.png` y `390-viewport.png` con 844 px de alto, páginas completas `*-full.png`, comparaciones `*-side-by-side.png`, banners por campaña y `results.json`. Para la página completa se amplía el alto del viewport al contenido, por lo que la navegación fija aparece al pie; se conservan por separado las capturas reales a 844 px. Si no existe captura, el comparador lo dice explícitamente y muestra la app ejecutable. Un fallo no se presenta como éxito visual.

## Evidencia final ejecutada

Código validado: `534eff6f83830c4641b424a1c544476cb12a2641`.
[GitHub Actions 40533117722](https://github.com/mrvvergara-afk/Trabajo-Cerca-/actions/runs/40533117722): **success**.
Los commits posteriores de documentación/evidencia no cambian este frontend.

- TypeScript estricto con contrato SDK de referencia: aprobado.
- Build de la vista React aislada: aprobado.
- Build nativo de frontend con SDK externo: aprobado.
- Pruebas de app en CI: 53 casos aprobados, sin fallos. La suite local de app y las pruebas focalizadas de raíz suman 12 archivos aprobados.
- Navegador: aprobados 1440, 390, 360, 430 y 768 px; sin desbordamiento horizontal ni errores JavaScript no capturados en los recorridos del guion.
- Recorridos probados: paginación adaptativa, detalle/retorno, búsqueda sin resultados/restablecimiento, comuna/rubro, selector de campañas e imágenes, apertura/cierre con Escape de oferta y contratación, privacidad y ausencia de solicitudes operativas. Formularios sin envío a producción.
- Capturas reales a 1440 y 390 px y comparaciones lado a lado generadas e inspeccionadas. También se capturaron las familias publicitarias de empleo, servicios y negocios usando los turnos del asignador existente.

Evidencia permanente en [evidence/](evidence/): `results.json`, `build-results.json`, `review.json`, `preservation.json` y comparaciones [web](evidence/web-comparison.png) / [móvil](evidence/mobile-comparison.png).

### Diferencias encontradas y corregidas

La primera captura mostró contenedor demasiado ancho, título web en una sola línea, tarjetas y bloques auxiliares móviles demasiado altos. Se ajustaron ancho, salto de título, densidad y divulgación de herramientas secundarias. Se sustituyeron las pestañas móviles externas de publicidad por indicadores dentro del banner. La segunda ejecución detectó una superposición entre filtros y «Quitar filtros»; ambos controles se reorganizaron en un contenedor flex y la comprobación volvió a ejecutarse sin fallos. También se añadió semántica de diálogo, foco y cierre con Escape a los formularios existentes, sin cambiar validaciones ni publicación.

Medidas observadas en la ejecución final: tarjetas web de aproximadamente 326.7 × 276 px, tres columnas, inicio x=214; tarjetas móviles de 358 × 113 px a 390 px, primera tarjeta y=293. No se declara identidad matemática de píxeles: el contenido real, la paleta verde solicitada, la paginación y el inventario publicitario son adaptaciones documentadas.

### Límites de la validación

El bloqueo de Chromium local persiste; la evidencia procede del Chrome del runner público de GitHub. Se superó el impedimento para esta revisión mediante el entorno aislado, sin AppDeploy. No se acreditan SDK productivo, persistencia real, instalación/offline, auditoría completa de accesibilidad ni texto ampliado como aprobados. La portada preserva el código de esas funciones, pero esas integraciones requieren comprobación en su entorno real.

El propietario conserva la aprobación final de fidelidad. Mantener el PR en borrador y no fusionar ni desplegar sin autorización expresa. GitHub y el laboratorio siguen pendientes de reconciliación.
