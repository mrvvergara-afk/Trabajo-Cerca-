# Trabajo Cerca — Reparación del radar en revisión

La [ampliación aplicada de fuentes públicas](docs/ampliacion-fuentes-publicas-2026-10-13.md) añade adaptadores de portales, recuperación local y una comprobación gratuita en la app. El límite es 45 días desde la fecha original; el informe distingue preparación, lectura real y publicación confirmada.

El radar externo recolecta candidatos públicos, conserva un historial local y verifica páginas individuales de Chiletrabajos cuando contienen evidencia suficiente. La app indicada por el usuario recibe lotes firmados de GitHub y confirma IDs en el feed. El productor programado de `main` sigue pendiente de integrar la reparación después de su revisión. La ejecución local de `pipeline.py` prepara una cola y no publica por sí sola.

La reparación está en una rama independiente y la rama principal se conserva para la revisión. Los cambios aplicados en la app autorizada se documentan por versión; no sustituyen la activación del recolector externo actualizado.

La política solicitada de 45 días y el diagnóstico de cobertura están en el [informe del 13 de octubre](docs/diagnostico-cobertura-45-dias-2026-10-13.md). El informe distingue los cambios aplicados en la app indicada por el usuario de los recolectores preparados en la rama para revisión.

Consulta el [resultado actual y pendientes](docs/resultado-publicacion-laboratorio-2026-10-12.md), el [informe de auditoría](docs/auditoria-radar-2026-10-11.md), la [continuación del feed](docs/continuacion-feed-laboratorio-2026-10-12.md) y la [integración y respaldo del laboratorio](docs/integracion-y-respaldo-laboratorio-2026-10-12.md). La lectura real confirmó **dos ofertas publicadas y visibles**, con el feed completo y sus recibos guardados en el respaldo del laboratorio.

## Pruebas sin red ni credenciales

Requisitos: Python 3.12 y Node.js 24. No se instalan dependencias.

```sh
python -m unittest discover -s tests -v
node tests/appdeploy-repair.test.mjs
node tests/appdeploy-public-feed.test.mjs
node tests/appdeploy-ingestion.test.mjs
node tests/verification-schedule.test.mjs
node tests/workflow-checkpoint.test.mjs
node tests/appdeploy-local-evidence.test.mjs
node tests/appdeploy-social-evidence.test.mjs
node tests/appdeploy-social-evidence-store.test.mjs
node tests/appdeploy-social-repair.test.mjs
node tests/appdeploy-age-policy.test.mjs
```

Las ofertas de las pruebas son ficticias. No se ejecutan Actors, IA ni peticiones a AppDeploy.

## Ejecución del radar externo

Este comando consulta páginas públicas; debe ejecutarse después de revisar la reparación:

```sh
python scripts/pipeline.py
```

`VERIFY_LIMIT` acepta 0–60; `BACKFILL_DAYS`, 1–45 (45 por defecto); `RADAR_BUDGET_SECONDS`, 30–1100. Las rutas locales se configuran con `RADAR_OUTPUT_DIR` y `RADAR_STATE_DIR`. La fecha original debe tener como máximo 45 días y la postulación debe seguir vigente. La captura o reverificación no rejuvenece el aviso. Los registros históricos se conservan aunque dejen de ser publicables.

El recolector público consume el catálogo `config/local-source-priorities.json`: nueve sitios municipales, Malleco 7, Radio Nativa y dos sitios corporativos. Excluye identidades pendientes y perfiles sociales de este rastreo HTML. Lee una página por fuente en cada ronda y conserva la fuente siguiente cuando agota el tiempo; una cola terminada no demuestra cobertura completa de 45 días. Las redes y los portales distintos de Chiletrabajos todavía necesitan rutas propias de extracción, verificación e ingesta.

| Archivo | Contenido |
| --- | --- |
| `state/radar.sqlite3` | Inventario, observaciones, intentos y checkpoints entre ejecuciones. No se elimina el histórico. |
| `output/candidate_inventory.json` | Inventario acumulado, incluidos pendientes y rechazados. |
| `output/verification_stage.json` | Resultados y motivos de la verificación actual. |
| `output/publication_queue.json` | Ofertas con evidencia completa, fecha límite futura y verificación reciente; `dry_run: true`. |
| `output/pipeline_summary.json` | Estado de cada etapa, fallos y límites. Publicaciones externas: 0. |

Los verificadores de municipalidades, RSS y redes sociales requieren adaptadores propios; sus candidatos se conservan pendientes. Una comuna buscada o mencionada en navegación no confirma el lugar de trabajo.

## Recuperación del histórico

Después de descargar y descomprimir un artefacto anterior:

```sh
python scripts/import_artifacts.py /ruta/al/artefacto --state state/radar.sqlite3
```

La importación deduplica y exige reverificar antes de preparar publicaciones. No confía en banderas `verified` o `published` del archivo.

## GitHub Actions preparado

El job general del workflow propuesto solo ejecuta el radar en `main`. En la rama de reparación hay un piloto acotado que necesita un commit explícito `[lab pilot]` o inicialización manual; consulta una sola comuna, hasta tres ofertas y no usa proveedores de pago. Los cambios de todos los scripts y pruebas quedan cubiertos por el disparador.

Entre ejecuciones se restaura un checkpoint de SQLite. Si falta o expiró, la ejecución programada se detiene para evitar reiniciar el historial. La primera inicialización manual necesita `initialize_state=true`, después de revisar y respaldar los artefactos; importa el último artefacto de candidatos disponible.

Los artefactos siguen teniendo 7 días de retención. **Esto no es una base de datos durable ni un respaldo permanente**: hace falta definir esa persistencia antes de depender del radar en operación.

El piloto ya creó snapshots verificados de SQLite en `radar-state-laboratorio` y una segunda ejecución restauró y continuó el histórico: 190 candidatos y 2.750 observaciones conservados. El cron del laboratorio recibe los lotes firmados de esa rama; no se añade una ruta pública de escritura ni se cambian claves. Los artefactos temporales del job general y este respaldo del laboratorio son mecanismos distintos; producción todavía requiere revisión.

Apify mantiene bloqueado el inicio de Actors. Con un token existente solo se comprueban la conexión y resultados de ejecuciones previas; no se cambian credenciales.

La revisión de fuentes locales, afiches y PDF está documentada en [fuentes-locales-y-afiches-2026-10-12.md](docs/fuentes-locales-y-afiches-2026-10-12.md). Distingue la reparación aplicada en la app de la cobertura y publicación automática local aún pendientes.
