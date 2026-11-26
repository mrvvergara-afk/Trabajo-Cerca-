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

## Evidencia inicial del laboratorio

- AppDeploy guardó y activó la versión `1795701015578`. La API real publicó
  seis diapositivas en el manifiesto `9983f5b5f57098ae4902ac4933f890e633ed8a753741578cf5e10e88b56029c2`.
  Primera carga: 12,15 s. La visita directa a un WebP desde la API entregó
  116.518 bytes, 840 × 560 y la huella esperada.
- `marketing/archive/` conserva el manifiesto obtenido de la cola real.
  `marketing/metricool/lab.json` contiene métricas de la marca cifradas con
  la clave pública comprobada del laboratorio.
- La consulta administrativa anónima devolvió HTTP 401. Detectada y corregida
  una diferencia entre el dominio web y el dominio de la API para imágenes.
- `node --test tests/house-autonomy.test.mjs`: 5 comprobaciones con un
  adaptador local del SDK. Incluyen concurrencia, respaldo duplicado,
  catálogo defectuoso, reversión y ausencia de escrituras comerciales.

Siguiente acción: confirmar las imágenes y los tamaños de pantalla en
Chromium sobre la versión corregida, completar el consumidor de la cola y
verificar el respaldo previo a un eventual despliegue oficial.

## Validación y punto de continuidad del 26 de noviembre de 2026

- Laboratorio activo en AppDeploy `1795701319580`. Sirvió seis WebP reales
  (470.320 bytes en total) con las huellas esperadas. Cuatro lecturas
  concurrentes devolvieron la misma revisión. Las rutas administrativas
  rechazaron lecturas y restauraciones anónimas con HTTP 401.
- Chromium comprobó el carrusel en 320, 360, 390, 430 y 1440 px, con seis
  controles y decodificación de imagen. Pasaron el respaldo visual con
  conexión lenta e imagen bloqueada y la conservación del espacio de
  un anuncio comercial mediante inventario simulado. Pasaron siete pruebas
  locales del banco, concurrencia, persistencia, reversión y cifrado.
- Reversión real ensayada en AppDeploy: se aplicó la versión anterior del
  laboratorio `1795554885123`, cuya ruta institucional volvió a HTTP 404.
  Al reaplicar `1795701319580` reaparecieron las seis diapositivas con
  el mismo hash de manifiesto. El ensayo cubrió el despliegue del laboratorio.
- El primer ciclo operativo verificó el respaldo por hash y actualizó y
  releyó las métricas cifradas del 13 al 26 de noviembre. Evidencia GitHub
  `0d44aa4cac00c9c2475d7b6e803716a43757539d`. La programación en redes queda
  condicionada a la activación del destino oficial.
- `marketing/produccion-appdeploy.json` contiene el paquete incremental
  para la versión oficial `1795664276412`. Los marcadores se cotejaron
  con su código y el paquete omite cambios al cron de los motores.

Pendiente: obtener y verificar el respaldo consistente de la aplicación
oficial en la consola de AppDeploy, que exige una sesión de propietario.
El historial conserva `1795664276412` como punto de reversión de código.
Con el respaldo comprobado, aplicar el paquete único y verificar el panel
administrativo y el primer ciclo orgánico real de Facebook e Instagram.

## Separación de entornos

- `main` en `496c1105f3bc3cb80abaed7c282cfa82943ab68f`: GitHub Actions y el monitor de disponibilidad excluyen el laboratorio congelado. Pasa el conjunto de 23 pruebas de disponibilidad y promoción.
- Retiro, versión congelada y condición de respaldo: [Entornos y retiro](entornos-y-retiro.md).
- Paquete incremental oficial para `1795664276412`: [produccion-appdeploy.json](produccion-appdeploy.json). La vista institucional oficial sigue pendiente del respaldo de plataforma.
