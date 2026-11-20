# Trabajo Cerca · RC9 · 20 noviembre 2026

**Estado:** DESPLEGADO Y VERIFICADO EN NAVEGADOR.

- AppDeploy: `trabajo-cerca-laboratorio-3ojgro`, versión `1795174234095`, estado `ready`.
- Web/PWA: https://trabajo-cerca-laboratorio-3ojgro.v2.appdeploy.ai/
- Código: [PR #91](https://github.com/mrvvergara-afk/Trabajo-Cerca-/pull/91), fusionado.
- CI antes de despliegue: 8/8 controles exitosos.
- Prueba posterior con navegador real: [QA RC9](https://github.com/mrvvergara-afk/Trabajo-Cerca-/actions/runs/44728639093) PASS.

## Cambios consolidados
1. **Publicidad local móvil:** parrilla explícita imagen + texto, CTA en fila completa; arregla desplazamiento/corte en Ferretería Mininco. El componente mantiene el contenido real; no carga fotografías inexistentes.
2. **Comuna en cabecera:** segunda fila de ancho completo; evita que «Collipulli» y «Nacimiento» aparezcan truncados. En prueba de 320 px, select visible con ancho de 202 px.
3. **Invitación a instalar:** franja discreta, descartable por sesión, exclusiva de modo navegador; usa `beforeinstallprompt` cuando existe y ayuda cuando no. No fuerza instalación. En oferta compartida se añade CTA de instalación dentro del detalle, preservando enlace `?listing=`.
4. **Privacidad:** medición opcional desactivada por defecto cuando no hay consentimiento registrado; la preferencia puede cambiarse en pie de página. Sin modal al primer ingreso.

## QA
- Anuncio «Ferretería Mininco» verificado vía navegador real en 320, 360, 390 y 430 px: imagen, contenido y CTA dentro del ancho de tarjeta. Sin desbordes horizontales.
- Cabecera en cuatro medidas: selector de ancho completo, sin recorte de nombre por contenedor.
- Invitación visible en navegador, consentimiento no aparece por defecto.
- Enlace con `?listing=<id>` abre el detalle, con CTA para instalar PWA.
- AppDeploy: validación válida, 0 errores frontend y 0 errores de red detectados por QA.
- Observación de arranque: en la construcción del feed, AppDeploy registró brevemente `PUBLIC_FEED_DEGRADED (manifest_building)`; la prueba posterior sí encontró ofertas y publicidad.

## Pendiente fuera del alcance RC9
- Ferretería Mininco: la API pública reporta imagen principal y 0 láminas/fotografías adicionales. Las fotos no pueden mostrarse hasta que sean cargadas/asociadas por el editor administrativo.
- No se verificó aceptación de consentimiento analítico en una cuenta real ni instalación nativa desde todos los navegadores integrados; los CTA usan funciones nativas y guía cuando el navegador no las soporta.
- No se modificaron motores A/B/C/D/ChatGPT/Gemini, backend, inventario ni almacenamiento de publicaciones.
