# Trabajo Cerca — RC P1: paquete único de estabilización de motores

**Fecha:** 19-11-2026 · **Estado:** preparación / QA de código; **NO DESPLEGADO**.
**Base AppDeploy fija:** aplicación `trabajo-cerca-laboratorio-3ojgro`, snapshot `1795108368721` (v99).
**Fuente de verdad de cambios:** `docs/releases/TRABAJO_CERCA_P1_RC1_APPDEPLOY_FILES.json`.

## Contenido exactamente preparado

Solo los seis archivos `backend/` enumerados en el manifiesto:
1. `chatgpt-direct-import.ts` — evidencia de ubicación real en vez de inferencia por título o marca.
2. `public-source-verifier.ts` — descartar nombres de empresas al interpretar la ubicación de faena.
3. `motor-gemini-github-pull.ts` — reconocer Trabajando.com, mantener avance en cola, separar territorio complementario y métricas `queued` / `alreadyQueued`.
4. `motor-b-sources.ts` — añadir RSS de Negrete al lector XML existente, sin nuevo sistema de parseo.
5. `worksite-semantics.ts` — módulo nuevo para clasificación territorial conservadora.
6. `gemini-verify-scheduler.ts` — módulo nuevo de programación de reintentos.

**NO incluir** el fichero `backend/index.ts` ni reenviar el frontend completo: no cambiaron en el paquete. Las correcciones del productor Gemini PR #9 y #10 ya se integraron en **su propio repositorio** y no requieren un nuevo despliegue de AppDeploy.

## Cambios guardados / validados sin riesgo

- Los cuatro archivos existentes tienen **diffs quirúrgicos** generados desde el snapshot v99 y reproducidos contra el staging actual; dos módulos son nuevos.
- Los seis blobs de staging están fijados por SHA Git y comprobados con `automation/test_release_candidate_p1.py`.
- La CI `.github/workflows/release-p1-readiness.yml` comprueba contrato, test territorial, cursor Gemini y sintaxis TypeScript; **no llama a AppDeploy ni toca datos**.
- El JSON es una **lista de ficheros para una eventual llamada única a AppDeploy**, no prueba de aislamiento ni autorización.

## GATE 0 — aislación de LAB (bloqueante)

En AppDeploy se identificó **una sola instancia** Trabajo Cerca, a pesar de su nombre «Laboratorio». No se puede demostrar LAB/PROD separado por nombre.
Antes de probar escrituras, verificaciones o publicaciones de ensayo:
- Tener identificadores LAB y PROD distintos y comprobar bases de datos, secrets, storage, credenciales, eventos y cron separados.
- LAB con **datos ficticios y fuentes sintéticas** claramente marcadas; nunca copiar contactos, secretos o BD reales.
- Cron productivo y conectores que pudiesen publicar deben quedar deshabilitados o desacoplados en LAB.
- Una URL de QA jamás debe listar anuncios ficticios como ofertas reales.
- **Si no existe LAB, estado NO-GO**. Crear un LAB separado requeriría una instalación/despliegue adicional y no puede suponerse incluido en «un despliegue de producción».

## GATE 1 — aceptación de código antes de desplegar

- CI del manifiesto y todas las regresiones existentes en verde.
- Confirmar que snapshot AppDeploy **sigue siendo** `1795108368721`; si no, volver a inspeccionar y regenerar diffs, sin forzarlos.
- Confirmar que fuente en GitHub conserva los seis SHA consignados.
- Test 12 comunas + Mininco, Coihue, Capitán Pastene; «Forestal Mininco» y «Bosques Arauco» **no son lugares de trabajo** por sí solos.
- Test Trabajando individual vs índice; Opción Empleo como agregador sin promoción directa; medios/OMIL a revisión.
- Verificación `duplicate_check_in_progress` retoma en siguiente cron sin reset cada 24 h, pero comprobar que un bloqueo permanente tampoco detenga toda la cola.
- El procesamiento documental de Negrete requiere XML real, no solo HTTP 200.

## GATE 2 — pruebas operacionales **solo LAB**

1. Recorrido completo: anuncio real de prueba (con fuente pública vigente, sin datos personales) → candidato → inbox → validación → deduplicación → verificador → proyección del feed → respuesta HTTP → UI pública. **Sin publicación automática de anuncios sintéticos**.
2. Para cada motor A/B/C/D/ChatGPT/Gemini: `previstas / intentadas / leídas útiles / fichas / elegibles / nuevas visibles` y motivo por descartes, no mezclar contadores.
3. Confirmar que los 12 municipios están aislados de Temuco/Los Ángeles y que no aparecen duplicados ni falsos sitios de trabajo.
4. Pruebas 401/403 en funciones administrativas; carga y consulta sin credenciales indebidas; nunca exponer contactos por error.
5. Pruebas Android/PWA (pantalla abierta + recarga + actualización + red lenta) y feed viejo/actual.
6. Respaldo documentado, restauración de datos **de ensayo** y rollback de versión de LAB probados (revertir código no revierte base de datos).
7. Simular falla de GitHub, ATS, RSS y feed; no borrar anuncios activos por un fallo de lectura.
8. No declarar cobertura completada por HTTP 200, ni publicación por una inserción en cola.

## GATE 3 — único despliegue de producción autorizado

- Requiere aprobación explícita del propietario **después** de revisar resultados LAB y respaldo.
- Preparar una llamada `deploy_app` al app_id de producción real, con **solo** estos seis ficheros; no incluir archivos no modificados.
- Congelar snapshot y verificar compatibilidad de esquema de datos; registrar versión anterior para rollback.
- Tras `ready`, smoke HTTP público + admisión móvil + catálogo y territorios + formulación de prueba no persistente; analizar errores y latencias reales.
- Si falla, detener promoción/retornar al release anterior y gestionar DB separadamente.

## Estado no cumplido al crear esta guía

**NO-GO para PROD:** no existe LAB aislado verificado, no se ha probado backup/restore, no se ha confirmado un anuncio nuevo visible desde el puente integrado, no hay autorización para desplegar.
Las pruebas automáticas únicamente certifican integridad del código/paquete.

**Plan Maestro:** `docs/PLAN_MAESTRO_PREPRODUCCION_Y_CONTINUIDAD_20261118.md`; gestión en #74 y motores en #72.
