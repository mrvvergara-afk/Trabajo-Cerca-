# Trabajo Cerca — revalidaciones y publicidad visual

Versión candidata de la rama `repair/mulchen-captura-2026-10-17`, PR #2. Sin fusión, despliegue, cobros ni modificaciones de registros reales. Código funcional probado: `3d88ee5750e277b59c5d5439ad817aa393bcb6ae`. La entrega añade evidencia durable y pruebas de formatos; el HEAD vigente está identificado en el PR #2.

La línea base fue el PR `2dc9a82d3d90e013b8588f407e2203c541428cd9`. Se consultó la app ready `1792716300276` y se cotejaron los ocho módulos afectados con la candidata anterior: coinciden ignorando espacios. Se mantuvo el rediseño compacto.

## Estados y revalidaciones

- El plazo interno de 24 horas sigue programando comprobaciones; ya no decide la etiqueta pública.
- «Verificada» exige la marca de verificación, una fecha exitosa válida no futura y evidencia documentada (método, motivo o referencias). Se muestra por separado la última comprobación. No se sustituye por la fecha de un intento fallido.
- Si falta la primera confirmación o existe revisión pendiente: «Vigencia por confirmar». Una publicación directa se identifica como tal. La revisión pendiente no desaparece por tener una verificación histórica.
- Se conservan las fechas original, de incorporación y de última comprobación; no se editan fechas, IDs ni evidencias al calcular la etiqueta.
- El retiro por cierre explícito/inactividad o plazo confirmado mantiene la política existente. La antigüedad automática de 45 días no se convierte en una fecha de cierre inventada.
- Se ajustó la prioridad del lote ya existente: antigüedad, datos insuficientes y fuentes de cambio frecuente. Se conservan límite del lote, paginación, verificadores, deduplicación y seis crons/horarios. La elegibilidad de ofertas ya verificadas respeta la comprobación exitosa más reciente y el intervalo previo entre intentos. La prioridad opera dentro de cada lote recuperado, no demuestra una prioridad global ilimitada.
- No se aprobaron avisos masivamente, no se ejecutaron capturas manuales, no se publicaron ofertas nuevas.

## Publicidad

Las seis campañas HOUSE_AD tienen ilustraciones vectoriales originales, con una línea verde oscuro/lima/blanco. Sus SVG suman 6424 bytes; la compresión gzip local suma 2920 bytes (esto no certifica que el alojamiento sirva gzip). No usan fotografías de terceros, rastreadores, fuentes externas ni servicios pagos. No representan negocios reales.

Se reutilizaron `storagePath`, `imageUrl`, el módulo de marketing, sus rutas administrativas y la asignación publicitaria existente. La administración puede reemplazar, retirar o restablecer la ilustración inicial. Al guardar una campaña antigua sin imagen se conserva el contenido y se ofrece la ilustración propia correspondiente; una retirada explícita se conserva mediante `imageDisabled`.

El modelo comercial acepta imagen y logo opcionales. Solo se resuelven URLs firmadas de archivos aprobados. El administrador confirma autorización y revisión visual antes de asociar cada archivo; se registra actor, fecha y acción. Retirar la asociación no borra la campaña ni el original histórico. Se evita borrar un recurso que podría compartir otra campaña o un respaldo. No hay análisis automático de contenido que sustituya esa revisión humana.

Carga: PNG/JPEG/WebP hasta 8 MB de entrada; el navegador decodifica y reencodifica, reduce a 1200 px como máximo y a 200 KB, eliminando metadatos de la copia visual. El servidor comprueba formato, estructura, tamaño y dimensiones (máximo 1600 px y 2 MP), rechaza SVG subidos/HTML/animación y utiliza rutas por hash. No se permiten URLs arbitrarias como creatividades. Las ilustraciones SVG incluidas son recursos propios fijos del sitio, no subidas de usuarios.

Los anuncios antiguos funcionan sin imagen; los fallos de carga retiran la imagen y conservan texto/enlace. Carga diferida y dimensiones explícitas. Las URLs firmadas pueden vencer: el fallback textual sigue funcionando y una nueva consulta del catálogo obtiene nuevas URLs. Retirar una imagen se refleja en nuevas consultas; no revoca retroactivamente una imagen ya descargada en el navegador.

No se modificaron los 20 cupos, las condiciones de 30/14 días, el catálogo de planes ni los destinos de las seis campañas. Tampoco las prioridades comerciales contratadas, la rotación ni el registro idempotente de eventos. No se activaron pagos.

## Alcance de las pruebas

Las capturas comparan el frontend real compilado en Chromium, con el mismo viewport y adaptador aislado en las dos versiones. Los puestos y negocios de esas capturas son fixtures identificados; no son publicaciones reales ni pruebas de escritura sobre el SDK de producción. La lectura del inventario y su recuento por causas se hacen aparte con el SDK público real.



## Corrección del diagnóstico

El primer recuento de evidencia no era válido para decidir la etiqueta: la vista operativa omitía `verifiedAt`, método y motivo al resumir las respuestas del SDK. Se descartó expresamente la inferencia de ausencia de evidencia a partir de esos campos ausentes. La candidata conserva esos metadatos públicos y la auditoría observa las respuestas a las solicitudes SDK ya ejecutadas por la propia app, antes del recorte. No se sustituye la evidencia ausente por una confirmación inventada.

La inspección SDK completa encontró otro defecto concreto: en dos registros `lastVerifiedAt` era antiguo, pero `externalVerifiedAt` y `verifiedAt` contenían una comprobación posterior. La programación elegía el primer campo no vacío. La candidata toma la fecha exitosa más reciente y evita volver a seleccionar ofertas recién comprobadas, conservando el historial y los intervalos. También se usa esa fecha al calcular la siguiente actualización de la proyección; las reglas de cierre permanecen intactas.

## Recuento real del inventario

Lectura completa mediante SDK anónimo: **60 registros, 59 tipados como oferta**. Es inventario existente; no son 59 vacantes nuevas ni 59 comprobaciones realizadas durante este trabajo. Manifiesto `79a73186-80bf-49ac-a279-7fedb06a7fe7`.

| Causa entre los 49 marcados por la versión desplegada | Registros |
|---|---:|
| Más de 24 horas desde la última comprobación exitosa | 47 |
| Campo antiguo priorizado frente a otra comprobación posterior registrada | 2 |
| Sin evidencia o sin fecha exitosa en la respuesta SDK completa | 0 |
| Total examinado | 49 |

Los 49 tienen historial de verificación y la candidata conserva «Verificada» mostrando su fecha, sin aprobarlos otra vez. Esto **no es una comprobación nueva de disponibilidad**. Si aparece evidencia de cierre, el pipeline conserva su mecanismo de retiro.

Los dos casos de precedencia son `0334d4c8-28ee-4aaa-a266-0610b1988e06` y `free-d294f2d92f9e56840e53553adef2420f48b30847`. Sus campos y fechas originales están en [evidencia SDK](evidence/revalidaciones-publicidad-2026-10-22/sdk-public-evidence.json).

El recálculo interno sobre los **59** registros da **48 pendientes por tiempo**: se excluyen los dos falsos positivos anteriores y se incluye un registro cuyo plazo ya pasó aunque su indicador almacenado aún era falso. Los indicadores de la proyección no son actividad en vivo; el recuento de 49 y el de 48 describen criterios diferentes. Ninguno se usa para retirar automáticamente «Verificada» de la tarjeta. Las etiquetas públicas y la programación ya están separadas.

[Recuento por ID y causa](evidence/revalidaciones-publicidad-2026-10-22/recheck-inventory.json). **Publicaciones nuevas realizadas: 0. Aprobaciones masivas: 0.**

## Resultado de las pruebas

[Run completo 39941151479](https://github.com/mrvvergara-afk/Trabajo-Cerca-/actions/runs/39941151479) y [PR 39941157025](https://github.com/mrvvergara-afk/Trabajo-Cerca-/actions/runs/39941157025): aprobados sobre el código funcional.

- 243 pruebas Python y 360 casos Node completos: aprobados. El cierre agrega un caso adicional, verificado localmente, de JPEG/WebP reales; el check del HEAD vuelve a ejecutar la suite completa.
- Diez casos directos nuevos: fechas y evidencia, ausencia de mutaciones, primera confirmación pendiente, antigüedad y fuentes frecuentes, cierre/vencimiento, seis SVG originales, rechazo de archivos inválidos/grandes, aprobación explícita y retiro, metadatos de diagnóstico sin contactos/tokens, selección de la comprobación más reciente y JPEG/WebP válidos.
- TypeScript del frontend completo con contratos SDK, compilación frontend con adaptador aislado y bundle backend completo: aprobados. No se afirma una compilación/ejecución del SDK de producción en un nuevo alojamiento.
- Chromium en 320, 390, 768 y 1440 px: seis campañas con imagen, anuncios sin imagen/con imagen/logo/fallo 404 esperado, etiquetas y tres fechas, carga decodificada, CTA, formularios de oficios/contratación/publicidad, administración y ausencia de desbordamiento. Las capturas son del navegador; sus negocios y puestos son fixtures, nunca datos sembrados en producción.
- Subida real desde el selector de archivos en navegador, compresión a WebP de hasta 200 KB y solicitud de aprobación/retiro mediante adaptador aislado. Funciones backend y almacenamiento transaccional probados con harness en memoria. **No se probaron escrituras con el SDK real en una instancia aislada de AppDeploy**.
- Rotación de las seis campañas, reservas comerciales, segmentación, expiración y 20/30/14 conservados. Impresiones visibles repetidas no se duplican; las pruebas de idempotencia del backend siguen pasando. Las estadísticas HOUSE_AD no son ingresos.
- Auditoría runtime de dependencias: cero vulnerabilidades reportadas al corte. Sin dependencias nuevas. No se repitió la simulación de 5.000 anunciantes; no se declara capacidad real ilimitada.
- Prueba representativa de recuperación cifrada local: aprobada con datos aislados. No equivale a una restauración integral de la plataforma ni del respaldo privado del propietario.

Errores corregidos durante la ejecución: inicialización temprana del adaptador de pruebas; banner de 242 px en 320 px; recuento preliminar que confundía campos omitidos con falta de evidencia; precedencia de una fecha antigua frente a otra comprobación existente más reciente. No se aceptaron esos resultados como verificación final.

## Comparación visual

Alturas medidas, sin recortar contenido ni fijar una altura máxima por CSS. El texto puede aumentar la altura cuando el usuario amplía la fuente.

| Ancho | HOUSE_AD antes, sin imagen | HOUSE_AD después, con imagen | Comercial después, máximo probado |
|---|---:|---:|---:|
| 320 px | 136–198 px | 166–210 px | 222 px |
| 390 px | 137–183 px | 136–214 px | 222 px |
| 768 px | 93–125 px | 145–163 px | 207 px |
| 1440 px | 104–121 px | 112–121 px | 163 px |

| Captura a 390 px | Antes | Después |
|---|---|---|
| Estado laboral y fechas | [Ver](evidence/revalidaciones-publicidad-2026-10-22/recheck-before-390-card.png) | [Ver](evidence/revalidaciones-publicidad-2026-10-22/recheck-after-390-card.png) |
| Campaña propia con creatividad | [Ver](evidence/revalidaciones-publicidad-2026-10-22/house-before-390-5.png) | [Ver](evidence/revalidaciones-publicidad-2026-10-22/house-after-390-5.png) |
| Publicidad comercial con imagen y logo | [Ver](evidence/revalidaciones-publicidad-2026-10-22/commercial-before-390-paid-image.png) | [Ver](evidence/revalidaciones-publicidad-2026-10-22/commercial-after-390-paid-image.png) |
| Comercial sin imagen | [Ver](evidence/revalidaciones-publicidad-2026-10-22/commercial-before-390-paid.png) | [Ver](evidence/revalidaciones-publicidad-2026-10-22/commercial-after-390-paid.png) |

También se conservan pares equivalentes en 320, 768 y 1440 px. [Administración y retiro](evidence/revalidaciones-publicidad-2026-10-22/image-administration-after.png). El ZIP conserva todas las capturas, los JSON y el código; los originales SVG están en `public/house-creatives/`.

## Archivos e invariantes

[Lista completa](evidence/revalidaciones-publicidad-2026-10-22/modified-files.json). Se actualizaron presentación de tarjetas, fechas, inventario de diagnóstico, prioridad/selección temporal, modelo y catálogo de imágenes, componentes HOUSE_AD/LocalAdvertising, controles administrativos y pruebas. Se reutilizaron las mismas rutas administrativas protegidas y el mismo almacenamiento; no se añadió un módulo paralelo.

Las reglas de cierre/retención, el receptor firmado, deduplicación, módulos de fuentes y revalidación documental, política de seguridad, promociones, dependencias y los seis crons/handlers se conservan. El cambio laboral se limita al significado de la etiqueta y a la selección/prioridad temporal justificada por los datos. [Prueba de invariantes](evidence/revalidaciones-publicidad-2026-10-22/preserved-invariants.json).

## Pendientes y estado de entrega

**Cambios preparados para revisión; no desplegados ni fusionados.** La app sigue ready en `1792716300276`. `main` permanece en `fab392b824e4100a4bba6dfe9289825297d24707` y aún sin protección. La publicación requiere autorización expresa.

Permanecen los bloqueantes previos de lanzamiento: cabeceras HTTP del documento en el alojamiento, protección de `main`, identificación legal completa y restauración/recorridos autenticados con SDK real en una instancia aislada. En particular, las aprobaciones y archivos publicitarios no se han escrito en la base real para probarlos. Los anuncios comerciales reales requieren material autorizado y revisión del administrador; no se inventaron negocios ni clientes.

La verificación histórica no garantiza disponibilidad indefinida. La captura y revalidación recurrentes mantienen sus capacidades y límites anteriores; este cambio no instala nuevas fuentes sociales ni entrega push. Los costos futuros de almacenamiento y transferencia crecen con las imágenes y el tráfico dentro del proveedor actual; no se activaron servicios ni cobros adicionales.

El artefacto CI del código funcional tiene SHA-256 `46b2636de27cd1dbdc4d157deadaf560d1667e73eb141ab832451ce6114f451a` (ID 12496456167). El expediente descargable incorpora su propio manifiesto SHA-256 para comprobar archivos; no incluye contraseñas, credenciales ni el respaldo privado del propietario.
