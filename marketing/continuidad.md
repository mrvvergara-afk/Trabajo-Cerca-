# Continuidad del gestor publicitario

Acuerdo: `98a2131f41478f7eef04cf503dfe598d50374e42`.
Base GitHub: `7a745d2cbfd382f59819369eeda5d1868e75f8dd`.
Laboratorio: `trabajo-cerca-lab-aislado-xirg9w`, versión inicial `1795554885123`.
Oficial: `trabajo-cerca-laboratorio-3ojgro`, versión observada `1795664276412`.

- Banco inicial: 12 escenas ilustrativas del proyecto y 24 derivados de nombre
  SHA-256. WebP para el carrusel (840 × 560), JPEG para redes (840 × 840).
  El mayor derivado pesa 191.397 bytes. El catálogo conserva origen,
  derechos editoriales, hash del original, objetivos, territorios y temporadas.
- Selector editorial semanal en `shared/house-autonomy.ts`. Usa el calendario
  de Chile y los seis objetivos existentes. Los originales proceden del banco
  gráfico propio y de imágenes ilustrativas generadas para Trabajo Cerca.
- Facebook e Instagram vinculados a Metricool marca `7187503`. La clave API no
  está configurada en AppDeploy. El conector autorizado funciona en esta sesión.
- El cron oficial tiene siete tareas. Se preserva y el laboratorio se modifica
  mediante diffs acotados al gestor publicitario.

Próxima acción: probar la publicación del manifiesto, la reversión y la
protección de los anuncios comerciales en AppDeploy.

## Manifiesto y administración implementados

- `backend/house-autonomy.ts` valida, replica en almacenamiento institucional,
  publica el manifiesto y guarda una versión anterior y un trabajo de respaldo
  en una transacción. Verifica respaldos GitHub con espera creciente.
- `src/house-autonomy.tsx` carga una edición válida y muestra estado y métricas
  en Campañas propias. La selección comercial usa sus rutas y datos existentes.
- `backend/house-metricool.ts` y `marketing/seal-metricool.mjs` permiten al
  conector Metricool entregar métricas cifradas con una clave propia de cada
  aplicación. En el laboratorio la publicación orgánica queda inhabilitada.
- Se consultó Metricool: para la ventana del 1 al 26 de noviembre, su conector
  devolvió una fila de Instagram y ninguna de Facebook para las métricas
  solicitadas. La falta de filas se representa como dato ausente.

Siguiente acción: verificar tipos, desplegar un paquete incremental al
laboratorio, comprobar sus APIs y el carrusel y archivar el primer manifiesto
real. La autorización de producción depende de la validación completa.
