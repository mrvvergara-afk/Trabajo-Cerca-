# Trabajo Cerca — Lote UX en preparación (13-11-2026)

## Versión fuente y estado
- Código fuente base: **AppDeploy laboratorio, snapshot 1794590590707**, recuperado desde el lector de código del despliegue.
- Esta carpeta es un **overlay de integración aislado**, no es el frontend activo ni el proyecto completo.
- Rama de trabajo: `feature/ux-polish-2026-11`, creada desde `main` para no modificar motores ni flujos de publicación.
- No hay fusión ni despliegue. **No conectar esta carpeta a CI/CD ni copiarla a ciegas a producción.**

## Cambios realizados
1. `src/territorial-exploration.ts`: el filtro de ofertas y los totales por comuna usan exclusivamente `workCommunes` (lugar real de ejecución), no `recruitmentCommunes`; normalización de Mininco, Coihue/Coigüe y Capitán Pastene conservada.
2. `src/App.tsx`: navegación web/móvil de cuatro destinos; salida explícita al comercio local; botón Publicar y selector con cuatro opciones reales ya existentes; se conserva el circuito de publicación, sin simular formulario ATS formal.
3. `src/ux-polish-2026-11.css`: héroe web más pequeño, selector territorial visible en cabecera móvil, primera zona de contenidos más compacta, accesos táctiles y publicidad propia de búsqueda comprimida sin suprimir slots.
4. Conservados `HOUSE_AD`, todas las ubicaciones publicitarias, flujos comunitarios, panel administrador, PWA, lectores, motores A/B/C/D y backend.

## Integración posterior (no ejecutada)
1. Reconciliar con la fuente de verdad exacta de AppDeploy 1794590590707: asegurar que el snapshot desplegado no haya cambiado.
2. Aplicar estos **dos archivos modificados y CSS nuevo**, manteniendo intacto el resto del código desplegado; usar `src/App.tsx` de aquí como referencia de cambios, no sobrescribir si apareció versión más reciente.
3. Ejecutar build TypeScript/React, comprobaciones de formularios y rutas, pruebas de privacidad y QA visual 320/360/390/412/768/1440.
4. Verificar especialmente que `workCommunes` es sitio real de trabajo en cada familia de avisos, y que la vista de ciudad complementaria consulta la comuna de ejecución, no la publicación.
5. Comparar volumen y selección de ofertas antes/después; ninguna oferta del catálogo debe ser eliminada por esta mejora de UI.
6. No autorizar despliegue hasta que estas pruebas pasen.

## Pruebas de aceptación pendientes
- Mininco pertenece a Collipulli; Coihue/Coigüe a Negrete; Capitán Pastene a Lumaco.
- Anuncio que recluta en Angol pero trabaja en Temuco NO cuenta como oferta local.
- Todas las 12 comunas consultables, Quilaco y Alto Biobío no disponibles.
- Barra inferior móvil: Empleos, Oficios, Servicios, Comercio, y CTA Publicar visible.
- Publicar diferencia persona/oficio, servicio, solicitud de trabajadores y aporte moderado al Radar.
- No se presentan solicitudes de personal como vacantes formales verificadas.
- Los 4 slots comerciales siguen configurables, con autopromoción por defecto.
- Rendimiento LCP/CLS en navegación real y cero desborde horizontal verificados antes de cerrar el lote.

## Precaución
Las pruebas estáticas verifican presencia de cambios, no sustituyen QA en el navegador o el SDK real. No se ha evaluado visualmente una compilación de este overlay.
