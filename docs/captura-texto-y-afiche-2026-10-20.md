# Cuentas OMIL: leer la publicación completa

Las capturas aportadas identifican cuentas a recorrer y ejemplos de avisos. El trabajo correcto es revisar publicaciones recientes, su texto completo, fecha original y todos los afiches del mismo post. La falta de una fecha en el afiche no prueba que falte en la publicación.

Se intentó abrir públicamente `omilnacimiento`, `omilangol2026`, `omil_traiguen`, `munilumaco` y la coautora `munidetraiguen`. La herramienta devolvió throttling o fallo de lectura en los cinco perfiles. No se declara leído su historial reciente, ni se confunde ese fallo con ausencia de ofertas. La respuesta obtenida de Facebook Lumaco fue una pantalla de bloqueo de una copia antigua; tampoco acredita su estado actual. No se intentó sesión ni otra vía para eludir restricciones.

Una copia pública de OMIL Nacimiento conserva textos y fechas de avisos de psicólogo/a y técnico mecánico publicados allí como 23-sept-2026, con plazo 25 de septiembre. Sirve como pista para encontrar originales y demuestra la utilidad del texto del post. No es confirmación primaria ni acredita la cobertura actual de la cuenta. La página municipal `/noticias/5888` contiene plazos de 2021 y se excluye de la ventana reciente. No se repitieron OCR, PDF agotados ni renderizados municipales restringidos.

## Error corregido

El recolector de imágenes guardaba el texto OCR del afiche separado del texto de la publicación. Por eso una fecha, contacto, empresa o ubicación escritos únicamente en el post podían faltar al revisar la imagen.

Ahora `socialPosterFinding` une el texto literal del post con el del afiche antes de conservar y verificar la evidencia. Exige una URL individual y coincidencia de publicación, mantiene fecha editorial original aparte de fecha de captura, y marca cualquier truncamiento. Un plazo de cierre no se convierte en fecha original. Tampoco se trasladan datos de otra publicación o de una fecha visible en el post anterior de una captura. Las publicaciones cerradas siguen sin aprobarse.

La corrección está aplicada en la app, versión ready **1792492127245**, sin errores de frontend, backend o red reportados por AppDeploy. Persisten las dos advertencias previas de iconos PWA. No se añadieron fuentes a los disparadores pagos, no se invocaron OCR ni proveedores pagos, y no se cambiaron credenciales, históricos, main o crons.

## Pruebas

- 15 pruebas de evidencia social aprobadas: incluyen datos presentes solo en caption, fecha de captura que no sustituye la editorial, mezcla de posts rechazada, truncamiento y cierre explícito.
- 4 pruebas de persistencia e hidratación aprobadas.
- 7 pruebas de integración social previa aprobadas.
- La prueba del fragmento real del recolector confirma que el hallazgo combinado conserva contacto y plazo y puede revisarse sin llamadas de red o IA.

**Nuevas publicaciones sociales confirmadas en esta revisión: 0.** La corrección evita perder datos cuando se consigue leer el original; no resuelve por sí sola el acceso a las cuentas. El registro de cuentas aportadas y los bloqueos queda en `config/user-omil-pages-2026-10-20.json` y `docs/evidence/rastreo-cuentas-omil-y-caption-2026-10-20.json`.

Fuentes consultadas:

- https://www.instagram.com/omilnacimiento/
- https://www.instagram.com/omilangol2026/
- https://www.instagram.com/omil_traiguen/
- https://www.instagram.com/munilumaco/
- https://www.instagram.com/munidetraiguen/
- https://www.govern1.com/CL/Nacimiento/102913642090515/OMIL-Municipalidad-de-Nacimiento
- https://www.nacimiento.cl/noticias/5888
