# Cierre técnico de Trabajo Cerca · 25 de octubre de 2026

**Estado: candidata implementada, sin desplegar; todavía no aprobada para lanzamiento público.**

Se partió del PR #2, commit `01ad7931612ee70c3134ccc70f8e5ba75030213e`, y se contrastó con el laboratorio `1792875261995`. Se conservaron sus ajustes recientes de interfaz, instalación y notificaciones y las mejoras del PR en verificación y medios comerciales. No se modificó main, no se publicaron datos de prueba ni se activaron pagos. Los detalles de origen están en [base.json](evidence/cierre-tecnico-2026-10-25/base.json).

## Correcciones y cierre de cada paquete

| Paquete | Resultado implementado | Evidencia y límite de cierre |
|---|---|---|
| Contactos y privacidad | El endpoint de contacto exige presencia en el manifiesto público actual y vuelve a comprobar el registro original, vigencia y consentimiento. Nuevas publicaciones guardan autorización y fecha; las históricas elegibles se conservan. | `tests/closure-contact.test.mjs`: 5 casos, incluidos avisos retirados, vencidos, pendientes y consentimiento revocado. No se explotó el defecto en el servicio público. El laboratorio conserva el código anterior hasta autorizar despliegue. |
| Autorización y seguridad | Se preservan autenticación SDK, lista de administradores, cuotas duraderas, cabeceras API y restricciones SSRF/proveedores. TypeScript ahora revisa también todo el backend contra el contrato SDK consultado. | Suites `security-containment`, `administrator-permission`, `release-candidate`. No equivale a pentest ni a una sesión real de propietario en una instancia aislada. Las cabeceras del HTML servido por AppDeploy siguen siendo un asunto del alojamiento. |
| Captación gratuita | Se distinguen almacenamiento, revalidación y publicación confirmada en catálogo. Se conservan fechas originales y primera incorporación. Los cursores de archivos antiguos vuelven al índice actual; se mantienen los límites de 8 fuentes y 14 lecturas por ciclo. | `tests/closure-sources.test.mjs`: 3 casos sobre las funciones reales con adaptador aislado. No se eluden robots, autenticación ni bloqueos 403. |
| Documentos y publicación | Se conecta el checkpoint del escaneo del mismo run con el lector documental, se reparten lotes de hasta 3 candidatos y se conserva la identidad de cada cargo de un PDF. | `tests/test_closure_delivery.py`: 2 casos; suites existentes de firma, receptor, OCR, deduplicación y confirmación. La integración horaria real continúa pendiente de autorización para integrar/activar; no se ejecutaron escritores. |
| Territorio | Victoria pertenece a las 13 localidades principales. Los Ángeles, Temuco, Concepción y Chillán son las 4 complementarias optativas. | Prueba de taxonomía y clic real en Victoria, 13 botones del radar, 4 ciudades complementarias. Sin cambios masivos en publicaciones. |
| Notificaciones | Preferencias por usuario, migración paginada de 40 registros, baja mediante marca persistente, cola de ofertas elegibles, recibos, reintentos acotados de fallas confirmadas y estado incierto sin reenvío ciego. Reutiliza el séptimo cron existente. | `tests/closure-notifications.test.mjs`: 7 casos, incluidos 205 destinatarios y el usuario 201. **Falta entrega física**; un resultado de proveedor no acredita recepción en el teléfono. |
| Analítica | Agregados internos diarios por evento/comuna, identificadores seudonimizados diarios y recibos para no duplicar eventos. Consulta paginada solo para administración. Destino externo fijo y propiedades permitidas. | `tests/closure-analytics.test.mjs`: 4 casos. Límite de 2.000 eventos/día y 120/min globales. PostHog usa `POSTHOG_PROJECT_KEY` mediante `secrets.readSecret`; con \`POSTHOG_ENABLE_INGESTION=free-tier-confirmed\` tras confirmar el nivel gratuito; sin configuración o si falla, la respuesta separa recepción interna de aceptación externa. No se enviaron eventos artificiales al proyecto. |
| Publicidad | Se conserva subida optimizada, almacenamiento, aprobación explícita y retiro de imágenes. Rotan anuncios pagados con iguales derechos; niveles inferiores no desplazan una reserva. | Pruebas de imágenes y comerciales; `closure-feed-rotation`: 4 casos de reservas, localidad, expiración y catálogo degradado. Se mantienen 20 fundadores, 30 días, prueba posterior de 14 días y cero cobros. |
| UI y navegación | Se conserva la versión compacta del laboratorio. Funcionan filtros, limpiar filtros, páginas, detalle, lectura persistente, formularios y enlaces. Instalación visible en portada; guía con foco y cierre por teclado. | Navegador con contenido público real reproducido mediante adaptador local en 360, 390, 430, 768 y 1440 px; casos comerciales aislados adicionales a 320 px. No constituye escritura SDK real. |
| Radar y PWA | Radar con datos reales, selección manual y movimiento reducido; sin consultas por cada giro. Iconos originales preservados, manifiesto/CRC válidos, caché con versión y respuesta offline explícita. | Capturas y pruebas de navegador, temporizador del radar, recuperación de shell sin conexión y posterior reconexión. Falta instalación física y actualización en una PWA ya instalada del propietario. |
| Respaldo | La copia real del propietario coincide exactamente con su recibo de recuperación local: 68 tablas, 4.666 registros, cero diferencias. Se incluyen las nuevas tablas en la exportación futura. | [Recibo y SHA-256](evidence/cierre-tecnico-2026-10-25/respaldo-real-recibo.json). Además, restauración aislada de 14 tablas, 72 registros y 1 archivo, 87 unidades comparadas, sin diferencias. **No acredita restauración de plataforma, OAuth o secretos**. |
| Legal y publicación | Privacidad y términos comparten una sola fuente, incluyen los datos entregados por el responsable, autorización del contacto, control de publicaciones, proveedores y solicitudes de derechos. Páginas legales enlazadas desde autenticación. | `src/legal-content.tsx`, `src/legal-responsible.ts`, `appdeploy.auth-login.json`. Identificación del propietario resuelta. Quedan revisión jurídica aplicable, política definitiva de conservación y condiciones de proveedores. No se presenta como certificación legal. |

## Evidencia verificable

Código candidato verificado: `741fec3d47379196772997b12ac1ee8c9078f560`. [Ejecución aprobada](https://github.com/mrvvergara-afk/Trabajo-Cerca-/actions/runs/40189613359). El commit posterior de entrega añade solamente documentación.

La ejecución identificada en [ci-resultados.json](evidence/cierre-tecnico-2026-10-25/ci-resultados.json) contiene build, TypeScript estricto de frontend/shared/backend, bundle backend, auditoría de dependencias runtime, 392 pruebas Node y 245 Python, sin fallos. El contrato de tipos proviene de las referencias SDK consultadas; **no sustituye su runtime**.

El artefacto `site-inventory-proof` contiene `integrations/appdeploy/house-ads/qa-output/closure/index.html`: galería navegable, capturas completas y parciales de las cinco anchuras, seis campañas, contadores, tarjetas, radar, noticias y footer. Las capturas anteriores del laboratorio están en `qa-output/visual-review/`; las comerciales, con negocios explícitamente ficticios solo del ensayo, en `qa-output/commercial-after-*.png`.

En 390 × 844 se midieron: cabecera 50 px, controles de portada 46 px, primera oferta a 246,44 px, primera tarjeta 120,25 px y barra inferior 54 px. Sin desbordamiento horizontal ni errores JavaScript en los recorridos probados. Los datos de UI y los de SDK real se identifican por separado en los JSON.

Se verificaron las seis creatividades y sus destinos, impresiones visibles sin repetición por espera, imágenes comerciales presentes/ausentes/rotas y subida → aprobación → retiro con adaptador. Los flujos públicos no enviaron formularios reales ni telemetría de ensayo.

## Captación: qué demuestra el servicio real

Lectura del catálogo el 25/10/2026: **70 publicaciones, 68 ofertas, 1 persona, 1 necesidad y 0 servicios**. Las etiquetas de fuentes muestran 49 ofertas de Chiletrabajos y variantes, 8 de Laborum, 6 municipales/locales, 2 BNE, 1 CMPC, 1 LinkedIn/Falabella y 1 Computrabajo. Esto demuestra presencia en el catálogo, **no productividad actual de cada recolector**.

En el registro real de `collect-direct` de las 11:05 UTC: 8 fuentes, 14 lecturas, 6 avisos revisados, 2 verificados/almacenados y `published:0`; quedan 94 pendientes, 52 documentos para lector local y 14 revalidaciones. Indeed Renaico devuelve 403; Computrabajo y LinkedIn encuentran `robots_policy_unavailable`. También se observan páginas de archivo y contenido comercial no laboral. Se corrigen el recorrido y la contabilidad, sin aprobar avisos por cantidad ni eliminar esos controles.

Instagram/Facebook no tienen aquí una automatización gratuita acreditada. Se registra OMIL Victoria y se identifica la cobertura híbrida de Victoria/Traiguén. Procedimiento sostenible: aportar enlace/afiche público por el formulario existente, extracción documental local, revisión de evidencia y envío por el receptor firmado existente. Una fuente registrada no se declara automáticamente capturada.

**Falta observar captación útil en operación después de la integración autorizada**, comparando fuente → candidato → revisión → almacenamiento → ID visible. No se atribuye el aumento del inventario durante esta sesión a esta candidata, que no fue desplegada.

## Rendimiento y límites

Se ejecutó solo en runner aislado HTTP local + SQLite, 260 registros sintéticos paginados sin duplicados, con 10, 50 y 100 clientes concurrentes y 30/150/300 solicitudes. Los p95 fueron 31.14 ms (10 clientes), 56.76 ms (50 clientes), 79.64 ms (100 clientes); memoria y duración constan en el JSON de evidencia. Hubo cero errores en esas muestras. **No son usuarios concurrentes medidos de AppDeploy**. No se repitieron las simulaciones de 5.000 anuncios.

El fallback usa un manifiesto anterior conocido únicamente al iniciar una consulta si falta el nuevo, con estado degradado explícito; no mezcla versiones de cursores ni fabrica páginas. No se considera resuelta una indisponibilidad 503 recurrente del alojamiento sin observación posterior al despliegue. Esta lectura real no recibió 503.

Las notificaciones procesan trabajo acotado por ejecución, hasta 20 comprobaciones de destinatario incluidos reintentos y 40 s de presupuesto; una llamada lenta puede exceder ese tiempo antes del siguiente control. La cola no certifica entrega inmediata ni capacidad para miles de suscriptores. Vigilar antigüedad del backlog. Un envío de resultado incierto exige revisión, no reenvío automático.

Los agregados, recibos y colas consumen base de datos; queda definir y automatizar depuración histórica. No se declara almacenamiento ilimitado.

## Costos y controles

No se contrataron servicios, aumentaron planes, activaron pagos ni habilitaron proveedores de scraping/IA facturables. GitHub CI se ejecutó en el repositorio público. El plan **Plus ya activo**, aceptado temporalmente por el propietario, significa que el costo total actual no puede describirse como $0.

PostHog confirma proyecto 639798, región US e IP anonimizada. Su [tarifa pública](https://posthog.com/docs/product-analytics/pricing) incluye 1 millón de eventos/mes gratis. El conector carece de `billing:read`: no se acreditó el límite de gasto ni la configuración de cobro de la cuenta. No se cambió. Antes de habilitar envío externo, confirmar el plan/límite de gasto y configurar la clave de ingestión existente como secreto. El envío externo permanece apagado hasta establecer explícitamente \`POSTHOG_ENABLE_INGESTION=free-tier-confirmed\`, sin introducir tarjeta ni productos pagados.

## Condiciones que faltan para abrir al público

1. Autorizar y aplicar únicamente en el laboratorio la candidata identificada, conservando todos los recursos binarios existentes.
2. Probar con SDK real en entorno autorizado y aislado los flujos de publicación/gestión, medios y restauración. No usar registros reales como fixtures. Si no existe una instancia aislada gratuita, acordar una ventana/ámbito acotado antes de escribir.
3. Probar suscripción, baja y recepción real en el dispositivo del propietario. El laboratorio registra una falla de Firebase `authTokens:generate`; no se declara corregida por pruebas de adaptador.
4. Verificar configuración y recepción consultable de PostHog con tráfico genuino; el HTTP de captura solo acredita aceptación.
5. Autorizar la integración segura del productor/receptor y observar captación real. Las fuentes bloqueadas mantienen tratamiento híbrido y no promesas de scraping automático.
6. Verificar cabeceras del alojamiento, seguridad de las operaciones con sesión real, actualización PWA en teléfono y protección efectiva de main. No hay herramienta de escritura de reglas de protección disponible en esta sesión.
7. Validar conservación/eliminación y tratamiento de proveedores con el responsable y asesoría jurídica cuando corresponda; no faltan nuevamente los datos personales del responsable.

La analítica avanzada, pasarela de pago, facturación, automatizaciones comerciales, CRM ampliado y nuevo diseño quedan fuera de este cierre; no se activan ni bloquean por sí mismos el lanzamiento.

## Publicación y reversión preparadas

- Checkpoint de código previo: PR `01ad7931612ee70c3134ccc70f8e5ba75030213e`; checkpoint del laboratorio: `1792875261995`. Volver al commit antiguo no preservaría por sí solo todos los ajustes nativos recientes; la candidata ya los reconcilia.
- Antes de un despliegue autorizado: verificar nuevamente ambas cabezas, descargar una copia cifrada actual, comprobarla, guardar SHA-256 y recursos. No guardar contraseña ni datos descifrados en GitHub.
- Desplegar solo el laboratorio existente siguiendo las instrucciones vigentes de AppDeploy, sin sustituir imágenes/iconos por archivos de QA. No tocar main ni habilitar cobros. Verificar UI/API y estado real después, sin interpretar `ready` como aceptación.
- Detener y revertir si falla autorización, se exponen contactos, desaparecen registros, se repiten 503 o se alteran promociones. Reversión del código/AppDeploy no significa restaurar ni borrar datos.
- **Notificaciones y consentimiento al revertir:** si la nueva versión ya guardó bajas/preferencias, pausar el emisor antes de volver al código antiguo; sus filas heredadas pueden estar desactualizadas. No reactivar el emisor heredado sin reconciliar esas bajas. Mantener los seis crons laborales.
- Revertir mediante commit normal con comprobación de cabeza o snapshot de laboratorio; no usar force-push ni revertir main. Verificar caché/actualización cuando no haya formularios sin guardar.
- Tras superar las pruebas reales y aceptación del propietario, preparar aprobación separada para integrar main/lanzar. No existe autorización implícita de lanzamiento por una suite verde.

**Veredicto:** las correcciones de código y la candidata son revisables y probadas. Continúan bloqueantes de verificación real y autorización; no corresponde declarar la plataforma lista para producción todavía.

## Reproducir las comprobaciones

Con Node 24 y las dependencias PDF/OCR del workflow existente:

```sh
python -m unittest discover -s tests -v
for suite in tests/*.test.mjs; do node "$suite" || exit 1; done
cd integrations/appdeploy/house-ads
CLOSURE_CHECKS=1 node qa/run-check.mjs
```

El runner no despliega ni ejecuta recolectores reales. Captura el catálogo público mediante lecturas SDK, bloquea telemetría de ensayo y verifica la candidata con adaptador. Una falla del catálogo real falla la prueba; no se reemplaza por fixtures. Los fixtures comerciales y de capacidad se identifican expresamente.
