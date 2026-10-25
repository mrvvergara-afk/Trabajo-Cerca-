# Trabajo Cerca — Verificación de los tres turnos del radar diario (25/10/2026)

## Estado del sistema

- **Programación permanente**: GitHub Actions `Trabajo Cerca | Radar diario gratuito`, en `main`, a las **06:17, 12:17 y 19:17 hora de Santiago**.
- **Integración**: consulta 40 enlaces del rastreo independiente, 24 fuentes públicas, censo de 25 perfiles sociales, todas las 14 localidades (incluye Quilaco y Mininco).
- **Prueba real completa**: ejecución [40206060799](https://github.com/mrvvergara-afk/Trabajo-Cerca-/actions/runs/40206060799), tres jobs (lotes 0, 1 y 2), **todos exitosos**. PR de QA #4 cerrado sin fusionar.
- **AppDeploy**: `trabajo-cerca-laboratorio-3ojgro` sigue `ready`, snapshot `1792938878483`, siete crons habilitados; no hubo despliegue ni cambios de datos por el radar GitHub.

## Hallazgos reales del primer ciclo

| Comprobación | Valor |
|---|---:|
| Fuentes/avisos directos previstos | 64 |
| Fuentes/avisos directos procesados entre los tres lotes | 64 |
| Inventario de Trabajo Cerca leído completamente | 71 registros |
| Observaciones de revisión en los tres lotes | 12 |
| Enlaces únicos de esas observaciones | **10** |
| Coincidencias por URL con catálogo | **11** |
| Una fecha anterior detectada y descartada | 1 |
| Índices de fuentes leídos | 20 |
| Índices bloqueados por permiso de robots no confirmado | 3 |
| Índice con error de conexión | 1 |
| Sin evidencia suficiente para elevar a candidato | 28 |
| Redes sociales rastreadas automáticamente | **0** |
| Nuevas publicaciones en el feed realizadas por este motor | **0** |
| API o proveedor externo pagado | **$0** |

## Diez enlaces únicos que siguen en revisión

- Angol: Operario producción (TC-001), TENS operativos (TC-002), Auditor de calidad e inocuidad (TC-003).
- Traiguén / sectores reportados: mantención de huerto (TC-022), venta en terreno zona Victoria-Angol-Traiguén (TC-025), docentes colegio Louis Pasteur (TC-023), director de liceo/escuela (TC-024).
- Descubiertos desde prensa: convocatoria Visual Merchandising en Traiguén (**NO nueva por republicación; su original BNE es de septiembre**), PDF de edición Malleco 7 (**lectura parcial, sin puesto individual acreditado**), secretaria administrativa-contable en el sitio municipal de Mulchén (**fecha original pendiente**).

**No son 10 ofertas aprobadas**. En todos los casos faltan una o varias pruebas de fecha original del empleador, municipio real de trabajo, postulación abierta y ausencia de equivalencias por título/empresa.

## Estados y seguridad

El lector distingue `revision_obligatoria`, `duplicado_confirmado_url`, `descartado_por_fecha`, `sin_evidencia_suficiente`, errores por permisos de robots y fallos de conexión. Los 25 perfiles sociales quedan identificados **uno a uno** como `no_consultada_sin_acceso_publico_autorizado`. No se evade CAPTCHA, login o acceso privado.

Se conservan los 12 casos pendientes/excluidos del ZIP original. Ninguna candidata se escribe en `radar_candidates` hasta construir y validar un importador **autenticado, idempotente y privado**. Se requieren fecha original dentro de 20 días, validez del cierre, localidad de faena y canal de postulación comprobados antes de cualquier publicación.

## Evidencia

- [Workflow permanente](https://github.com/mrvvergara-afk/Trabajo-Cerca-/actions/workflows/trabajo-cerca-radar-diario.yml).
- [Ejecución de QA de tres turnos](https://github.com/mrvvergara-afk/Trabajo-Cerca-/actions/runs/40206060799).
- Artefactos de GitHub (retención de tres días) 12602934667, 12604001147, 12603912716.
- Archivo operativo en `docs/Trabajo_Cerca_Radar_Diario_Operativo_2026-10-25.md`.

> **Pendiente:** comprobar la primera ejecución disparada exclusivamente por cron, no solo la ejecución de prueba por PR. GitHub puede atrasar ejecuciones programadas. No declarar automatización de publicación laboral: por ahora se automatizó solo lectura, extracción y revisión.
