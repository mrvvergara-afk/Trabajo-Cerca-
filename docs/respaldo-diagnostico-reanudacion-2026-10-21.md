# Respaldo parcial: diagnóstico y reanudación — 21 octubre 2026 (Chile)

## Evidencia y causa
El titular mostró una copia parcial. El código previo atrapaba toda excepción y mostraba un mensaje genérico, descartando cursores y el estado útil al salir de createBackup. Los registros de AppDeploy disponibles no tenían el fallo original. Por tanto, no se atribuye la interrupción concreta a cuotas, tamaño, sesión ni archivos: esa causa permanece sin confirmar hasta una nueva ejecución con diagnóstico. La causa confirmada del bloqueo de reanudación era el estado local descartado; el defecto confirmado de diagnóstico era el catch genérico.

## Cambios comprobables
Se añade backup-runner.ts como máquina de estados scope/tablas/storage/archivos/finalización. Cada paso prepara una copia del estado y se confirma solo si lectura y cifrado terminan: un error no cambia cursor, IDs ni bloques previos. La reanudación explícita conserva el avance solo en la misma instancia del panel. Pausar conserva el estado; cerrar sesión, recargar o cerrar el panel lo pierde. Una copia parcial anterior no se migra ni se presenta como completa.

La pantalla muestra etapa, tabla/progreso y código seguro. Diferencia cuota (429), sesión (401/403), tamaño (413), fuente ausente (409) e inconsistencias; solo propone reanudar fallos potencialmente temporales. Permite renovar la sesión sin salir del panel. No hay reintentos automáticos de cuotas. La contraseña queda bloqueada durante un avance para no cambiar la clave a mitad de copia. Descartar avance no borra datos de la app.

El backend devuelve códigos sanitizados y registra solo tipo de operación, nombre de tabla permitido y código de error documentado, sin filas, contactos, contraseñas, cursores ni rutas de archivos. Los errores de cuota siguen siendo 429, no éxito ni ausencia. Se mantienen límites de tamaño, la lista de tablas y los middleware SDK existentes.

## Pruebas
Cinco casos nuevos verifican cuota y reanudación desde cursor, archivo pendiente sin repetir completados, fallo de cifrado/límite sin commit parcial del checkpoint, bucles/IDs duplicados sin avance y diagnóstico sin revelar el error crudo. Los ocho casos anteriores de descarga cifrada también pasaron con el contrato de error actualizado. Estos son fallos simulados y datos sintéticos: no demuestran que la copia real del titular haya finalizado.

## Límites vigentes
A08 sigue abierto. No se ha creado desde la sesión del agente un respaldo de datos privados ni se ha restaurado AppDeploy en aislamiento. El exportador conserva sus límites, ámbito parcial conocido y lecturas rolling_non_atomic. Un archivo que supera el límite seguirá requiriendo ampliación o respaldo de plataforma; no se oculta ese caso ni se promete que reanudar lo resuelva. La restauración integral no está probada. No se cambiaron main, históricos, credenciales, permisos ni cantidad/frecuencia de crons. Cero ofertas nuevas por esta reparación.
