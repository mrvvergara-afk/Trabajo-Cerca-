# Siguiente ciclo: recuperación real de fuentes y ranking de rendimiento

Corte inicial: 11 de noviembre de 2026. **No reemplaza el contrato de cobertura**: las 12 comunas y cada fuente activa siguen siendo obligatorias en cada barrido completo.

## Motivo del ciclo

El PR #41 está integrado y **su primera ejecución real quedó comprobada**:
- 172/172 consultas públicas intentadas, 0 omitidas.
- 32 ofertas inicialmente aptas, 30 ya presentes en catálogo y 2 existentes en el historial de lotes. **Nuevos lotes creados: 0.**
- Publicador respaldado por catálogo completo de 260 registros; comprobante en `publication_gate.json`.

Se detectó una regresión distinta: `source_performance.json` había contado páginas individuales (`individual>0`) pero mantenía `ready=0` para TODAS las fuentes. La razón era que el campo opcional `express_ready=false` bloqueaba el crédito incluso a ofertas válidas de recuperación antiguas aún abiertas, y los IDs ya vistos impedían migrar correctamente la historia.

## Reparaciones incluidas

1. La fuente gana prioridad solo cuando una ficha supera las reglas reales `EXPRESS` o `RECUPERACION`. `express_ready=false` **no implica inválida**.
2. Historial separado de identidades elegibles `seen_eligible_candidate_ids`. Migra los registros previos que ya eran válidos aunque el contador marcara cero. Una repetición de la misma ficha no vuelve a incrementar rendimiento.
3. Se mantienen IDs Chiletrabajos estabilizados para evitar doble conteo entre `portal.chiletrabajos.cl` y `chiletrabajos.cl`.
4. Se guarda **`source_recovery_queue.json`** en cada ejecución con las fuentes pendientes, causa, comuna(s), prioridad y próxima acción legal para recuperar datos. Ninguna se borra ni se declara recuperada sin prueba de lectura.
5. Se incorpora **CONAF Concursos Laborales** como fuente oficial permanente: `https://www.conaf.cl/quienes-somos/concursos-laborales/`. La página oficial publicó los concursos 845 (Monumento Natural Contulmo, Purén) y 846 (Parque Nacional Nahuelbuta, Angol), vigentes hasta el 23 de noviembre de 2026. Deben verificarse individualmente las bases, fecha original y enlace de postulación; descubrirlas **no equivale a publicarlas automáticamente**.

## Prioridad del inventario pendiente (fotografía previa a esta ampliación)

| Grupo | Entradas | Respuesta |
|---|---:|---|
| Lector específico requerido | 2 | Reconciliar CMPC Playwright y tarjetas SAFCO con su ficha individual |
| Filtro territorial aún no demostrado | 1 | Adaptar índice nacional Mipleo a las 12 comunas |
| Otras fuentes públicas fallidas | 8 | Encontrar índice oficial alternativo, RSS o API autorizada y documentar causa |
| Indeed + Computrabajo restringidos | 38 | Complementar con ATS oficiales y portales accesibles, **sin eludir bloqueos** |
| RRSS sin lector autorizado | 27 | Preferir OMIL web/RSS municipal o conexión API permitida |
| **Total sin cobertura útil certificada** | **76** | Conservar la deuda fuente a fuente |

Los agregadores regionales `https://www.trabajopublico.cl/araucania` y `https://www.trabajopublico.cl/biobio` son **candidatos de recuperación, no fuentes completas dadas de alta**: requieren paginación de todas las convocatorias regionales y verificación con las bases oficiales. Jamás contar las primeras 35 fichas de un listado de cientos como el catálogo completo.

## Criterios de cierre del siguiente ciclo

- Ranking deja de mostrar cero cuando existen ofertas verificables, y la misma identidad no infla el indicador en pasadas repetidas.
- El inventario de recuperación registra el 100 % de los bloqueos y enlaza su salida con su causa.
- Una fuente nueva se mantiene en el manifiesto con origen y localidades; el barrido prueba su acceso sin afirmar que todos sus avisos fueron leídos si hay paginación o material no estructurado.
- Oferta encontrada → comprobar vigencia, fecha y comuna de ejecución → contrastar catálogo público → publicación efectiva, sin usar el registro como sustituto de la prueba.
- **No desplegar AppDeploy sin autorización.** Ninguna escritura en app pública durante pruebas de PR.

## Mejora adicional incorporada al mismo ciclo

Se detectó otro defecto operativo: los índices con más de 35 ofertas
seleccionaban siempre las **primeras 35** en el orden HTML, por lo que
las vacantes posteriores podían quedar ignoradas en cada ejecución.
Ahora el lector conserva el límite de 35 fichas por fuente y pasada
(para no saturar los cron), pero **rota de forma determinista** usando
el historial persistente de intentos por fuente. Un índice con 44
ofertas distintas alcanzará las 44 en dos pasadas si el orden del
portal permanece estable. La URL individual y la deduplicación siguen
controladas por las validaciones anteriores.

**Límite transparente:** esto no sustituye una lectura completa en
una sola pasada ni la paginación del portal; los índices largos
continúan clasificados `index_pagination_required` hasta desarrollar
un lector paginado/estructurado. El reporte agrega
`index_rotation_offset`, `index_candidates_selected` y
`index_candidates_detected` como evidencia. Nunca confundir
intentos de lectura con ofertas publicadas.
