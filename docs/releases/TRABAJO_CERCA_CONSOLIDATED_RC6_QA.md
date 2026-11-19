# Trabajo Cerca — RC6: limpieza de experiencia pública y privacidad visual

**Fecha:** 19-11-2026 · **Estado:** pendiente de QA y liberación; **NO desplegado**.
**RC6 reemplaza RC5 y todos sus predecesores; mantener un solo despliegue futuro** sobre snapshot AppDeploy `1795108368721`.

## Diagnóstico basado en las capturas de móvil

- La tarjeta muestra «Fuente externa · www.chiletrabajos.cl» en un espacio donde la persona necesita fecha, cargo y acción.
- La portada enseña permanentemente «104 resultados del catálogo» y otros recuentos de la infraestructura. Ese total fluctúa durante carga o filtros y no ayuda directamente a postular.
- La ficha de empleo muestra una fecha de última comprobación de evidencia, etiquetas de corrección del portal y una descripción generada por el motor «Motor D: ficha individual… Publicación de hoy o ayer».
- Los anuncios institucionales llevan una marca superpuesta «Imagen ilustrativa», a pesar de mostrarse como gráficos promocionales ya identificados.
- En una versión secundaria de la web se explican «Tres motores» y recuentos de OCR, candidatos y fuentes, información obsoleta e impropia del catálogo público.

## Reglas de interfaz pública

**Tarjeta:** título, empresa cuando está identificada, localidad real, fecha original, sello de vigencia/verificación y «Ver oferta». 
La fuente se presenta como **«Fuente externa»**, sin dominios `www` ni URLs. Solo si procede de un emisor oficial nombrado se muestra, por ejemplo, **«Municipalidad de Renaico»** u **«OMIL Nacimiento»**. El enlace original sigue disponible en «Ver oferta original», y los identificadores y dominios se preservan para trazabilidad **en backend**.

**Detalle:** prioridad a requisitos, descripción genuina del empleo, contacto/postulación, lugar real y fecha de publicación original. Omitir notas técnicas del rastreador, fecha de inspección de evidencia, discrepancias del portal y `selected.evidence` como texto bruto. Si una oferta no aporta descripción comercial útil, no inventar párrafo ni mostrar «Sin descripción adicional». Conservar siempre los estados «Verificada»/«Vigencia por confirmar» y el enlace de postulación válido.

**Portada:** esconder totales permanentes de catálogo y filtros, pero **mantener** estados de carga/verificación, contador de paginación útil «Página X de Y», botones, filtros por comuna, advertencias de seguridad y novedades accionables. No alterar ni limitar la consulta real del catálogo.

**Publicidad:** retirar el texto superpuesto «Imagen ilustrativa» de las diapositivas gráficas institucionales. **No borrar «Publicidad local» en campañas comerciales**, ni declaraciones de consentimiento/condiciones. La imagen institucional ya es ilustración de marca, no una fotografía del local real.

**Interno:** traslada la información sobre motores, OCR, capacidad y porcentajes al Centro de Control administrativo del RC5. No eliminar bitácoras ni API; cambio de presentación solamente. La información técnica existente en la vieja sección pública de tres motores se deja de mostrar.

## Archivos del único despliegue

[Manifiesto consolidado RC6](./TRABAJO_CERCA_CONSOLIDATED_RC6_APPDEPLOY_FILES.json) contiene **23 archivos únicos**:
- 21 del RC5, incluidos seis motores, fotos institucionales, carrusel comercial y panel BI.
- 1 archivo nuevo `src/public-content-policy.ts` con control de fuentes y notas internas.
- 1 parche `src/App.tsx` de 19 diffs finitos.
- `src/house-advertising.tsx` y `src/territorial-sections.tsx` ya estaban en RC5 y se amplían, **no se duplican**.

No tocar `backend/index.ts` más allá de las dos modificaciones ya preparadas para la telemetría; no cambiar `public-feed`, base de datos, selección de ofertas, repositorios de auditoría, recepción comercial ni configuración PWA.

## QA mínimo

1. Asegurar GitHub CI RC6, tests de fuentes y notas `test_public_content_policy.ts`, compilación TSX de pantalla principal y panel, unicidad de diffs, 23 SHAs y ausencia de textos técnicos.
2. En LAB **verdaderamente aislado**, abrir tarjetas existentes de CMPC, Peoplego y Municipalidad de Renaico, con y sin descripción fuente. Comprobar 320/360/390/430px y escritorio: ninguna URL ni «Motor D» en textos visibles, enlaces intactos, correcta fecha original.
3. Probar búsqueda, comuna, navegación «Página X de Y», carga progresiva, badges y casos sin imagen.
4. Probar anuncios de negocios y autopromociones; no quitar atribución de publicidad pagada, logo ni galerías; no inventar horarios ni fotografías auténticas.
5. Verificar 401/403 para panel, separación territorial de 12 principales y ciudades complementarias; rendimiento y accesibilidad.
6. Verificar rollback de versión, respaldo/restauración y observabilidad del único despliegue.

**No usar una única instancia llamada «Laboratorio» como prueba de aislamiento de datos.**
CI y merge solo preparan código. Autorizar despliegue exclusivamente tras verificación de estos gates.
