# Trabajo Cerca — Reparación del radar en revisión

La [continuación de avisos recientes](docs/avisos-recientes-y-horario-2026-10-13.md) confirmó **dos publicaciones nuevas de BNE**, en Angol y Traiguén, mediante sus IDs en un feed completo. Pasaron 248 pruebas. Un navegador público encontró publicaciones enlazadas de Renaico y Negrete; esos enlaces aún necesitan verificación laboral individual. La reparación quedó en el [PR #1, en borrador](https://github.com/mrvvergara-afk/Trabajo-Cerca-/pull/1); no se integró a `main` ni se activó el horario externo permanente.

Las nuevas ofertas BNE fueron incorporadas al catálogo mediante la búsqueda de esta continuación. La publicación es real; el piloto no acredita descubrimiento automático completo ni cobertura de 45 días en todos los portales o redes. El lector oficial relee fuentes curadas, por lo que el horario por sí solo no sustituye la ampliación de su descubrimiento.

La [conexión del lector de documentos](docs/conexion-documentos-2026-10-13.md) está aplicada. Cuatro ciclos gratuitos comprobaron lectura, límites, OCR completo y continuidad del respaldo; pasaron 242 pruebas en GitHub. Los documentos revisados aún no aportaron una oferta publicable, y los IDs anteriores siguieron visibles. La programación permanente del lector externo requiere integrar después de revisión; `main` conserva su versión.

La [continuación del radar regional](docs/continuacion-fuentes-regionales-2026-10-13.md) registra una oferta nueva de BNE confirmada en la app, las correcciones de fuentes y selección de candidatos, 225 pruebas aprobadas y los pendientes de redes sociales y afiches. El límite es 45 días desde la fecha original; detectar, guardar y publicar se comprueban por separado. `main` sigue sin integrar.

El radar externo recolecta candidatos públicos, conserva el historial y verifica páginas individuales de Chiletrabajos, Indeed, Computrabajo, LinkedIn y Laborum cuando contienen evidencia suficiente. Opción Empleo exige comprobar su fuente original. También prepara avisos locales y documentos mediante lectores gratuitos. La app indicada por el usuario tiene un recolector público propio y recibe lotes firmados de GitHub; guardar un aviso solo se confirma como publicación cuando su ID aparece en el feed. El productor programado de `main` sigue pendiente de integrar la reparación después de su revisión. La ejecución local de `pipeline.py` prepara una cola y no publica por sí sola.

La reparación está en una rama independiente y la rama principal se conserva para la revisión. Los cambios aplicados en la app autorizada se documentan por versión; no sustituyen la activación del recolector externo actualizado.

La política solicitada de 45 días y el diagnóstico de cobertura están en el [informe del 13 de octubre](docs/diagnostico-cobertura-45-dias-2026-10-13.md). El informe distingue los cambios aplicados en la app indicada por el usuario de los recolectores preparados en la rama para revisión.

Consulta el [resultado del piloto del 12 de octubre](docs/resultado-publicacion-laboratorio-2026-10-12.md), el [informe de auditoría](docs/auditoria-radar-2026-10-11.md), la [continuación del feed](docs/continuacion-feed-laboratorio-2026-10-12.md) y la [integración y respaldo del laboratorio](docs/integracion-y-respaldo-laboratorio-2026-10-12.md). El piloto confirmó dos ofertas publicadas y sus recibos guardados. Esa observación histórica no representa el conteo vigente; la [ampliación del 13 de octubre](docs/ampliacion-fuentes-publicas-2026-10-13.md) registra las comprobaciones posteriores.

## Pruebas sin red ni credenciales

Requisitos: Python 3.12 y Node.js 24. Las pruebas de OCR/PDF necesitan Tesseract con español, Poppler, una fuente DejaVu y Pillow 11.3.0; GitHub Actions instala estos lectores gratuitos.

```sh
python -m unittest discover -s tests -v
for suite in tests/*.test.mjs; do node "$suite"; done
```

Las ofertas de las pruebas son ficticias. No se ejecutan Actors, IA ni peticiones a AppDeploy.

## Ejecución del radar externo

Este comando consulta páginas públicas; debe ejecutarse después de revisar la reparación:

```sh
python scripts/pipeline.py
```

`VERIFY_LIMIT` acepta 0–60; `BACKFILL_DAYS`, 1–45 (45 por defecto); `RADAR_BUDGET_SECONDS`, 30–1100. Las rutas locales se configuran con `RADAR_OUTPUT_DIR` y `RADAR_STATE_DIR`. La fecha original debe tener como máximo 45 días y la postulación debe seguir vigente. La captura o reverificación no rejuvenece el aviso. Los registros históricos se conservan aunque dejen de ser publicables.

El recolector público consume `config/local-source-priorities.json`: 20 fuentes HTML admitidas, incluidos nueve sitios municipales, medios regionales, sitios/portales de empresas y tres ofertas individuales revisadas de BNE. El catálogo de portales está en `config/portal-source-priorities.json`. Excluye identidades pendientes y perfiles sociales del rastreo HTML. Conserva rotación y paginación por fuente; una cola terminada no demuestra cobertura completa de 45 días. Los accesos bloqueados y los formatos que no aportan datos suficientes quedan pendientes, sin iniciar proveedores pagos.

| Archivo | Contenido |
| --- | --- |
| `state/radar.sqlite3` | Inventario, observaciones, intentos y checkpoints entre ejecuciones. No se elimina el histórico. |
| `output/candidate_inventory.json` | Inventario acumulado, incluidos pendientes y rechazados. |
| `output/verification_stage.json` | Resultados y motivos de la verificación actual. |
| `output/publication_queue.json` | Ofertas con evidencia completa, plazo futuro o formulario habilitado comprobado y verificación reciente; `dry_run: true`. |
| `output/pipeline_summary.json` | Estado de cada etapa, fallos y límites. Publicaciones externas: 0. |

Los documentos locales completos y fechados tienen una ruta de verificación literal y OCR/PDF. Las redes sociales y los formatos sin evidencia suficiente siguen pendientes. Una comuna buscada o mencionada en navegación no confirma el lugar de trabajo.

## Recuperación del histórico

Después de descargar y descomprimir un artefacto anterior:

```sh
python scripts/import_artifacts.py /ruta/al/artefacto --state state/radar.sqlite3
```

La importación deduplica y exige reverificar antes de preparar publicaciones. No confía en banderas `verified` o `published` del archivo.

## GitHub Actions preparado

El job general del workflow propuesto solo ejecuta el radar en `main`. En la rama de reparación hay un piloto acotado que necesita un commit explícito `[lab pilot]` o inicialización manual; consulta una sola comuna, hasta tres ofertas y no usa proveedores de pago. `[public sources]` ejecuta una lectura pública con respaldo separado y `[public browser]` comprueba el recolector gratuito de la app mediante su SDK. Estos marcadores no activan el productor de `main` ni los motores pagos. Los cambios de scripts, parches y pruebas quedan cubiertos por el disparador.

`[document pilot]` ejecuta el lector gratuito de hasta tres documentos, nueve páginas locales y hasta tres ofertas oficiales individuales del catálogo. El lote combinado conserva prioridad documental y un máximo de tres ofertas firmadas. `[social access]` y `[social browser]` diagnostican accesos públicos sin iniciar sesión ni publicar. El HTML social tiene un límite propio de 4 MiB; las URLs guardadas excluyen seguimiento opaco. `[lab read]` confirma IDs mediante el SDK y conserva recibos en la rama de datos sin recolectar ni publicar. La programación `17 * * * *` solo incorpora esta ruta cuando el código revisado esté en la rama predeterminada.

Entre ejecuciones se restaura un checkpoint de SQLite. Si falta o expiró, la ejecución programada se detiene para evitar reiniciar el historial. La primera inicialización manual necesita `initialize_state=true`, después de revisar y respaldar los artefactos; importa el último artefacto de candidatos disponible.

Los artefactos siguen teniendo 7 días de retención. **Esto no es una base de datos durable ni un respaldo permanente**: hace falta definir esa persistencia antes de depender del radar en operación.

El piloto ya creó snapshots verificados de SQLite en `radar-state-laboratorio` y una segunda ejecución restauró y continuó el histórico: 190 candidatos y 2.750 observaciones conservados. El cron del laboratorio recibe los lotes firmados de esa rama; no se añade una ruta pública de escritura ni se cambian claves. Los artefactos temporales del job general y este respaldo del laboratorio son mecanismos distintos; producción todavía requiere revisión.

Apify mantiene bloqueado el inicio de Actors. Con un token existente solo se comprueban la conexión y resultados de ejecuciones previas; no se cambian credenciales.

La revisión de fuentes locales, afiches y PDF está documentada en [fuentes-locales-y-afiches-2026-10-12.md](docs/fuentes-locales-y-afiches-2026-10-12.md). Distingue la reparación aplicada en la app de la cobertura y publicación automática local aún pendientes.
