# Trabajo Cerca — RC4 comercial: identidad fija + contenido visual útil

**Fecha:** 19-11-2026 · **SIN DESPLIEGUE**. RC4 **reemplaza RC3/RC2/RC1** para la siguiente actualización única de producción.

## Problema reportado
La publicidad de Ferretería Mininco utiliza una imagen principal o logo y otras fotografías. En distintos teléfonos el logo aparece parcialmente visible y la galería casi no comunica nada.

Causas técnicas verificadas en código v99:
- `src/commercial-slides.css` usa `object-fit:cover` en la imagen de portada, lo cual recorta logotipos o información textual.
- `src/ux-compact-2026-11.css` aplica una vista compacta de **64 × 64 px** en móvil al elemento `tcCommercialVisual`; la galería completa queda limitada a ese espacio.
- `src/commercial-slides.tsx` ya procesa hasta cuatro láminas adicionales, pero incluye por defecto una lámina de portada; no distingue imagen corporativa permanente del material promocional cambiante.
- `src/commercial-overview.tsx` permite anexar fotos y láminas informativas y el backend acepta `slides` de tipo `image`, `hours`, `products`, `contact`; **no hay que diseñar otro backend de galerías**.

**No se ha accedido al registro privado ni a los archivos reales de Ferretería Mininco.** La falla visual se prueba en código y con datos sintéticos; la validación del negocio real será una prueba LAB.

## Cambios RC4
- Módulo `src/commercial-media-policy.ts` nuevo: con láminas adicionales, la imagen principal heredada se mantiene como logo fijo junto al nombre; no se repite como la primera lámina del carrusel. Si no existen láminas, la imagen principal se muestra de forma estática. Si existe un `logoUrl` distinto, la portada gráfica se mantiene como material visual.
- `src/territorial-sections.tsx`: nombre siempre visible; logo opcional y fijo; galería identificada con `data-has-gallery`.
- `src/commercial-slides.tsx`: fotos completas, información comercial sin foto con tarjeta de texto, orden de láminas existente, dots discretos y controles táctiles/manuales mediante hook existente.
- `src/commercial-slides.css`: `object-fit: contain` y visual de 158 px en móvil con galería, en lugar de 64 px; estilo exclusivo de campañas con contenido extra, sin aumentar todas las tarjetas de la app.
- No hay cambios en datos, rutas API, pagos, autorizaciones ni publicidad institucional.
- `useRespectfulCarousel` existente: cambia cada 5,5 s solamente visible y respetando preferencia de movimiento reducido; selección manual pausa rotación.

## Recepción de material: política recomendada, no implementada aún
**Solicitar de forma opcional 1 logo + hasta 3 fotografías**; aceptar campañas sin imágenes, generar texto/diseño institucional simple y láminas de horarios solo cuando el negocio informe datos exactos.

Flujo previsto: solicitud web → datos comerciales y aceptación de derechos de uso → adjuntos opcionales con validación → bandeja privada → revisión administrativa → edición/optimización → aprobación → vista previa → publicación.

La solicitud web actual **no envía correo automático ni archivos adjuntos**; el administrador sí puede subir imágenes en su editor, en formatos JPG/PNG/WebP con máximo 200 KB por archivo. No describir el nuevo flujo público de adjuntos como disponible hasta implementar carga segura, almacenamiento separado, moderación y política de retención.

No solicitar RUT, CV, dirección personal, documentos de identidad ni cuentas de usuarios para esta publicidad. Contacto comercial y email/WhatsApp opcionales con consentimiento explícito para publicación.

## Paquete RC4
- Manifiesto: `docs/releases/TRABAJO_CERCA_CONSOLIDATED_RC4_APPDEPLOY_FILES.json`, fijado a AppDeploy v99 `1795108368721`, **16 archivos** combinados: 6 de motores + 2 institucionales + 4 de Centro de Control + 4 de comercial.
- El manifiesto contiene cambios mínimos para archivos existentes y fuente completa solo para nuevos; SHA Git de cada archivo.
- No cargar `backend/index.ts`, `src/App.tsx`, bases de datos ni formularios públicos al despliegue por esta mejora.
- Validación `automation/test_release_candidate_rc4.py` y `.github/workflows/commercial-carousel-qa.yml`.

## Antes de autorizar producción
1. LAB y PROD separados por BD, secrets, almacenamiento y cron. Si solo existe una instancia, **NO-GO** para pruebas con escrituras.
2. En LAB, comprobar la publicidad de Ferretería Mininco con fotos que el anunciante haya autorizado, preservando nombre y logo durante transición de todas las imágenes.
3. Revisión en 320/360/390/430 y 768/1440 px: logo completo, texto no cortado, tarjetas de horarios legibles, sin scroll lateral, transición moderada y preferencia de movimiento reducido.
4. Verificar foto rota o archivo faltante, clic de CTA, impresión comercial única, prioridad de campañas comerciales y reemplazo por autocampaña tras vencer.
5. Solicitudes nuevas sin imágenes y negocios sin logo, sin mensajes falsos de correo o publicación.
6. Backups/restauración, smoke de catálogo y control de publicación de motores como en #74.

**Estado de código en GitHub no equivale a despliegue.** Solo un despliegue final autorizado.
