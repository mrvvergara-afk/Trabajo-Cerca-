# AUDITORÍA — CÓDIGO VIGENTE / 29 OCT 2026

**Origen AppDeploy:** app `trabajo-cerca-laboratorio-3ojgro`, snapshot exacto `1793289174549`. Todos los archivos bajo `AppDeploy/` fueron leídos de dicho snapshot mediante la conexión oficial AppDeploy y copiados íntegros como texto; NO son extractos ni versiones reconstruidas.
**Origen GitHub C:** repositorio privado `mrvvergara-afk/radar-laboral-motor-c.`, rama por defecto `main`; archivos de código, workflow y resultados fueron consultados mediante la conexión GitHub y copiados a `MotorC_GitHub/` el 29-oct-2026. Los resultados son una captura puntual, NO resultados en tiempo real.
**Destino:** rama de auditoría separada `auditoria/codigo-vigente-2026-10-29` del repositorio `mrvvergara-afk/Trabajo-Cerca-`.
**IMPORTANTE:** la rama contiene además los archivos originales del repositorio Trabajo-Cerca- usados como punto de partida. Para la auditoría, **usar exclusivamente la carpeta `AUDITORIA_29OCT_2026/`**. Los archivos de fuera pueden pertenecer a commits antiguos y no representan el snapshot de AppDeploy.

## Qué contiene
- `AppDeploy/backend/index.ts` — Motor A, cron handlers, rutas y ensamblaje central.
- `AppDeploy/backend/motor-b-*.ts` — Motor B, auxiliar, fuentes y documentos.
- `AppDeploy/backend/motor-c-*.ts` — Motor C interno y conector externo experimental.
- `AppDeploy/backend/radar-*.ts`, `public-*.ts`, `reviewed-receiver.ts`, `offer-retention.ts` — bandeja, verificador, publicación, proyección y catálogo.
- `AppDeploy/cron.json` — programación.
- `MotorC_GitHub/src/`, `.github/workflows/rastreo.yml`, `output/` e `input/` — código y resultados del C externo.

## Restricciones de auditoría
No asumir que un candidato es una publicación real. No inferir fecha original desde fecha de captura. No considerar HTTP 200 como vigencia de una convocatoria. No atribuir a producción el estado del laboratorio. Comparar cada recomendación con las funciones y estados que existen aquí, sin inventar tablas SQL ni funciones.

## Reglas actuales del proyecto
Localidades: Angol, Collipulli, Ercilla, Renaico, Mininco, Los Sauces, Purén, Traiguén, Lumaco, Nacimiento, Negrete, Mulchén, Victoria. Quilaco no forma parte de este alcance. Fecha original de referencia: desde 2026-09-12, sujeta a vigencia comprobada. Sin corte automático de 20 días.

## Entregables solicitados a Gemini
Auditar A→auxiliar→verificador→catálogo, B→auxiliar→verificador→catálogo, C externo/interno→verificador→catálogo, y el publicador compartido. Exigir pruebas por URL e identificador, causa del primer bloqueo y confirmación de visibilidad. Separar hechos demostrados, hipótesis y simulaciones.
