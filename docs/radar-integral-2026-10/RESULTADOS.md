# Trabajo Cerca — reparación integral del Radar

Fecha: 28 de octubre de 2026 (UTC). **Resultado operativo pendiente: incremento público comprobado 0. No se desplegó ni fusionó.**

Código probado: `272b85e97af068d92e375487d63431e789c5e22e`. [PR #8, borrador](https://github.com/mrvvergara-afk/Trabajo-Cerca-/pull/8), rama `repair/radar-integral-2026-10-28`. El PR #7 de Stitch permanece separado.

## A. Causa raíz y base segura

La fuente publicada es AppDeploy **v99 / 1793152775717**, del 28-10-2026 01:59:35.717 UTC, confirmada nuevamente al cerrar esta intervención. GitHub y AppDeploy divergen: se capturaron 108 archivos de texto nativos, con 49 coincidencias, 54 diferencias y 5 archivos exclusivos de la versión publicada frente a la copia comparada. Son diferencias de archivos, no 54 funciones faltantes. La configuración de autenticación y tres iconos binarios quedaron excluidos de la captura; no es un respaldo de datos ni una restauración completa.

La reparación parte del baseline nativo `a39d62055499f67b39a43a76024cdf6935ccff06` en `baseline/appdeploy-v99-2026-10-28`, conservando los cambios publicados. `main` no contiene la aplicación completa. No se debe desplegar toda la rama del rediseño.

Se demostraron obstáculos independientes mediante inspección y pruebas reproducibles, sin atribuirles ficticiamente una cantidad de ofertas perdidas:

- [free-public-sources.ts](../../integrations/appdeploy/house-ads/backend/free-public-sources.ts): cortes de candidatos y enlaces de archivo dejaban trabajo sin continuidad; raíces ya procesadas no se revisaban con la debida regularidad.
- [public-source-verifier.ts](../../integrations/appdeploy/house-ads/backend/public-source-verifier.ts): la ausencia de JobPosting bloqueaba documentos con otra evidencia; también había ambigüedad entre ciudad del portal, título y lugar efectivo de trabajo.
- [shadow-pdf.ts](../../integrations/appdeploy/house-ads/backend/shadow-pdf.ts) y [shadow-publish.ts](../../integrations/appdeploy/house-ads/backend/shadow-publish.ts): la identidad elegida podía diferir del ID físico generado por add; faltaban continuidad de paginación y confirmación durable de publicación.
- [public-feed.ts](../../integrations/appdeploy/house-ads/backend/public-feed.ts): el circuito necesitaba protección contra escritores solapados, lectura eventual del control y reconocimiento prematuro de cambios. La reparación conserva el catálogo anterior válido y el ID físico del control existente.
- El rastreo real reveló fallos transitorios de lectura de robots con caché demasiado larga y carreras concurrentes. Se corrigieron sin ignorar una prohibición de acceso. Un fallo de acceso no equivale a una oferta cerrada.
- Los contadores mezclaban primeras páginas internas, ofertas públicas, publicaciones de otros tipos y checkpoints de construcción. Por eso **61 internos, 76 empleos públicos, 80 publicaciones y 86 elementos de un checkpoint no son inventarios equivalentes**.

No se demostró que todos los HTTP 503 históricos tuvieran una sola causa. En las dos mediciones completas de navegador el feed estuvo disponible y las 13 vistas coincidieron con sus IDs públicos; esto no prueba ausencia futura de errores.

## B. Correcciones implementadas

El [paquete revisable](appdeploy-source-patch.json) contiene únicamente **22 archivos de aplicación**, con rutas y contenidos completos, aplicado sobre v99; excluye QA, CSS, autenticación, cron y recursos PWA.

- Trazabilidad persistente por URL e identidad de unidad documental; conserva fuente, evidencia, fechas conocidas, estados, motivos, tabla/ID de origen y recibos de feed. Las observaciones inaccesibles no borran la última evidencia conocida.
- Inventario consolidado de las fuentes publicadas y las configuraciones existentes, sin reducir las 13 localidades ni eliminar fuentes complementarias. Recuperación con cursores y límites explícitos.
- Extracción alternativa de HTML con evidencia visible: empleador, contratación, lugar real, fecha fiable, vigencia y postulación. La falta de JSON-LD por sí sola no rechaza ni autoriza una oferta.
- Fechas originales preservadas; una oferta antigua requiere evidencia actual de postulación. No se fabrica una fecha de cierre. Conflictos territoriales pasan a revisión.
- Lectura PDF real, limitada en bytes/páginas, con texto, OCR necesario, errores y lectura parcial diferenciados. Ruta gratuita local de OCR con PyMuPDF/Tesseract. Las lecturas incompletas o sin fecha no se publican.
- Prevalidación de identidad: una posible republicación se revisa; diferentes cargos verificados de un mismo documento mantienen identidades independientes.
- Feed con páginas inmutables, comprobación de persistencia, exclusión de escritores solapados, actualización atómica del puntero y respaldo del último manifiesto válido. Registro consistente del control sin duplicar el control nativo.
- Publicación y contactos exigen membresía pública vigente, aprobación y consentimiento actual; se excluyen proyecciones pendientes. No se relajó privacidad para aumentar cifras.
- Frontend conserva resultados cargados ante respuestas parciales y no los presenta como catálogo vacío completo. Victoria sigue siendo prioritaria; Los Ángeles, Temuco, Concepción y Chillán son complementarias.
- Un único enlace real adicional, ya existente en el inventario de GitHub, queda como semilla de verificación fresca en el siguiente ciclo normal. No contiene un aviso inventado ni evade la autenticación administrativa.
- El envío analítico externo requiere habilitación explícita de nivel gratuito; no se agregó proveedor pagado ni aumentó la frecuencia del cron.

Estados explícitos: **verificada** exige evidencia suficiente, lugar y postulación utilizables; **recuperable** conserva trabajo para otro lector/reintento; **revisión** exige confirmar un dato indispensable; **rechazada** requiere motivo como vencimiento, no empleo o duplicidad confirmada; **inaccesible** conserva motivo y reintento, sin declarar inexistencia. Las decisiones A/B, motivos individuales y presencia real se entregan en [candidate-trace.json](evidence/candidate-trace.json). Es evidencia del rastreo externo: no se representa como escritura de candidatos en producción.

## C. Evidencia de rastreo real

[Recibos individuales de fuentes](evidence/source-coverage.json), [candidatos](evidence/candidate-trace.json), [documentos](evidence/document-reading.json) y [fuentes originales examinadas](evidence/targets.json).

Inventario: **399 referencias de configuración → 225 URL configuradas distintas**: 104 accesibles como HTML, 81 inaccesibles y 40 sociales para revisión manual. Se añadieron 65 referencias reales de trabajo pendientes: 5 HTML accesibles y 60 documentales. Total 290 entradas contabilizadas; ninguna entrada se omitió silenciosamente. Hay 121 fuentes bloqueadas/manuales: intentar el inventario completo **no significa acceder a todas sus páginas**. No se usaron cuentas sociales ni se eludieron restricciones.

Se examinaron **1.550 URL candidatas HTML** y se registraron **288 URL documentales/de imágenes** por separado. Los cursores llegaron al final del inventario; los bloqueos y documentos parciales mantienen sus motivos. La última continuación real terminó el 28-10-2026 a las 12:25:25 UTC. Las observaciones previas conservan sus fechas originales.

| Indicador, mismo conjunto de URL | Motor A | Motor B |
|---|---:|---:|
| Fuentes HTML accesibles | 109 | 109 |
| URL candidatas HTML | 1550 | 1550 |
| Oportunidades identificadas | 334 | 334 |
| Verificadas, todos los mercados del inventario | 324 | 324 |
| Publicables por URL tras retener posibles republicaciones | 322 | 322 |
| Ya existentes, todos los mercados | 35 | 35 |
| Verificadas en las 13 localidades | 23 | 23 |
| Publicables en las 13 localidades | 22 | 22 |
| Ya públicas entre esas 22 | 21 | 21 |
| Adicionales locales listas para incorporación | 1 | 1 |
| Nuevas publicadas / visibles por esta intervención | 0 / 0 | 0 / 0 |
| Errores de lectura de candidatos en la medición final | 4 | 4 |
| PDF con extracción completa de texto en este lector | 0 | 38 |

**Motor B no demostró recuperación adicional verificada frente a A: 0.** Encontrar más documentos no constituye incremento.

OCR local real: 291 URL con decisión registrada; 53 extracciones pdf_text, 14 pdf_ocr_local, 32 imagen_ocr_local, 72 vistas parciales, 3 imágenes no legibles y 117 sin lectura. Estos grupos describen el lector Python y se solapan con documentos del lector Node; no se suman como documentos únicos. Hubo 41 lecturas fallidas, 29 robots no confirmados y 47 orígenes no autorizados en esa ruta. No se publicaron documentos parciales, sin fecha suficiente o vencidos. La ingestión automática de afiches comunitarios privados no quedó comprobada de extremo a extremo.

## D. Resultados de publicación

Mediciones con navegador y SDK público reales: **11:07:17.020 UTC** y **12:45:32.285 UTC**, 28-10-2026. Todas las páginas del catálogo y las 13 vistas territoriales se recorrieron; sin diferencias de IDs. [Medición y detalle por comuna/fuente](evidence/measurement.json).

| Métrica | Antes | Después | Diferencia |
|---|---:|---:|---:|
| Ofertas únicas visibles en las 13 localidades | 57 | 57 | 0 |
| Ofertas laborales públicas marcadas verificadas, todos los mercados | 76 | 76 | 0 |
| Candidatos internos pendientes, primera página ≤200 | 132 | 132 | 0 |
| Cola HTML del recolector publicado | 93 | 96 | +3 |
| Referencias documentales pendientes del recolector | 60 | 60 | 0 |
| Otras páginas pendientes en trabajo documental | 0 | 5 | +5 |
| Publicaciones nuevas atribuibles a esta intervención | 0 | 0 | 0 |

**Altas 0, bajas 0, incremento neto 0.** No son medidas anteriores/posteriores a aplicar el parche: aún no se aplicó.

Por comuna: Angol 28; Collipulli 2; Ercilla 2; Renaico 0; Mininco 0; Nacimiento 5; Negrete 2; Mulchén 5; Los Sauces 0; Purén 0; Traiguén 5; Lumaco 3; Victoria 6. La suma es 58 porque una oferta pertenece a dos comunas; únicas 57.

Documentos: no se dispone de un contador histórico global comparable antes/después en producción. Se entregan recibos de 291 intentos externos y 38 extracciones PDF completas del lector Node, con sus solapamientos y limitaciones, sin simular una métrica de producción. Los 4 errores de lectura finales HTML tampoco equivalen a todos los fallos de fuentes/documentos.

## E. Ofertas nuevas incorporadas

**Ninguna incorporada todavía.** Se confirmó una oportunidad adicional lista para nueva verificación al incorporarla:

| Cargo | Empresa | Localidad | Fuente / fecha original | Enlace | ID Trabajo Cerca / estado |
|---|---|---|---|---|---|
| DOCENTE PSICOLOGO | CORPORACION HD SPA | Angol | Chiletrabajos / 18-10-2026 18:04:54 UTC | [Original](https://www.chiletrabajos.cl/trabajo/docente-psicologo-3915967) | No existe ID público; pendiente de incorporación |

Cierre declarado por la fuente: 01-01-2027 18:04:54 UTC. Fuente HTTP 200; postulación HTTP 200 hacia preingreso de Chiletrabajos, que requiere cuenta del portal. No se envió una postulación. ID de evidencia externo: `candidate-eaf2271536a9f1233ad639bb820b83ca124e799deb98a0a5`.

No se cuentan como nuevas una posible republicación LAYNER/Lumaco con otro número de aviso, ni avisos de Renaico/Ercilla cuya ciudad estructurada contradice el título sin confirmar el lugar de trabajo. Se conservan fuentes, textos y motivos en targets.json; no se eliminan oportunidades distintas por asumir duplicidad.

## F. Verificación técnica

[Ejecutar/ver ejecuciones](https://github.com/mrvvergara-afk/Trabajo-Cerca-/actions/runs/40690376811), [resultados estructurados](evidence/tests.json).

- 20 pruebas nuevas de regresión aprobadas.
- TypeScript estricto backend/frontend aprobado con contrato de referencia SDK; no sustituye escritura real con SDK.
- Compilaciones esbuild y React/Vite aprobadas, con SDK externo para inyección de plataforma.
- Node repositorio: **409/412**; aplicación: **51/53**. Son **tres fallos distintos preexistentes de publicidad**, dos repetidos en ambas suites. No se declara la suite completa aprobada.
- Baseline nativo sin estas correcciones: repositorio 394/412, aplicación 47/53. Python antes/después **245/245**.
- Los fallos restantes afectan rotación comercial de igual prioridad y retiro/firma de imágenes HOUSE. Sus fuentes no fueron cambiadas dentro de este encargo.
- PDF extraído en pruebas y fuentes reales; imágenes/PDF escaneados realmente leídos por OCR local. No basta con la dependencia instalada.
- Chrome de GitHub Actions sí ejecutó el frontend publicado; no se repitió indefinidamente el Chromium bloqueado del entorno local.
- Transacciones reales de escritura en AppDeploy, recuperación del puntero ante fallo real y fuente→nueva oferta→catálogo→pantalla reparada **pendientes de aplicación y comprobación**. Las pruebas de DB usan un modelo del contrato SDK, no la base productiva.

El artefacto `radar-integral-evidence-and-source-package` incluye compilaciones, capturas de la aplicación publicada y recibos; caduca el 30-10-2026. Las evidencias JSON y el parche de este directorio quedan permanentes en GitHub. No son una validación del rediseño Stitch.

## G. Estado de producción

- **En rama de reparación de GitHub y PR #8 en borrador.**
- **Sin fusión en main ni cambios al PR #7.**
- Parche acotado preparado y revisable; **no certificado como solución operativa completa ni libre de fallos**.
- **No desplegado. AppDeploy sigue en v99 / 1793152775717.**
- Se comprobó la aplicación pública existente; **no se comprobó allí la reparación ni una nueva publicación**.
- Sin eliminación de datos, migraciones destructivas, servicios pagos nuevos, cambios de cron ni activación de pagos.
- La publicación anterior estaba excluida sin autorización y el objetivo económico es $0: aplicar el parche requiere aclarar autorización para usar créditos existentes de AppDeploy; no se asumió permiso para recargas o consumos adicionales.

[Aplicación y reversión acotada](APLICACION.md). La aceptación operativa sigue pendiente: publicar una oportunidad real y verificar su presencia efectiva en la comuna, conservando el catálogo y la evidencia individual.
