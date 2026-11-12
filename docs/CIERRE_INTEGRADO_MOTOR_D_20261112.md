# Trabajo Cerca — cierre integrado Motor D / autorización de liberación

**Fecha:** 12-11-2026. **PR único:** #45. **Estado:** preparado en rama, sin fusionar ni desplegar.

## Alcance corregido en la rama

1. Discovery: índices hasta 3.000 anclas por página con rotación, cargos ampliados y páginas de noticias de ATS empresariales excluidas de candidaturas; 2 fichas concretas de contraste reconsultadas cada barrido.
2. Cobertura real: páginas CMPC Cornerstone, CMPC Trabajando y SERFOCOL Trabajando con HTTP 200 pero sin fichas individuales se marcan **requiere lector especializado**, jamás cobertura total.
3. Verificación flexible: OMIL Mulchén **Postulación Abierta** y ficha agrícola individual de 100 cupos, jornada en sector Campamento y postulación presencial. Fecha original **no informada**, sin inventar cierre ni empleador.
4. Retención controlada (AppDeploy preparado): revisión diaria del estado de la misma ficha. Si abierta renueva evidencia por 14 días; si cerrada, baja; si no accesible, la prueba no se renueva y sale del feed al expirar su evidencia interna.
5. Publicación: inventario completo, comprobación semántica/URL, no republicar duplicados; conciliación de ofertas de lotes históricos no visibles sin reingresar a ciegas.
6. Pruebas: integración de #43 y #44, pruebas con HTML abierto/cerrado realista, split WordPress, 500+ anclas, noticias de portal, validación de estados estricta por ancla. TypeScript esbuild compilado sintácticamente; aún falta compilación y QA con runtime real de AppDeploy.

## Auditoría territorial real del PR (NO es publicación)

**Barrido 12-11, PR #45:** 175 fuentes automáticas consultadas, 245 enlaces posibles examinados. 34 fichas clasificadas para recuperación, 2 sin identidad en el feed público y aptas para preparar nuevo lote, catálogo completo de 270 registros. **Cero publicaciones reales** desde PR. Los dos nuevos candidatos son cargos de atención al usuario Call Center en Angol (Chiletrabajos IDs 3907745 y 3907748; publicación original 01-10; vencimiento fuente 15-12-2026), con sede del portal en Concepción pero texto laboral que incluye Angol. Verificar vigencia y exactitud de empresa antes de liberación.

**Mulchén:** el caso OMIL de cosecha de arándanos aparece **abierto**, la extracción real nueva ahora registra comuna, 100 cupos, empleador no informado, postulación presencial, sin fechas inventadas. La comparación con el feed completo devuelve `already_published_source_identity`; **no crear una segunda oferta**. Confirmar tarjeta visible y metadatos del registro existente al validar AppDeploy.

**Brechas externas:** inventario de 80 fuentes sin cobertura útil acreditada: 38 portales restringidos, 27 sociales sin API/lectura autorizada, 7 públicas fallidas, 4 lectores especializados, 2 índices parciales, 2 filtros territoriales. Esta corrección NO equivale a 100% de cobertura y la ausencia de ofertas no implica que no existan.

## Puerta de aceptación antes de producción

- [x] PR #45 integrado en una única rama y PR #43/#44 cerrados como supersedidos, SIN fusionar.
- [x] Pruebas unitarias GitHub, QA municipal, segundo pase/conciliación, cobertura de fuente y auditoría pública solo lectura aprobadas en PR.
- [x] QA del aviso Mulchén con HTTP real, estado abierto y deduplicación con feed completo.
- [ ] Validar compilación TypeScript/SDK del paquete del backend AppDeploy real (esbuild por sí solo no typechequea SDK).
- [ ] Validar en backend real la revalidación diaria, vencimiento de prueba de 14 días, baja y reactivación segura, sin borrado masivo de catálogo.
- [ ] Validar recibos de importación D, lotes en cuarentena y 2 candidatos de Call Center para postulación vigente.
- [ ] Comprobar contadores públicos ANTES y DESPUÉS, y enlaces de fichas individuales.
- [ ] Repetir rastreo forzado por 12 comunas. Reportar fuentes inaccesibles de modo honesto.

## ÚNICA liberación autorizada (no ejecutada)

1. Revisar que el AppDeploy actualmente desplegado sea el mismo snapshot que se usó para preparar `appdeploy_staging/`. Si hay cambios concurrentes, rebasar archivo por archivo antes de editar.
2. Desplegar **primero** en una sola operación AppDeploy los archivos de backend probados `chatgpt-direct-import.ts`, `municipal-index-status.ts` (nuevo), `offer-retention.ts`, `public-feed.ts`, `index.ts` con fuentes del PR #45 mapeados a `backend/`. Así el importador entiende los lotes municipales sin fecha antes de que el productor pueda enviarlos. No desplegar copias anteriores.
3. Verificar inmediatamente que el backend, el cron y el feed siguen operativos, sin caída de tarjetas ni regresión del catálogo. En caso de error, **revertir AppDeploy y no fusionar PR #45**.
4. Con el backend ya validado y autorización explícita, fusionar PR #45 a `main`, lo que activa las próximas pasadas automáticas de Motor D. Monitorizar el primer lote y sus recibos.
5. Ejecutar QA final fuente→lote→recibo→catálogo, comprobar publicaciones reales, cero duplicados y estado del aviso de Mulchén. Si falla, detener la promoción/publicación, conservar evidencias y coordinar reversión sin reimportar lotes ni borrar manifestos.

**Regla:** no informar “producción lista” hasta cumplir todos los controles, y no afirmar 100% de cobertura mientras fuentes bloqueadas o sociales permanezcan sin lectura efectiva.
