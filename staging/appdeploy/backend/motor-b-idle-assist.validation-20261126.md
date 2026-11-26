# Validación B/C — 2026-11-26

Node v22.16.0, `node --test motor-b-idle-assist.test.mjs`. SDK simulado; sin llamadas a producción. Código fuente copiado desde GitHub y verificado por git hash-object: 2acb23146a71ee679ceea98001ecd499ca1d85ff. Hash local de pruebas: 4f823d8266170440ba8033ef52ced0d74ea7f40e. Resultado TAP: 5 tests, 5 pass, 0 fail, 0 skipped, 236.407061 ms.

Casos aprobados: primeros dos fallan y siguientes progresan; máximo seis intentos; entradas ya en cola cuentan para límite dos; PDF pendiente o entrada desconocida impide asistencia; exclusión concurrente simulada. La primera prueba también confirma persistencia del pendiente y reintentos diferidos.

NO-GO producción: falta SDK real, conciliación documentos A/B, pruebas integrales del pipeline, publicación visible y respaldo completo. No se modificó AppDeploy. El entorno local no pudo resolver github.com; se recuperó código mediante conector y se reprodujo localmente. Node informó advertencia experimental de stripTypeScriptTypes.
