# Despliegue y envío documental real

La app del usuario es https://trabajo-cerca-laboratorio-3ojgro.v2.appdeploy.ai/.
El parche del consumidor quedó aplicado en AppDeploy, versión 1792284993128.
La versión 1792288685274 autoriza también la rama independiente revisada
`repair/mulchen-captura-2026-10-17` con las mismas comprobaciones OIDC de
propietario, repositorio, rama, workflow y hash del lote. Ambos despliegues
terminaron `ready`, sin errores de frontend o backend. El validador conserva
dos advertencias de inspección de iconos PWA existentes; no afectan al radar.

Pruebas locales: 181 pruebas Python y 17 archivos de pruebas Node aprobados.
Las nuevas pruebas impiden reutilizar un PDF cambiado, metadatos modificados,
un concurso cerrado, objetos OCR incompletos o corruptos, robots restrictivos
y una firma desde otra rama, workflow o propietario.

El envío es explícito: solo el marcador `[reviewed document handoff]` en un
push de esta rama activa el job gratuito del repositorio público. No se ha
añadido una ejecución periódica ni se ha fusionado `main`.

La transferencia conserva la captura y revisión originales, incluyendo sus
fechas y los 33 resultados OCR. El runner vuelve a consultar robots y la
página oficial y descarga el PDF oficial; exige el SHA-256 exacto revisado.
No renueva fechas de evidencia ni sustituye una revisión vencida. Conservará
el PDF original y el estado en `radar-reviewed-document-state`, separado del
archivo anterior casi lleno. Restaura todo el historial de publicaciones
desde `radar-state-laboratorio` antes de añadir las tres unidades y firmar.

Una revalidación pública real a las 22:57 del 17 de octubre (Chile) confirmó
el PDF sin cambios, 37 objetos restaurados y tres cargos elegibles. El cierre
es el 2 de noviembre de 2026 a las 14:00, con recepción presencial en
Balmaceda 424, Traiguén. Estos datos proceden de las bases, no de la captura.

La publicación quedó confirmada en la app a las 23:05 del 17 de octubre,
hora de Chile. La ejecución 39088489568 terminó correctamente y una lectura
independiente del navegador confirmó el mismo lote y los tres IDs en el
feed completo 63466eef-90bb-4d2b-b898-694d498d2c60:

| Cargo | ID publicado |
| --- | --- |
| Químico Farmacéutico (A) | de9067f5-59f2-4e0c-ba02-fc9584debe0f |
| Ingeniero(a) en Prevención de Riesgos | 8b75b282-d838-45bc-9309-d10874aae023 |
| Nutricionista | 3c875b30-eec8-4d2a-9410-797e9ad37c07 |

Los recibos también quedaron respaldados en el commit de datos
adf8f570bcfe7986ffb7e0588009e47e6fb9145e. El historial restaurado conserva
365 candidatos, 3.220 observaciones, 35 intentos y los seis recibos anteriores;
ahora suma tres unidades documentales y nueve recibos. La comparación de filas
confirma que los registros anteriores siguen presentes, sin borrados.

Ejecución: https://github.com/mrvvergara-afk/Trabajo-Cerca-/actions/runs/39088489568.
Evidencia permanente: docs/evidence/despliegue-documental-2026-10-17.json.

El piloto demuestra lectura del PDF escaneado, separación de cargos, envío
firmado, persistencia y publicación visible. Facebook e Instagram y el
descubrimiento de otras fuentes siguen pendientes. Tampoco demuestra todavía
una operación diaria autónoma: el controlador existente oculta evidencia
externa de más de 24 horas. Estos cargos necesitan una nueva comprobación
real antes de las 20:05 del 18 de octubre para conservar visibilidad después
de esa hora; la fecha límite de postulación sigue siendo el 2 de noviembre.
No se cambió esa política ni se inventaron fechas para prolongar el resultado.
