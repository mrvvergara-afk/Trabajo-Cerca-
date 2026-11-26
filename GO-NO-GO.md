# Registro de aceptación

| ID | Estado | Evidencia / siguiente acción |
|---|---|---|
| BASE | open | Producción observada 1795726351197; difiere de v100. Conciliar contra nueva versión, no asumir main equivalente. |
| BC | partial | dd1697b: 24 pruebas y 43 adicionales registradas; revisar contrato de cola existente. |
| QA-PUB | partial | Negrete HTTP 200 y deduplicación con traspaso controlado; falta descubrimiento autónomo. |
| DR | open | Restauración de código no equivale a datos; verificar SDK y restauración integral aislada. |
| ADS | open | Punta publicitaria cambió; verificar manifiesto y dependencias contra base activa. |
| TRANSFER | open | Recibos por SHA y latencia pendientes. WAF y ausencia de vacantes no bloquean por sí solos. |
| RELEASE | open | Pruebas consolidadas, recuperación y decisión final; prohibido desplegar o fusionar main. |

No reabrir evidencia acreditada sin cambio relevante. No almacenar datos personales ni secretos. QA sin cron; producción intocable.
