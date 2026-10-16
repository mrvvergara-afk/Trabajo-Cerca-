# Antigüedad máxima de 45 días

Implementación: usar la fecha original explícita; conservar la hora de los ISO y rechazar fechas relativas, sin año o inválidas. Aplicar 45 días al verificador, a la ingesta y a la proyección pública. Las páginas existentes del feed se reproyectan de forma acotada en el escritor programado, manteniendo los registros fuente y las versiones históricas.

Preflight: leer la versión aplicada antes de generar los diffs; probar el límite exacto y el caso mayor por un milisegundo; probar la migración del feed sin eliminar registros fuente; enviar únicamente archivos cambiados a la app `trabajo-cerca-laboratorio-3ojgro`; conservar credenciales, cuotas, perfiles pagos y calendario; no ejecutar proveedores ni integrar `main`. Los cambios del verificador y la migración son internos: las pruebas de navegador existentes siguen cubriendo las lecturas y errores del listado y del panel de operaciones.
