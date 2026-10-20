# Acceso y publicación simplificada — 20 de octubre de 2026

La indicación del usuario es tratar el afiche y el texto de la misma publicación como evidencia suficiente del empleo y su fecha, y comprobar la forma de postular. No corresponde pedir una segunda acreditación de los mismos datos a la institución.

## Correcciones aplicadas

- La fecha editorial puede estar en los metadatos originales o expresamente rotulada en el texto de ese post. No se exige repetirla en la imagen. Una fecha de cierre o de captura no se convierte en fecha editorial.
- El aviso completo admite correo, teléfono, dirección presencial o enlace de postulación. La dirección debe estar junto a instrucciones para presentarse; una dirección de trabajo aislada no se interpreta como postulación.
- Si no se informa un cierre, no se inventa una fecha ni se exige un plazo explícito. Si se informa cierre, se conserva y controla. Un cierre explícito impide publicar y cierra una oferta previamente aprobada.
- Con afiche y texto ya conservados, se elimina la segunda consulta a la red social y la exigencia de releerla cada 24 horas. Si hay enlace para postular, se comprueba una vez por el lector público existente, que respeta robots y redirecciones. No se envían formularios, correos o llamadas.
- Un problema técnico al releer el destino no retira una oferta previamente aprobada ni renueva su fecha de aprobación. La admisión conserva fecha original reciente, cargo, empleador y lugar real expresados en la evidencia; no se inventan datos.
- La prueba completa descubrió una regresión anterior: la protección contra enlaces de postulación de otro cargo también rechazaba PDFs municipales. Se exceptúa únicamente la vía documental ya validada por cargo/página, cuyo destino debe coincidir exactamente con el PDF y página revisados. La protección entre cargos de portales se conserva.

AppDeploy quedó **ready en 1792493312372**, sin errores de frontend/backend/red en su diagnóstico. Persisten las dos advertencias anteriores de inspección de iconos PWA. No se modificaron credenciales, main, históricos ni horarios/cantidad de crons. No se añadieron ni ejecutaron proveedores pagos.

## Acceso a las cuentas aportadas

El diagnóstico anterior se limitaba a fallos de la herramienta web y usaba un listado antiguo. Ahora se seleccionan las cinco cuentas exactas aportadas por el usuario y se comprueba la política antes del contenido, sin sesión ni reintentos.

La prueba [39409845792](https://github.com/mrvvergara-afk/Trabajo-Cerca-/actions/runs/39409845792), a las **10:42 UTC**, recibió **HTTP 200** para `https://www.instagram.com/robots.txt`. La política contiene `User-agent: *` y `Disallow: /`. Por ello se detuvo antes de descargar los cinco perfiles: omilnacimiento, omilangol2026, omil_traiguen, munilumaco y munidetraiguen. Se hizo **una sola petición**, conservada con SHA-256 `fe84b3913976aa37e983fd44f2ace9cf62973a512ae694eb18f3cf02066602b1`. No se suplantó a los buscadores permitidos ni se cambiaron dominios para eludir la restricción.

Esto acredita un bloqueo del acceso automatizado usado por este proyecto, no ausencia de publicaciones ni lectura de las cuentas. Tampoco demuestra que todas las rutas oficiales de API de Meta estén indisponibles: no se probaron permisos ni se cambiaron credenciales. Una integración oficial necesita acceso que cubra específicamente esas cuentas y campos; no se promete que cualquier token habilite leerlas.

El respaldo durable quedó en `radar-document-reader-state`, commit `47579c04f686c174e68ed88ff2d0d6ed3c2566f1`, `history/39409845792-1/social-access-probe.json` y `objects/<sha256>`. Se conservaron las **40 referencias** del checkpoint. El colector documental general sigue sin tener permiso global para abrir dominios sociales.

## Pruebas

- **231 pruebas Python aprobadas**, incluidas cinco del acceso social y las del lector/checkpoint. Verifican que robots impida descargar contenido, un fallo de política no se repita para cada perfil y un redirect de login no sea seguido.
- **25 suites Node, 232 pruebas aprobadas** tras corregir la regresión documental. Incluyen 20 de evidencia social, nueve del verificador simplificado real, cuatro de persistencia y siete del consumidor documental.
- La primera ejecución ampliada detectó el rechazo incorrecto del PDF municipal; no se contó como aprobada. La tanda completa posterior sí pasó.
- AppDeploy validó y publicó los cuatro archivos cambiados; se conservaron los tests públicos existentes, sin sembrar ofertas ficticias. Los cambios nuevos son controles internos del recolector/receptor.

**Publicaciones sociales nuevas confirmadas en esta tanda: 0.** No se volvió a leer/OCR material agotado para producir métricas. La simplificación permite tramitar un original completo cuando se obtiene; el acceso automatizado a esos perfiles de Instagram sigue limitado por su política. Para aumentar resultados dentro del alcance actual, se pueden procesar las réplicas primarias accesibles y originales completos que lleguen por canales permitidos. El acceso automático directo a Meta requiere una vía autorizada; no se soluciona insistiendo con el navegador.

La comparación final del feed e IDs se adjuntará a la evidencia de esta revisión. No se atribuirán salidas a vencimiento sin una decisión o evidencia que lo pruebe, ni se contarán revalidaciones como avisos nuevos.
