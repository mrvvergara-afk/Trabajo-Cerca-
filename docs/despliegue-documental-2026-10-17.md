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

La confirmación de publicación requiere el ID de ejecución firmado, tres
recibos distintos y sus tres IDs presentes en el mismo feed completo.
Mientras no exista esa comprobación, no se declara publicación confirmada.
Facebook e Instagram y el descubrimiento de otras fuentes siguen pendientes;
esta prueba solo cubre el documento municipal revisado.
