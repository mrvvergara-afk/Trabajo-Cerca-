# Trabajo Cerca — auditoría y preparación comercial P0

22 de octubre de 2026. **Dictamen: NO LISTA para producción.** El alcance comercial P0 se implementó y probó en la rama de reparación; no se desplegó la propuesta, no se modificó main y no se activaron cobros, promociones ni anunciantes reales.

Base auditada: `4ae11747107347812269e56cc10ac562cf10860d`. Código final probado: `0613092a3ef32dc3b77d9c018706da9219168b80`. Rama: `repair/mulchen-captura-2026-10-17`. Los blobs de la copia inicial coincidieron con Git; no se reconstruyó la reparación. Propuesta en `integrations/appdeploy/house-ads/`.

## 1. Arquitectura actual
Frontend React/Vite; backend con router, autenticación, tablas clave/valor, transacciones y almacenamiento del SDK AppDeploy. Feed laboral versionado separado de publicaciones directas y de publicidad. Recolectores, verificadores y programación laboral conservados.

Se reutilizan `growth_campaigns`, `growth_advertiser_leads`, campañas HOUSE_AD, administración autorizada, formularios, moderación, protección de contacto, token del autor, respaldos y atribución. Una campaña comercial contiene hoy su creatividad principal; no se crearon módulos paralelos de facturación o CRM. `advertiserId` enlaza campaña y derecho promocional al negocio revisado. Los planes siguen siendo planificación, no contratos.

El SDK documenta filtros posteriores a lectura: no reducen coste y no equivalen a índices secundarios. Hay topes de 256 KiB por elemento, 1 MiB de entrada por llamada, 500 elementos de entrada y 100 acciones/4 MiB por transacción. Estos son límites de contrato, no una medición de la cuota contratada. No se comprobó capacidad total de almacenamiento ni carga distribuida real.

## 2. Errores encontrados y correcciones
| Hallazgo inicial | Corrección en la propuesta |
|---|---|
| Sponsor solo leía 50 campañas | Misma selección central, paginación completa en servidor; no omite posteriores |
| Catálogo fallaba al superar 100 | Recorre continuaciones, caché de 30 s y agrupación de lecturas simultáneas; respuesta con hasta dos anuncios |
| Selección fija monopolizaba publicidad gratuita | Turnos deterministas entre pares elegibles, deduplicación de negocio entre espacios; respeta territorio y vigencia |
| Promoción de 30 días sin cupos ni lanzamiento | Configuración única: 20 fundadores, 30 días individuales, ventana de convocatoria de 30 días, luego 14 días estándar |
| Posible beneficio repetido desde otra solicitud | Derecho único por nombre comercial normalizado, revisión administrativa, transacción y protección de pruebas históricas |
| Aprobaciones simultáneas podían consumir mal los cupos | Condición atómica sobre cupos/configuración y recibo estable; reconciliación ante resultado incierto, sin repetir a ciegas |
| Interfaz prometía siempre 30 días | Consulta promoción central; lanzamiento null, sin fecha inventada; mensajes sin promesa universal ni fecha fija antigua |
| Consentimiento de contacto no acreditaba permiso para anunciar | Consentimiento publicitario separado, registrado con fecha; solicitudes anteriores sin él no se activan automáticamente |
| Solo cuatro HOUSE_AD | Seis campañas y destinos reales; nuevas variantes conservan las campañas existentes y sus IDs |
| Difícil encontrar publicidad si no salía el banner correspondiente | Acceso permanente Promocionar mi negocio en portada y menú |
| Analítica comercial dependía de una vía externa bloqueada | Eventos de primera parte, separados de HOUSE_AD, con recibos e incrementos idempotentes; no se habilita PostHog |
| Primera página de deduplicación comercial limitada a 100 | Comprobación con cursores y fallo explícito si no se completa |
| Administración comercial incompleta | Campañas paginadas, pausa/activación/rechazo, configuración de promociones y tarifas preliminares; registro de acciones |
| Resumen operativo podía presentar conteos comerciales parciales como exactos | Indicadores de parcialidad y etiqueta Al menos para prospectos/borradores truncados; campañas se leen completas |
| Autor solo podía cerrar/eliminar | Edición y renovación gratuitas de publicaciones directas con token y consentimiento, sin alterar ID, creación ni verificación laboral |

El vencimiento excluye la publicidad automáticamente al llegar endAt; no genera un cargo ni extiende fechas. El registro histórico se conserva. No se reinterpretaron los compromisos de campañas pagadas/heredadas: se mantiene su prioridad y ubicación; una garantía contractual de impresiones requiere el trabajo P1 de inventario y pacing.

La identidad normalizada evita repeticiones triviales por mayúsculas/acentos/contacto distinto, pero **no acredita identidad jurídica**: homónimos y alias necesitan revisión humana y un proceso de excepciones P1. No se contactó a negocios ni instituciones.

## 3. Funcionalidad reutilizada y pruebas
[Run final 39800053653](https://github.com/mrvvergara-afk/Trabajo-Cerca-/actions/runs/39800053653), job 119897862052: **243 pruebas Python y 341 Node aprobadas**, cero fallos. Vite compila y las comprobaciones TypeScript incluidas en el ensayo pasan. Se conservaron todas las suites existentes; los 33 casos comerciales locales son un subconjunto, no se suman otra vez al total.

Playwright: 320×568, 390×844, 768×1024 y 1440×1000. Sin desbordamiento; cabecera móvil 64 px y navegación inferior 58 px, formularios abiertos correctamente, menú accesible y pie sin solapamiento. Capturas móvil/escritorio revisadas. El ensayo sin anunciantes y sin profesionales muestra autopromoción y estados vacíos reales del componente.

Se completaron en el adaptador aislado los formularios de oficio libre, necesidad de contratación y negocio. Se comprobaron consentimiento, ausencia de precio/cuenta obligatoria y no activación automática de prueba ni pago. La prueba del handler real de publicación, con persistencia simulada, conservó contacto privado y token de autor, sin convertir publicaciones directas en ofertas verificadas.

Reglas verificadas: 20 fundadores y siguiente prueba de 14 días; replay idempotente; aprobación simultánea; fallo de transacción sin consumir cupos; cierre de convocatoria; promoción pausada; negocio repetido e histórico; ausencia de consentimiento; anuncios posteriores al registro 100; cursores repetidos; pausa sin renovar; vencimiento; segmentación; rotación de 100 pares gratuitos; prioridad pagada; configuración concurrente; métricas separadas y sin ventas; edición/renovación solo por autor y solo de publicaciones directas.

Los ensayos de backend usan el código de las funciones con un adaptador del contrato SDK. No equivalen a una prueba real de transacciones, autenticación o restauración en AppDeploy. La compilación de Vite y los módulos revisados no reemplazan un build/ensayo del backend completo dentro de la plataforma antes del lanzamiento. El marcador de CI usado omite operaciones live, recolectores y despliegues. La terminal bloqueó npm con EPERM; la descarga y el navegador se ejecutaron en el CI existente, sin cambiar horarios.

## 4. Escalabilidad medida
Modelo SDK en memoria, 1 ms simulado por lectura de página; Node v24.22.0. Concurrencia controlada de 1, 5 y 20 promesas dentro de un proceso, no instancias distribuidas. No se cargaron registros sintéticos a AppDeploy.

| Anuncios | Páginas leídas | Primera consulta ms | p95 con caché/concurrencia ms | Máximo JSON al navegador, bytes |
|---:|---:|---:|---:|---:|
| 0 | 1 | 2.633 | 1.408 | 3482 |
| 20 | 1 | 2.304 | 2.602 | 4176 |
| 100 | 1 | 3.778 | 9.003 | 4176 |
| 500 | 5 | 10.997 | 24.684 | 4182 |
| 1.000 | 10 | 17.312 | 37.821 | 4182 |
| 5.000 | 50 | 88.157 | 184.028 | 4188 |

Cero errores en esos escenarios. A 5.000: incremento de heap de 12.62 MiB y RSS total del proceso de 127.71 MiB; el RSS no es memoria exclusiva de anuncios ni capacidad de almacenamiento. La caché compartió una sola lectura de 50 páginas entre 20 peticiones simultáneas en el mismo proceso.

**Límites:** escaneo completo por caché fría; filtros sin índices de coste reducido; caché no compartida entre instancias; hasta 200 páginas de 100 y 8 MiB de proyección por protección. Superar el presupuesto o fallar una lectura produce error, nunca un catálogo falsamente vacío. Esto no demuestra una capacidad de 20.000 anuncios ni cuotas/latencia reales. Antes de escalar tráfico sostenido se necesitan medición SDK autorizada y, según resultados, una proyección territorial/indexación mantenida. Los 20 fundadores son cupos promocionales, no capacidad técnica.

## 5. Analítica y administración comercial
Implementadas en código y probadas con datos aislados: impresiones visibles (50 % durante 1 s), clics y CTR; HOUSE_AD y comerciales en tablas separadas; formularios iniciados, perfiles/necesidades publicados, solicitudes y pruebas aprobadas atribuidos a efectos del servidor. Se conservan recibos HOUSE_AD anteriores. Solicitudes reales y campañas tienen paginación; campos vacíos muestran Sin datos, sin ejemplos comerciales ficticios.

No se consideran ventas los clics, contactos, pruebas ni impresiones. Eventos del navegador son reportes, no impresiones auditadas/facturables. Si una métrica de conversión falla, no deshace una publicación exitosa: puede quedar pendiente en logs, por lo que no sirve como contabilidad. Los endpoints administrativos mantienen autenticación SDK y allowlist. Las tablas nuevas de configuración, beneficios, auditoría, métricas y recibos se agregaron al ámbito de respaldo; esto no demuestra restauración integral.

Pendientes P1: audiencia única/recurrente, UTM completo, panel comercial integral, CRM con historial de contacto y próxima acción, exportaciones, informes de anunciantes, atribución financiera y revisión de consentimientos/retención para habilitar analítica externa. PostHog continúa deshabilitado por política. No hay un sistema de ingresos reales ni pagos que medir hoy; no se inventaron cifras.

## 6. Costos y riesgos
No se añadieron dependencias, proveedores pagos, cobros, suscripciones ni tareas programadas. Las tarifas 2.990/5.990/9.990/19.990 CLP por 30 días son editables, preliminares y no aprobadas; IVA pendiente de definición, con opciones de tratamiento explícitas. No hay ruta de checkout o renovación automática.

El coste futuro depende de lecturas SDK, eventos/recibos y retención, almacenamiento/transferencia de imágenes, tráfico y número de instancias. Una caché fría de 5.000 campañas requiere 50 llamadas de listado; no se conoce aquí su precio ni la cuota de la cuenta. Los eventos generan lecturas y escrituras transaccionales, protegidos por cuotas públicas; no existe garantía de coste cero. Creatividades propias limitadas a 200 KB, carga diferida y URLs de almacenamiento existentes; no se habilitó OCR remoto ni procesamiento externo de fotos.

Riesgos abiertos: escaneo por instancia; sesgo/abuso de medición del navegador; revisión manual de identidad comercial; datos de contacto y tokens que exigen protección de respaldos; ausencia de políticas completas de retención y restauración de plataforma. No se simularon 5.000 imágenes ni usuarios distribuidos.

## 7. Pendientes P1/P2 y puerta de producción
P1: CRM ampliado, estadísticas por anunciante, exportación y materiales de marketing, Open Graph específico por contenido/SEO territorial, excepciones comerciales auditables, planes con beneficios/compromisos de exposición, índices/proyecciones según uso y rotación contractual de campañas pagadas. P2: contratación digital, pasarela de pagos, comprobantes/facturación aprobada, IVA definitivo y renovaciones con consentimiento. No deben presentarse como disponibles ni bloquear por sí solos el piloto gratuito.

**Bloqueantes de lanzamiento general que este cambio no cierra:** cabeceras de seguridad ausentes en la última evidencia live, dos PNG de instalación inválidos, identificación legal completa pendiente y restauración integral no acreditada. Sitemap devolvía 403; protección actual de main y dependencias reproducibles requieren verificación de release. Esta propuesta necesita ensayo controlado con SDK real antes de promoverla. No se afirma que el código de esta rama ya esté en la app.

## 8. Entrega y evidencia
Código probado en el commit indicado, informe de auditoría inicial conservado y JSON de capacidad, HOUSE_AD, navegación y formularios en docs/evidence/p0-comercial-*.json. Artefacto 12434792976: SHA-256 7040b0b775737d1a9d59605b15db00b0991d0aaa08206cc3ac7c73cdedf59641, verificado tras descargar. Los JSON se conservan en Git para no depender de su retención temporal.

Resultados reales de esta intervención: **0 despliegues, 0 ofertas nuevas publicadas, 0 anunciantes reales creados, 0 pruebas gratuitas reales activadas y 0 cobros.** Todos los registros y conteos de ensayo son sintéticos y aislados. No se alteraron credenciales, main, históricos ni crons.
