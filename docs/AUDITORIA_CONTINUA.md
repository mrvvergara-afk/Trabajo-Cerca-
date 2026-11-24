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
