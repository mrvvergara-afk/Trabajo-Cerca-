# Trabajo Cerca — puente seguro, auditoría real de la cola y prioridad 20 días

Fecha: **25 de octubre de 2026**. Laboratorio: `trabajo-cerca-laboratorio-3ojgro`.

## Implementación publicada en AppDeploy

Snapshot **1792935124802**, estado `ready`, validación de compilación sin errores. Se añadió:
- `GET /api/admin/document-work`, con **requireAuth + requireAdminEmailAllowlist**; solo referencias públicas de documentos, límite 100, JSON v1, cero escrituras.
- `DocumentWorkExport`, visible solo tras autorización en panel administrativo.
- Se conservaron las siete tareas previas, la base de datos y las restricciones de proveedores.
- Prueba GitHub Actions del 25-10: acceso ANÓNIMO a la ruta administrativa devolvió **401**, y el backend real `https://api-v2.appdeploy.ai/app/trabajo-cerca-laboratorio-3ojgro/api/ops/free-public-sources` devolvió JSON con 52 referencias. La dirección SPA `https://trabajo-cerca-laboratorio-3ojgro.v2.appdeploy.ai/api/... ` devuelve HTML, no JSON. Por tanto ya no se requiere una descarga manual para alimentar este PoC desde la ruta pública de referencias.

## Auditoría estructural de 52 referencias

Reporte de la ejecución GitHub Actions `40198658290`, artefacto `12600014673`:
- **52** referencias, todas tipo `document`.
- **43** URL con año/mes anterior a octubre de 2026, fuera de la ventana de 20 días por mes de ruta.
- **6** URL con mes octubre de 2026; **3** sin mes deducible de URL. **Estos 9 solo son candidatos de LECTURA**: el mes en URL no acredita la fecha original del aviso.
- Renaico 29, Negrete 9, Malleco 7 5, Lumaco 3, Las Noticias de Malleco 3, Radio Nativa 1, Mulchén 2.
- No se eliminaron los 43 del inventario; se excluyeron únicamente de la muestra prioritaria.

## Lecturas de las 9 referencias priorizadas

Ejecución `40198889852`: 9 leídas, primera clasificación:
- **1** archivo de Negrete vencido el **16 de octubre de 2026** y referente a puestos de venta; no se publicará como empleo.
- **3** archivos municipales de Lumaco con señales de cargos y bases de concurso: Jefatura de Turismo y Medio Ambiente (grado 8), profesional grado 12 y decreto de llamado a concurso. NO se publicó ninguno. El texto del decreto indica **13 de julio de 2026**, incompatible con la actualidad requerida salvo pruebas nuevas.
- **5** sin evidencia suficiente para generar ofertas.

Tras mejorar la validación de fechas, ejecución `40199153813`, artefacto `12601805261`:
- 1 vencido, 3 sin evidencia suficiente, **5 bloqueados por comprobación no concluyente de robots.txt**, entre ellos las referencias de Lumaco y dos ediciones de Malleco 7.
- El resultado inconsistente para un mismo host entre distintas ejecuciones demuestra que no se debe confundir fallo temporal de accesibilidad con ausencia de vacantes ni desactivar robots.txt para forzar resultados.
- Las pruebas unitarias del nuevo filtro de fechas pasaron. **0 nuevas ofertas confirmadas y 0 escrituras**.

## Integración y próximo bloqueo real

- El lector gratuito Python / PyMuPDF / Tesseract procesa referencias públicas existentes de forma directa, sin credenciales ni costos de API.
- **NO está conectado al publicador de Trabajo Cerca**. Ninguna referencia debe convertirse en publicación sin fecha original comprobada (máximo 20 días), cargo individual, localidad real y modo de postulación válido.
- La prueba solo ha examinado cola documental preexistente. No soluciona todavía la recolección de Instagram/Facebook, especialmente afiches nuevos difundidos en cuentas OMIL.
- Las fuentes municipales con robots.txt indeterminados quedan bloqueadas, no se eluden restricciones.
- Las siguientes tareas son: (1) mejorar **descubrimiento reciente** en páginas municipales con fecha visible y enlaces individuales, (2) reemplazar el simple mes de URL por fecha de publicación verificable, (3) conectar registros verificados con el publicador mediante flujo autenticado e idempotente, (4) medir `encontradas/extraídas/verificadas/publicadas/rechazadas`, (5) considerar PoC aparte para aportes de capturas sociales de fuentes públicas.

## Seguridad y costo

- 0 proveedores pagados invocados; no se cambiaron permisos, no se utilizaron credenciales externas, no hubo escrituras en base, no se fusionó PR #3.
- El valor $0 se refiere a servicios externos pagados; los términos y cuotas de las plataformas se rigen por sus planes.
- La app sigue con advertencias previas de PWA y el 503 transitorio del catálogo en inicio, no atribuibles al lector aislado.
