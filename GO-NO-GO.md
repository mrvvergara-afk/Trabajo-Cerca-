# Registro de aceptación

| Control | Estado | Evidencia y pendiente |
|---|---|---|
| BASE | Parcial | Producción observada en `1795744970786`. Se conciliaron archivos B/C acotados. Falta fijar el paquete integrado contra la base oficial. |
| BC | Parcial | La candidata compiló en QA, pasó 26 pruebas locales y el Motor B reanudó una cola sintética restaurada sin duplicar trabajo. |
| QA-PUB | Parcial | Negrete visible en QA con traspaso controlado. La confirmación de ChatGPT se verificó con un feed sintético paginado. Falta el flujo real completo. |
| DR | Parcial | Ensayos aislados de cifrado, restauración entre invocaciones, detección de revisiones mezcladas e identidad física aprobados. El respaldo v3 agrega siete tablas; en QA se restauraron tablas y un archivo de una revisión fijada mientras se publicó otra. Falta integrar la coordinación en los escritores de la candidata y validar la recuperación de las entidades fuera del exportador. |
| ADS | Abierto | La punta publicitaria observada está registrada en el manifiesto. Falta conciliarla con el paquete integrado. |
| TRANSFER | Parcial | SHA de Gemini contrastado con producción, último ciclo observado a las 13:13 UTC del 27/11, con cero publicaciones. Pasaron 33 pruebas locales del contrato de ChatGPT. ChatGPT conserva SHA en recibos nuevos y recupera un recibo legado, acreditado con entradas sintéticas; falta evidencia con productor real. |
| RELEASE | Pendiente | Producción sigue fuera del ensayo. Promoción condicionada a recuperación representativa y validación del flujo integrado. |

Las pruebas no reactivan el rastreo independiente ni los cron de QA. El ensayo se retiró y QA volvió a su snapshot de reposo.
