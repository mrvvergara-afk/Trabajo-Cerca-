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

## Corrección TEC-03 — 24 noviembre
Congelación autorizada: únicamente cron.json=[] en xirg9w (snapshot nuevo 1795554885123) y lykn7b (1795554937385). Ambos ready, validación true, crons=null. Oficial 3ojgro permanece ready en 1795487203524 con siete cron activos y últimos estados success. Eliminadas 563 ejecuciones programadas/día (6+48+288+96+96+24+5). Dos despliegues de mantenimiento necesarios; costo monetario no medido. Sin borrado de datos ni cambios de lógica. No afirmar costo total cero ni ausencia de invocaciones manuales. No reactivar cron de laboratorio sin justificación. TEC-03 aprobado para ausencia de cron; verificar cuotas y costos residuales por separado. Conciliación, seguridad y migración pendientes; NO-GO.

## Conciliación selectiva de código — 24 noviembre
Inventario backend oficial 1795487203524 vs QA congelado 1795554937385. Inspección directa: chatgpt-handoff-config.ts fija ref bb3b62ab693f4c13a5a269953afd10088146bc5b y automation/lab/chatgpt_ready/; excluir configuración de ensayo y adaptar al productor oficial. lab-targeted-discovery.ts ejecuta ficha Angol específica y escribe tabla de prueba; excluir. feed-reconciliation-config.ts baseline undefined; no asumir migración segura. rescue-work-policy.ts reserva cupos por carril para frescos antes de rechecks; candidato sujeto a pruebas de integración. sitemap-window.ts usa SAX incremental, hash de prefijo y tope 52.428.800 bytes; evaluar costo de relectura y dependencia saxes antes de integrar. QA incorpora OCR español empaquetado en 27 módulos de datos; medir tamaño y costo de ejecución antes de migrar. No copiar index.ts completo ni cron de QA. No se ha ejecutado prueba nueva ni desplegado. TEC-02 sigue pendiente; NO-GO.

## OPE-02 corrección 24 noviembre
Oficial 3ojgro: selección de rescate prioriza administración, luego frescos por carril, luego reintentos; conserva límite y cron. Primer intento 1795557166147 falló TS2339, corregido con tipo inferido de pendingCandidates. Snapshot 1795557176802 ready, validación true, siete cron. Prueba aislada de política base 420 combinaciones, no prueba integral de variante administrativa. Postdeploy dos logs PUBLIC_FEED_DEGRADED manifest_building visible=0; recuperación y publicación real aún no demostradas. No aprobar cierre. Trabajando incremental pendiente de dependencias y compatibilidad de recibos. NO-GO. Reversión disponible al snapshot 1795487203524 si degradación persiste.

## Ciclo incremental 24 noviembre (Chile)
OPE-08: snapshot oficial 1795566932357 ready, integración lector SAX incremental, cursor, límite por ventana, pausa 429, dependencia saxes 6.0.0. No evidencia aún de publicación real. OPE-05: índice main cuatro lotes hasta 18 noviembre; QA un lote 24 noviembre en ruta experimental. Automatización existente 6afaec106c688191bd3d2f588ab788da actualizada con escritura explícita main, lectura posterior SHA, recuperación y heartbeat; frecuencia intacta. No lote nuevo demostrado. OPE-03/04: snapshot 1795570013598 ready validación true, siete cron; fast-bc-pipeline conserva resultados parciales, distingue métricas desconocidas, no convierte retry ni falta de texto en descarte automático, condición runId cuando existe. No se migró OCR empaquetado ni lector DOCX ni se recuperaron cinco documentos. Último ciclo observado B cero documentos, C 32 encontrados/31 ya revisados/1 fuera, cero comprobados. No demuestra nueva publicación. Feed antes de cambios reportaba 287 y rebuilding=false; después del último despliegue manifest_building visible=0, recuperación pendiente. Reversión al snapshot previo 1795566932357 si procede. Sin cron nuevo ni reactivación QA; costo efectivo no medido. NO-GO hasta pruebas reales y seguridad.
