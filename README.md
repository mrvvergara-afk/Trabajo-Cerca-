# Trabajo Cerca — Reparación del radar en revisión

El radar recolecta candidatos públicos, conserva un historial local y verifica páginas individuales de Chiletrabajos cuando contienen evidencia suficiente. Prepara una cola de ingesta; **todavía no publica ofertas en AppDeploy**.

La reparación está en una rama independiente. Producción y la rama principal no se actualizan durante esta auditoría.

Consulta el [informe de auditoría](docs/auditoria-radar-2026-10-11.md) y el [parche preparado para AppDeploy](integrations/appdeploy/README.md).

## Pruebas sin red ni credenciales

Requisitos: Python 3.12 y Node.js 24. No se instalan dependencias.

```sh
python -m unittest discover -s tests -v
node tests/appdeploy-repair.test.mjs
node tests/workflow-checkpoint.test.mjs
```

Las ofertas de las pruebas son ficticias. No se ejecutan Actors, IA ni peticiones a AppDeploy.

## Ejecución del radar externo

Este comando consulta páginas públicas; debe ejecutarse después de revisar la reparación:

```sh
python scripts/pipeline.py
```

`VERIFY_LIMIT` acepta 0–60; `BACKFILL_DAYS`, 1–60; `RADAR_BUDGET_SECONDS`, 30–1100. Las rutas locales se configuran con `RADAR_OUTPUT_DIR` y `RADAR_STATE_DIR`.

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

El workflow propuesto solo ejecuta el radar en `main`; esta rama de reparación no inicia recolectores. Los cambios de todos los scripts y pruebas pasan a estar cubiertos por el disparador.

Entre ejecuciones se restaura un checkpoint de SQLite. Si falta o expiró, la ejecución programada se detiene para evitar reiniciar el historial. La primera inicialización manual necesita `initialize_state=true`, después de revisar y respaldar los artefactos; importa el último artefacto de candidatos disponible.

Los artefactos siguen teniendo 7 días de retención. **Esto no es una base de datos durable ni un respaldo permanente**: hace falta definir esa persistencia antes de depender del radar en operación.

Apify mantiene bloqueado el inicio de Actors. Con un token existente solo se comprueban la conexión y resultados de ejecuciones previas; no se cambian credenciales.
