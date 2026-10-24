# Respaldo: referencias de archivos y recuperación pendiente

Fecha UTC: 22-10-2026. Rama exclusiva: repair/mulchen-captura-2026-10-17. App: trabajo-cerca-laboratorio-3ojgro.

## Resultado real recibido

El informe local entregado por el usuario declara 68 tablas, 4666 registros, cero archivos, cero diferencias y eliminación de la base temporal cifrada. SHA-256 del archivo: dbc7f605ac8074c073855377026c46f3a77b91b1405789ed61fca767c68f7186. No se descifró su copia en el agente ni se solicitó contraseña. El informe no acredita restauración funcional de AppDeploy ni almacenamiento vacío.

## Revisión estática y corrección

Se revisaron las llamadas storage.* del snapshot 1792631384853. El exportador usa list/read; el backend también elimina evidenceImagePath en su retención existente. No se encontró storage.write en el código actual revisado. Las imágenes de portada utilizan URLs externas; los iconos forman parte del despliegue. Ninguno pertenece necesariamente a storage.list. Esto no prueba que nunca hayan existido archivos históricos.

Se incorpora Revisar archivos de esta copia. Descifra localmente y valida el archivo, clasifica campos conocidos de almacenamiento frente a medios externos/recursos del despliegue y contrasta las referencias con un listado SDK fresco. Recorre hasta 200 páginas y comprueba individualmente hasta 50 referencias ausentes del listado; el resto queda pendiente explícito. Los errores, cursores inválidos, duplicados o ciclos abortan sin declarar almacenamiento vacío. Cada comparación se refiere a dos momentos diferentes y no atribuye causas.

El receptor existente /api/admin/backup/page, ya protegido por sesión y allowlist administrativa, admite file-status: devuelve disponibilidad y tamaño, nunca contenido. No escribe ni genera enlaces públicos. El SDK no ofrece HEAD en este adaptador: la comprobación individual necesita storage.read de un objeto. No se promete que sea metadato sin lectura del objeto.

El informe descargable contiene agregados, sin contraseña, cuerpos de registros, URLs o rutas particulares. Los campos opacos/no reconocidos quedan fuera o se marcan sin clasificar: no certifica todo el almacenamiento de plataforma. No se descargan originales externos.

## Pruebas

Siete casos Node locales aprobados: clasificación sin descarga externa; paginación completa y diferencias temporales; prioridad de estado vigente en referencias compartidas; fallos/ciclos/cursores inválidos; presupuesto de 50 comprobaciones; contraseña/app incorrectas y cancelación; respuesta file-status sin contenido incluso cuando SDK devuelve contenido undefined.

El fixture de navegador existente añade un lector simulado: una referencia de archivo cerrado ausente y una imagen externa. Nunca consulta almacenamiento real ni usa datos privados. La prueba real del respaldo requiere al usuario autorizado en su navegador; no está declarada ejecutada por el agente.

## Segunda instancia y procedimiento de restauración

Se consultó el estado de cuenta y documentación oficial https://appdeploy.ai/faq y https://widget.appdeploy.ai/pricing. Las operaciones de despliegue, almacenamiento, base de datos y actividad consumen créditos compartidos. Tener suscripción/créditos no demuestra coste incremental cero para otra app. No se creó otra instancia, se compraron créditos ni se modificó facturación.

Para cerrar recuperación funcional: (1) resolver referencias ausentes del informe real; (2) acreditar aislamiento y consumo permitido de un entorno de ensayo, sin compartir secretos ni cron con la app actual; (3) inventariar y preservar código, archivos, usuarios y configuración no cubiertos; (4) importar copia en entorno vacío, conservando identidades mediante mapeo cuando SDK no permita IDs físicos; (5) contrastar conteos y hashes y probar lectura de ofertas, sesión administrativa y asociaciones de archivos; (6) verificar que no se ejecutaron motores, notificaciones ni escrituras en la app original; (7) conservar recibo de ensayo y retirar el entorno temporal solo con una política clara de conservación. Este procedimiento está preparado, no ejecutado. No existe importador de plataforma certificado.

La puerta A08 continúa abierta: recuperación local de datos aprobada por el informe del usuario, restauración integral funcional pendiente. main, históricos, credenciales y cron se conservaron.
