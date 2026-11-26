# Validación de integración B/C — 26 de noviembre de 2026 (Chile)

- Base observada: `ff255261f8be2876626768137e91b21a495b0b04`. Los seis commits solicitados están en la misma rama.
- Línea base reproducida en Node 24.22.3: `node --test staging/appdeploy/backend/*.test.mjs`. Pasaron 11/11 pruebas con SDK simulado: cinco de asistencia y seis del ciclo B/C. Incluye dos primeros intentos fallidos, límites, exclusión concurrente, estado documental desconocido y fallos parciales.
- Causa encontrada: A conserva enlaces a imágenes y el lector del ciclo rápido selecciona solo PDF. Su condición de asistencia espera que desaparezca trabajo que su propio lector no puede procesar. El contrato también debe distinguir una cola sin cupos listos de una cola desconocida.
- AppDeploy oficial observada en `1795664276412` (v100), posterior a la referencia `1795575572924` (v97). Preservar la versión activa y conciliar la rama publicitaria antes de preparar el despliegue. Este control solo leyó producción.
- Indicadores a comparar en QA: entradas documentales de A, documentos entregados a B, recibos terminales, reintentos diferidos, deduplicación, antigüedad de la cola, duración y cupos de asistencia. Mantener alta visible y productividad real como métricas verificables del catálogo.
