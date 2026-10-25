# Prueba local de recuperación — 21 octubre 2026 (Chile)

Se implementa una prueba de recuperación desde .tcbackup en Administración, ejecutada íntegramente en el navegador. El archivo y la contraseña no se envían al servidor. El visitante anónimo no recibe el componente de archivos del usuario; el acceso al panel sigue validado por el servidor.

El verificador de bloques admite un consumidor local. La herramienta reconstruye cada registro completo y cada archivo en una base IndexedDB de nombre aleatorio tc-restore-rehearsal-<UUID>, separada de los almacenes existentes. Cada payload contiene su tabla lógica y todos sus campos originales; se cifra con AES-GCM y una clave nueva no exportable que existe solo en memoria. Los IDs y contactos no se escriben en claro en IndexedDB. Se vuelve a leer cada elemento en lotes de 50, se descifra y se compara por SHA-256 con el payload de origen; se verifican además cantidades y manifiesto. La base temporal se elimina al terminar o fallar. Un fallo de limpieza impide informar éxito. Un cierre abrupto puede dejar ciphertext sin su clave efímera, no una base en claro.

Límites: 60 MB de archivo de entrada, 50 MB de payloads reconstruidos y 50000 elementos; el sobre cifrado mantiene sus propios límites. El informe descargable contiene totales, hash del archivo cifrado, comparación y limpieza, sin valores privados. Mantiene platformRestoreTested=false y productionWrites=0.

Se añade una ruta de diagnóstico visual ?restore-proof=1#operacion con únicamente datos ficticios locales para comprobar IndexedDB en navegador. No abre ni descifra la copia del titular, no usa APIs para restaurar ni requiere credenciales.

## Evidencia y límites del respaldo real
El titular aportó un archivo cifrado de 22578220 bytes (SHA-256 dbc7f605ac8074c073855377026c46f3a77b91b1405789ed61fca767c68f7186) y mostró validación local de 68 tablas, 4666 registros y cero archivos. El agente solo comprobó su estructura externa; no recibió contraseña ni descifró esos datos. La prueba local de recuperación del archivo real queda pendiente de ejecución por el titular.

Esta implementación NO restaura ni acredita el funcionamiento de AppDeploy en otra instancia. No certifica catálogo total de tablas, usuarios/secretos de plataforma, metadatos originales de storage ni contenido ausente de la copia. Cero archivos en el manifiesto no confirma que el almacenamiento de origen esté vacío. No se verifican todas las relaciones de negocio ni se afirma cierre integral de A08. Main, datos vivos, históricos, credenciales, permisos y crons permanecen fuera del cambio.

## Pruebas
Seis casos nuevos: reconstrucción/comparación/limpieza, cifrado del almacén temporal, datos faltantes/corruptos, contraseña errónea/otra app/manifiesto inconsistente, cancelación y fallo de eliminación. El resultado de navegador usa un fixture de dos tablas lógicas, dos registros y un archivo; no debe contarse como restauración de los 4666 registros reales.

## Uso
Administración → verificar acceso → ingresar contraseña del respaldo arriba → Prueba de recuperación local → seleccionar .tcbackup → Probar recuperación local → Descargar informe de prueba. Compartir únicamente ese informe si se desea revisar el resultado; no se necesita enviar contraseña ni valores privados.
