# Corrección de fidelidad a Stitch — 27 de octubre de 2026

Estado: candidata en revisión. No hay aprobación visual ni despliegue.
Base exacta: `e8469394d00b17ef4132f651f925d5dfd3b0c370`, rama `feature/redesign-stitch-2026-10`, PR #7 en borrador.

## Referencias obligatorias

Se recuperó `stitch_trabajo_cerca_ui_design (3).zip` original. Se inspeccionaron tanto los HTML y sus clases/configuración Tailwind como los PNG de:

- `trabajo_cerca_portada_web_1440px_identidad_oficial`.
- `trabajo_cerca_portada_app_m_vil_390px_identidad_oficial`.
- `trabajo_cerca_componente_publicitario_din_mico_3_campa_as`.

Sus `screen.png` y `code.html` se conservan sin modificación en `qa/stitch-reference/{web,mobile,advertising}/`. Los PNG exportados tienen anchos reales de 1524 y 465 px; no son capturas nativas de 1440/390. El comparador conserva el archivo original y lo escala proporcionalmente al ancho solicitado, indicando la operación. No se presenta un porcentaje de similitud arbitrario.

## Cambios concretos

- Cabecera de 64 px; máximo de 1280 px con 40 px de margen interno en web. Navegación original Empleos / Ofrecer mi trabajo / Buscar servicios / Publicidad, botón de publicación y menú existente.
- Portada web: ondas de radar de 520 px a la derecha, tipografía Plus Jakarta Sans/Inter, título de 48 px, buscador de 12 columnas (5/4/3), rubros procedentes del catálogo y filtros por comuna.
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

Se prepara una comprobación en GitHub Actions, restringida a esta rama y a repositorio público, con permisos de lectura, límite de 12 minutos, SDK aislado, rutas externas bloqueadas y artefactos de 2 días. No contiene despliegues, credenciales ni operaciones de backend. Su resultado debe consultarse antes de afirmar compilación o capturas aprobadas; preparar el workflow no significa ejecutarlo ni aprobarlo.

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

El guion genera `1440-full.png`, `390-full.png`, comparaciones `*-side-by-side.png`, banners por campaña y `results.json`. Si no existe captura, el comparador lo dice explícitamente y muestra la app ejecutable. Un fallo no se presenta como éxito visual.

## Revisión pendiente

Es obligatorio inspeccionar las comparaciones reales, corregir diferencias visibles y comprobar formularios, imágenes, texto ampliado y dispositivos antes de aprobar la fidelidad. Las pruebas con adaptador aislado no acreditan integración con el SDK real ni persistencia en el laboratorio. El PR debe seguir en borrador; no fusionar ni desplegar sin autorización.
