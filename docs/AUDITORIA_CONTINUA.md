# Trabajo Cerca — auditoría continua de bajo costo
Fecha inicial: 2026-11-24. Línea base reportada: laboratorio aislado 1795551497165, commit fe831afadef1851211b244d95104372b442a6439. NO-GO. No equivale a certificación de producción.
## Política
Costo incremental objetivo $0. Sin nuevos cron, bases de datos, servicios, APIs pagadas ni despliegues exclusivos de auditoría. Reutilizar telemetría y pruebas existentes; comprobar cuotas antes de agregar ejecución. No almacenar logs completos ni secretos. Mantener un registro compacto y usar historial Git como bitácora.
## Registro maestro inicial
| ID | Control | Estado inicial reportado | Criterio de cierre |
|---|---|---|---|
| OPE-01 | A y D | 18 y 28 altas visibles en laboratorio | Repetir publicación real sin duplicados |
| OPE-02 | Latencia prioritaria | 7/17 de A sobre 15 min | >=95% dentro de 15 min, muestra representativa |
| OPE-03 | B documental | OCR de control aprobado | Publicación real desde documento |
| OPE-04 | C | 5 DOCX bloqueados, 3 ambiguos | Lectura y resolución verificadas |
| OPE-05 | ChatGPT | Importación duplicada | Generación autónoma e importación comprobadas |
| OPE-06 | Gemini | missing_github_read_token | Importación efectiva con permiso mínimo |
| OPE-07 | ATS y alertas | Pendiente de conciliación | Fuentes reales verificadas, alertas solo descubrimiento |
| TEC-01 | Carga | 13 respuestas 200, P95 5.711 s con 8 lectores | Prueba representativa y umbral acordado |
| TEC-02 | Migración | Pendiente | Conservar vigentes, justificar bajas, cero duplicados |
| SEG-01 | Seguridad y privacidad | No reevaluada | Accesos, IDOR, CSP, límites y privacidad probados |
| SEG-02 | Recuperación | Reversión de código reportada | Restauración integral probada |
| UX-01 | Web/PWA | No reevaluada | Navegación móvil, carga, formularios y publicidad sin regresiones |
| ADM-01 | Panel | Acceso restringido en ensayo | Sesión autorizada y conciliación de seis motores |
| COM-01 | Publicidad y redes | Pendiente de revisión | Creatividades, segmentación y campaña aprobadas sin gasto no autorizado |
## Protocolo de cada despliegue
Antes: registrar entorno, commit, snapshot anterior, cambios, controles afectados, impacto de costo, pruebas selectivas y plan de reversión. Reutilizar resultados vigentes de controles no afectados con justificación; marcar los demás pendientes. No aprobar producción con bloqueos críticos o evidencia ausente.
Después: registrar snapshot activo, resultado de pruebas, evidencia operativa, regresiones y decisión GO/NO-GO. Compilación no equivale a éxito. Si falla, revertir según plan y reabrir hallazgo. Consolidar cambios en un despliegue por ciclo.
## Formato de actualización
Fecha UTC | entorno | commit | snapshot | ID control | estado (pendiente/parcial/aprobado/fallido/bloqueado) | evidencia | acción siguiente | impacto de costo.
Mantener solo estado actual y referencias a evidencia; Git conserva historial. No inventar métricas ni porcentajes.
## Pendientes de línea base
Recuperar informes originales DeepSeek/Gemini/Codex, conciliar hallazgos sin duplicarlos, verificar versiones activas de ambos entornos y reevaluar controles afectados. Los estados iniciales son reportados, no pruebas independientes. No activar automatización adicional hasta justificar costo.

## Revisión incremental 2026-11-24, registros hasta 21:02 UTC
- Oficial trabajo-cerca-laboratorio-3ojgro: ready, snapshot 1795487203524, siete cron activos con último estado success. El log de verificación 20:50 UTC reporta 287 ofertas verificadas, tres prioritarios procesados, cero verificados y tres retenidos. No equivale a lectura independiente del catálogo.
- Laboratorio conocido trabajo-cerca-lab-aislado-xirg9w: ready, snapshot 1795370984155, solo cron de telemetría. No coincide con snapshot 1795551497165 del informe de 46 altas. Identificar app_id exacto antes de conciliar o desplegar; no sobrescribir ninguno.
- OPE-02 parcial: tres retenidos; adminQueuedSeen=1, adminProcessed=0. Revisar antigüedad y causas, sin inferir latencia de este ciclo.
- OPE-03/04 parcial: B/C 20:42 UTC, dos HTML revisados, cero verificados, motivos worksite_missing_or_multiple y ambiguous_jobposting; 25 documentos completados acumulados, sin prueba de alta documental.
- OPE-05 bloqueado: puente oficial 20:50 UTC, último lote 18 nov, 137 h de antigüedad. D: 31 lotes procesados, dos en cuarentena, productor 175 fuentes consultadas/108 accesibles.
- OPE-08 nuevo: Trabajando targeted 21:02 UTC, dos sitemaps exceden presupuesto de bytes, cero fichas y altas. Cierre: lectura incremental acotada y publicación real comprobada sin aumentar presupuesto injustificadamente.
- ADM-01 parcial: laboratorio conocido 20:15 UTC, A/B/C/Gemini sin reporte, ChatGPT stale, D recent, historyComplete=false.
- TEC-02 bloqueado por identidad de entorno; SEG-01/02, UX-01 y COM-01 no reevaluados en este ciclo. OPE-06/07 mantienen estado previo reportado.
- Decisión NO-GO. Solo lectura de logs y actualización documental; cero despliegues, cron o servicios nuevos. Siguiente: identificar laboratorio del informe, conciliar código, verificar seguridad/migración y revisar UX y administración sin repetir pruebas innecesarias.

## Conciliación de identidad — 24 noviembre, registros hasta 21:10 UTC
Inventario AppDeploy confirma QA trabajo-cerca-qa-sdk-aislado-lykn7b snapshot 1795551497165; identidad resuelta, no migración aún. Seis cron habilitados pese a descripción de cron detenido; laboratorio anterior xirg9w mantiene uno. Oficial mantiene siete. TEC-03 nuevo: revisar ejecución redundante y costo, no reactivar ni detener entornos sin identificar función y preservar evidencia. QA reporta 47 verificadas, no conteo independiente; verificación cada cinco minutos, ChatGPT lote 24 nov edad 0 h frente a 137 h oficial. D registra dos lotes bloqueados y nueve confirmaciones pendientes. Indeed directo sigue bloqueado en colector A de QA. TEC-02 sigue pendiente de conciliación y migración. NO-GO. Sin despliegue ni cambios de cron.
