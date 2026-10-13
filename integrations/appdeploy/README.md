# Reparaciones de AppDeploy en el laboratorio

Estado actual de la app indicada por el usuario: versión **`1791924889565`** aplicada y `ready`. La [conexión de documentos](../../docs/conexion-documentos-2026-10-13.md) quedó comprobada en cuatro ciclos reales, con OCR completo dentro de sus límites y respaldo durable. Pasaron 242 pruebas en GitHub. No se obtuvo una oferta documental elegible; se conservaron el lote y los IDs anteriores. `main` sigue sin integrar.

La [continuación regional anterior](../../docs/continuacion-fuentes-regionales-2026-10-13.md) confirmó una oferta nueva de BNE en Negrete y dos del piloto previo. Su [evidencia por ID](regional-source-observation-2026-10-13.json) y [parches regionales](regional-source-repair.json) corresponden a esa comprobación histórica.

El respaldo del piloto anterior conserva dos recibos, 190 candidatos y 2.750 observaciones. Su [informe del 12 de octubre](../../docs/resultado-publicacion-laboratorio-2026-10-12.md), [evidencia](publication-confirmation-2026-10-12.json) y [arreglo de repetición](backup-replay-repair.json) describen ese momento, no el conteo actual de la app.

Los paquetes y secciones siguientes describen las etapas históricas y sus versiones. El calendario actual del escritor es cada 15 minutos; sus tareas con proveedores conservan solo los siete turnos originales.

El primer parche preparado abajo se aplicó posteriormente en la versión `1791772015605`; véase el [registro de aplicación](../../docs/aplicacion-radar-laboratorio-2026-10-11.md).

La continuación se aplicó en la versión **`1791805194792`** y completa la reconstrucción del feed por checkpoints. Entrega:

- [public-feed.ts](public-feed.ts): módulo nuevo del backend, instalado como `backend/public-feed.ts`.
- [public-feed-repair.json](public-feed-repair.json): cambios incrementales, snapshot base y archivos de la entrega.
- [public-feed-repair.patch](public-feed-repair.patch): cambios de `backend/index.ts`.
- [Pruebas del feed](../../tests/appdeploy-public-feed.test.mjs): 28 casos locales; no invocan AppDeploy ni proveedores.
- [Informe de continuación](../../docs/continuacion-feed-laboratorio-2026-10-12.md): resultados, alcance y pendientes.

El calendario permanece igual. La migración inicial avanza una página de hasta 40 registros por ciclo del cron existente `verify-publish`; después procesa cambios por ID. Conserva el feed visible ante fallos.

La ingesta del laboratorio se aplicó posteriormente en `1791813502255`: [radar-ingestion.ts](radar-ingestion.ts), [ingestion-repair.json](ingestion-repair.json) y [pruebas](../../tests/appdeploy-ingestion.test.mjs). El receptor lee lotes firmados desde una rama de datos de GitHub; los recibos solo cuentan publicaciones confirmadas en el feed. El [informe de integración y respaldo](../../docs/integracion-y-respaldo-laboratorio-2026-10-12.md) distingue ese código aplicado del piloto real todavía por comprobar.

El texto siguiente describe la preparación histórica del primer parche; su límite de 200 registros se aborda con la continuación anterior.

## Preparación original

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
