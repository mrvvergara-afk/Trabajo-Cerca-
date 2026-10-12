# Parche preparado para AppDeploy, sin desplegar

App accesible auditada: `trabajo-cerca-laboratorio-3ojgro`. Snapshot leído: `1791755107051`.

El backend de esta app no está versionado en el repositorio original. Se entrega un parche sobre ese snapshot; no se sustituye ni se publica su backend durante esta auditoría.

- [radar-repair.json](radar-repair.json): anclas `from`/`to`, versión base y hash SHA-256 para revisar un cambio incremental.
- [radar-repair.patch](radar-repair.patch): diff convencional para revisar o aplicar a una copia local.
- [Pruebas con DB y transporte simulados](../../tests/appdeploy-repair.test.mjs).

## Correcciones preparadas

1. El enriquecimiento guarda la fecha del intento y prioriza candidatos todavía no intentados. Avanza una página acotada por cron mediante un cursor persistido y vuelve a otras páginas en siguientes ejecuciones.
2. La verificación trabaja una página por cron y guarda su cursor. Conserva los lotes actuales; no aumenta llamadas ni habilita proveedores.
3. `db.add` devuelve un ID o `null` **por registro**. Solo se cierra el candidato que obtuvo un ID real. Se guarda ese ID; una inserción parcial queda visible como fallo.
4. `db.update` devuelve resultados booleanos por registro. Los fallos de escritura no se cuentan como verificaciones publicables.
5. Si el inventario tiene otra página, la reconstrucción del feed se detiene antes de escribir. Conserva el feed existente en vez de reemplazarlo por un subconjunto o un inventario vacío.

## Límite del parche

La protección del feed **no implementa todavía** un snapshot completo de más de 200 registros. Para ese volumen se necesita una reconstrucción paginada por checkpoints, con una generación separada que se promueva solo al terminar. El parche detendrá esa reconstrucción hasta contar con ese mecanismo.

La deduplicación global también requiere un índice de identidad/canonización y recuperación de escrituras parciales: la lista de ofertas conocidas todavía está acotada a una página. No se debe tratar el parche como una ingesta transaccional terminada.

La política actual de verificación de la app conserva sus fallbacks de evidencia social/indexada y lectura con IA. Este parche no los ejecuta ni valida; requieren revisión de ubicación real, vigencia y consumo antes de una activación.

## Validación y aplicación posterior a revisión

Se probaron las funciones originales y propuestas con datos ficticios, incluyendo inserciones parciales, fallos de escritura, rotación, paginación y retención del feed. No se compiló el proyecto completo con los tipos inyectados por AppDeploy ni se probó una publicación real.

Después de la revisión:

1. Volver a leer el snapshot remoto y comprobar la versión, el hash y que cada ancla coincide exactamente una vez.
2. Aplicar el parche a una copia local o un entorno de validación autorizado. Los campos de metadatos del JSON no son una petición de despliegue.
3. Ejecutar la compilación de AppDeploy y reconciliar sus pruebas existentes.
4. Probar el flujo con almacenamiento aislado y observar IDs escritos, verificación y feed. Confirmar que un fallo conserva ofertas históricas.

No aplicar este JSON ni publicar el parche directamente sobre una versión que cambió desde la auditoría.
