# Trabajo Cerca — autopromoción e inventario publicitario

Fecha: 22 de octubre de 2026. Implementación para revisión en repair/mulchen-captura-2026-10-17. Código verificado: 570868f408ed7556fda67590ef209511ea2b405b. No se desplegó, integró a main, creó otra app, cambió credenciales, alteró históricos, contactó terceros o modificó frecuencia/cantidad de cron. La app existente permanece en 1792632646829.

## Qué está preparado

Cuatro campañas reales de la propia plataforma, identificadas HOUSE_AD: profesionales/oficios, anunciantes, empleadores y exploración. No representan negocios, perfiles, vacantes o testimonios ficticios. Defaults permanentes; mensajes de computador/celular, botón, creatividades y parámetros editables.

El motor shared/house-ads.ts asigna los espacios de la pantalla de una vez: bajo buscador y, cuando hay suficientes tarjetas, dentro de resultados después de tres publicaciones. Reutiliza growth_campaigns y el componente LocalAdvertising para terceros. HOUSE_AD completa espacio libre sin una proporción fija. Conserva cobertura y prioridad territorial exacta sobre regional, fecha de vigencia y ubicaciones comerciales existentes. Un catálogo incompleto o fallido no se interpreta como cero anunciantes. Ninguna campaña propia se agrega al feed o sus contadores.

Se eliminaron de la propuesta los tres banners propios fijos del carrusel y el bloque comercial heredado duplicado. Máximo dos ubicaciones separadas; ninguna ventana emergente automática. Los formularios solo se abren al pulsar un botón. Los house ads no repiten el mismo ID en pantalla y aplican frecuencia por sesión. No hay rotación animada ni peticiones de catálogo por temporizador; se revisan fechas localmente cada minuto. Las campañas comerciales comprometidas heredadas conservan sus ubicaciones previas incluso cuando requieren repetición: no se les impone retroactivamente el límite de house ads.

Los destinos son los formularios existentes de oficio (worker_available), oportunidad (worker_need), registro comercial o navegación de ofertas. La campaña de servicios no inventa un catálogo nuevo: utiliza el modelo actual de personas/oficios disponibles. Un estado vacío de profesionales invita a publicar; si quedan páginas por cargar, informa incertidumbre en vez de afirmar que no hay perfiles. Las publicaciones anteriores siguen su circuito normal.

## Administración

Marketing y Monetización > Campañas propias solo se monta tras comprobación administrativa. Cinco rutas de gestión reutilizan requireAuth() y requireAdminEmailAllowlist(ADMIN_EMAILS). El editor permite crear, editar, pausar/activar, fechas, prioridad, frecuencia, comunas, categorías, vistas y ubicaciones. Hasta cuatro variantes por campaña para comparación descriptiva y hasta 24 campañas.

Creatividades opcionales PNG/JPEG/WebP de hasta 200 KB en almacenamiento SDK; no SVG/HTML. Se usan rutas hash, URLs firmadas, carga diferida e imagen de tamaño reservado. Los textos y destinos están separados: no se aceptan URLs arbitrarias como CTA propio. La configuración usa revisión y escritura condicional para rechazar sobrescrituras de otra sesión. El guardado se aplica en visitas posteriores, no se promete propagación en una pestaña abierta indefinidamente.

## Prueba comercial real

El formulario anterior solo registraba interés y anunciaba un cierre fijo el 15-nov. Ahora solicita 30 días desde aprobación, sin cargo ni renovación automática. Enviar una solicitud no significa prueba activa: queda pending_review. El administrador consulta solicitudes reales, revisa el texto público y activa el anuncio gratuito en growth_campaigns. El inicio y fin quedan en servidor, exactamente 30 días, tipo COMMERCIAL_FREE. Una repetición de aprobación con el mismo ID no crea otro anuncio ni renueva la fecha. El contacto privado del solicitante no se incorpora al anuncio público.

## Analítica básica

Primera parte y separada de la publicidad comercial: impresión visible (50% durante un segundo), clic, primera edición del formulario, formulario guardado, perfil publicado, empleador incorporado, anunciante captado y prueba gratuita activada. La atribución viaja por las dos vistas existentes del formulario. CTR por campaña/variante/día; estado vacío sin métricas de ejemplo y paginación explícita del rendimiento.

El cliente solo puede enviar impresión/clic/inicio. Las conversiones se registran tras el efecto real en servidor. Recibos con ID estable e incremento atómico impiden contar dos veces una entrega repetida. Los errores de métricas no convierten una publicación exitosa en un fallo ni se hacen reintentos ciegos. No hay garantía de entrega ante caída del navegador/cuota: son mediciones operativas, no facturables ni antifraude.

registration_completed significa formulario de publicación o solicitud efectivamente guardado; no acredita una cuenta autenticada nueva. El objetivo completado se suprime en la sesión y cuando se reconoce un perfil propio por su token en el dispositivo. No se promete identificación del mismo usuario en otros dispositivos.

PostHog permanece deshabilitado conforme a la política de contención. No se cambian secretos ni se envían datos a proveedores externos. paid_conversion está reservado a un futuro efecto de pago confirmado; no tiene productor instalado. Ni eventos HOUSE_AD, ni solicitudes, ni pruebas gratuitas se cuentan como ventas, ingresos o clientes pagados.

## Pruebas y evidencia

Run 39773839122, job 119807719578: éxito. 243 Python y 325 Node aprobados, cero fallos/omisiones. Incluye 17 pruebas nuevas del motor/backend: cero anunciantes, rotación de cuatro campañas/variantes, anuncio único, diferentes comunas, vencimiento, ocupación parcial, anuncio pagado protegido, catálogo incompleto, frecuencia, objetivos ya completados, pausa/fechas/categoría, validación, configuración concurrente, métricas idempotentes, rechazo de conversiones forjadas, rollback atómico, aprobación gratuita idempotente y conexión de atribución en las dos vistas.

Compilación Vite y TypeScript de los módulos nuevos aprobadas. Playwright sobre localhost, SDK simulado: 390x844 y 1440x1000 con cero anunciantes y perfiles, campaña visible, formulario de oficio abierto, evento de inicio tras editar y cierre sin publicación; estado vacío profesional útil; formulario comercial con aprobación pendiente; posición pagada preservada; pausa guardada en administración; sin errores de página ni desbordamiento horizontal. Son fixtures, no datos insertados en la app real. Los ejemplos comerciales solo existen en qa/ y jamás deben desplegarse.

Se detectaron y corrigieron durante las pruebas una omisión de notificaciones en el adaptador de ensayo, un selector administrativo demasiado estricto y un error real de propagación de atribución en la vista actual de publicación. La última ejecución pasó íntegramente. No se ocultan estas iteraciones ni se presentan como ejecuciones de producción.

Bundle de ensayo con SDK simulado: JS 367,20 KB (111,83 KB gzip), CSS 114,85 KB (23,03 KB gzip), build 2,87 s. Estas cifras no son del SDK real ni una prueba de carga. No se afirma mejora cuantificada contra una línea base de rendimiento de producción.

## Entrega y límites antes de activar

La propuesta está en integrations/appdeploy/house-ads/. README separa archivos modificados de la base frontend copiada. qa/ y el alias @appdeploy/client simulado son exclusivamente de pruebas: NO desplegarlos. Debe usarse vite.config.ts normal y el SDK auténtico. Backend index.ts/admin-backup.ts están preparados desde el snapshot actual; los demás módulos backend existentes se conservan en AppDeploy. El nuevo config, métricas y recibos se incluyen en el ámbito de respaldo sin reescribir copias históricas.

No hay nuevo sistema de facturación, cuotas contractuales de impresiones ni garantía de pacing por plan: el sistema heredado no las contiene. Se preservan prioridad y posiciones existentes; antes de vender garantías hace falta implementar y acreditar reservas/recibos comerciales. Las conversiones a pago, registros de cuentas nuevos y atribución entre dispositivos requieren integraciones posteriores. Esto no bloquea lanzar autopromoción y captación gratuita.

El catálogo comercial actual se lee hasta 100 registros; si hay más, se rechaza el supuesto de inventario libre. Antes de escalar, usar una proyección vigente de inventario o paginación acotada con checkpoint; no prometer cobertura de una tabla creciente con la primera página.

Pendiente: autorización de despliegue y comprobación con el SDK real en laboratorio (incluidos permisos, almacenamiento, guardado concurrente y aprobación real con datos autorizados). No se ejecutan escrituras reales con cuentas de prueba en esta entrega. Este cambio no cierra otros bloqueantes de producción de la auditoría general.
