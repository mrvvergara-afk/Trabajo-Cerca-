# Revalidación automática y revisión de fuentes públicas

App: https://trabajo-cerca-laboratorio-3ojgro.v2.appdeploy.ai/.
Rama independiente: repair/mulchen-captura-2026-10-17. Main sigue sin integrar.

La ejecución de terminal de la noche se interrumpió antes de desplegar esta
tanda. No se presenta esa preparación como trabajo ejecutado en segundo plano.
La revalidación se desplegó después en la versión 1792325715151; la versión
1792326173643 añade mejoras de descubrimiento y diagnóstico. El resultado del
ciclo real se comprobará por SDK, no por el estado exitoso de un cron.

## Cambios

- Un control cada doce horas, dentro del cron existente, comprueba robots,
  página primaria, fecha editorial, plazo y SHA-256 de los 14 MB del PDF
  aprobado. Solo renueva la comprobación cuando el original sigue idéntico.
- Conserva el mismo ID, URL, fecha original, primera publicación, revisión
  aprobada, plazo e instrucciones de postulación de cada uno de los tres cargos.
- Ante fallos temporales no renueva fechas. Un PDF cambiado, un cierre
  explícito o una retirada exige revisión y retira las tarjetas conservando
  los registros originales. Los fallos de base de datos se propagan.
- Las modificaciones, el recibo y el checkpoint se confirman en una sola
  transacción. Si falla el registro del feed, el siguiente ciclo recupera
  ese recibo sin duplicar las ofertas ni volver a leer la fuente.
- La recolección reparte cinco consultas de origen en tres locales y dos
  portales, con cursores separados. Antes, la cola larga de búsquedas de
  portales podía relegar los sitios municipales y medios locales.
- Reconoce PDFs municipales incrustados en iframe/data-emsrc, object y embed,
  conservando el publicador original y rechazando otros dominios y URLs inseguras.
- Los documentos con varios cargos quedan fuera de la reverificación genérica
  por URL para evitar convertir tres ofertas en una cuarta oferta duplicada.
- El panel operativo muestra última comprobación, próxima revisión y los IDs
  documentales visibles en el feed completo. Leer ese panel no ejecuta motores.

## Pruebas y ejecución

185 pruebas Python y 18 archivos de pruebas Node aprobados. Incluyen diez casos
de revalidación: antigüedad, cierre, PDF cambiado, cuota, robots, concurrencia,
resultado incierto de transacción, recuperación y conservación de los tres IDs.
También se prueba la distribución de fuentes y la recuperación de PDFs incrustados.

El job explícito `[document revalidation proof]` de la misma rama ejecuta una
consulta pública gratuita mediante el botón de la app y comprueba el cron real
mediante el SDK de frontend. Sus resultados deben distinguir candidatos, ofertas
guardadas y nuevas publicaciones. Una oferta revalidada no cuenta como nueva.

La continuidad del trabajo queda programada para tres noches en horario de
Chile. La revalidación de la app es independiente de esa tarea y sigue activa.
Se conservan exactamente los seis crons existentes, sin nuevos proveedores pagos
ni cambios de secretos. Persisten dos advertencias previas de inspección de iconos.

## Alcance pendiente

La aprobación automática actual solo cubre el documento de salud de Traiguén.
El descubrimiento puede entregar otros documentos a lectura local; no equivale
a verificar ni publicar cada PDF automáticamente. Facebook e Instagram siguen
dependiendo de acceso público real y de recuperar cada publicación y sus afiches.
Radio Mininco y otros publicadores sin canal acreditado no se inventan. No se
promete un número de ofertas nuevas antes de recuperar evidencia individual.
