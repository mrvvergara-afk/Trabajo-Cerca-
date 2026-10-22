# Auditoría comercial P0 — 22 de octubre de 2026

Base examinada: rama repair/mulchen-captura-2026-10-17, commit 4ae11747107347812269e56cc10ac562cf10860d. Las copias locales de los archivos existentes coinciden con sus blobs Git (cero diferencias previas). No se supone que AppDeploy contenga estos cambios; no habrá despliegue en este encargo.

## Estado inicial y reutilización
- Backend AppDeploy con tablas clave/valor, router, autorización SDK y allowlist. Formularios públicos de oficios, necesidades y solicitudes comerciales; edición libre del oficio, sin catálogo cerrado. Contacto protegido, consentimiento y token del autor para cerrar/eliminar.
- HOUSE_AD: cuatro campañas configurables, variantes e imágenes hasta 200 KB, frecuencia por sesión, atribución y métricas propias. Se amplían a seis sin reconstrucción.
- Campañas comerciales en growth_campaigns y prospectos en growth_advertiser_leads. No hay pagos habilitados. Tablas y administración existentes se conservan.
- Feed laboral versionado con paginación independiente; recolectores, criterios de verificación y horarios fuera del cambio comercial.
- Límites confirmados: GET /api/growth/sponsor listaba 50 campañas; advertisingCatalog listaba 100 y fallaba si había continuación; resumen comercial también paraba en 100. Deduplicación de prospectos solo miraba 100. La selección fija podía monopolizar publicidad gratuita.
- Promoción anterior: 30 días por solicitud aprobada, sin fecha de lanzamiento explícita, cupos ni exclusión por negocio. Texto público acoplado a 30 días. Analítica externa bloqueada por política, por lo que no sirve para prometer medición comercial activa.
- Limitación SDK: filtros después de leer no reducen coste, no hay API documentada de índices secundarios ni consulta por territorio. No se inventan índices.

## Alcance implementado, pendiente de CI
Paginación comercial completa en servidor con páginas de 100, caché local 30 s y single-flight, respuesta de hasta dos anuncios, preservación de prioridad/reservas heredadas, rotación de promociones gratuitas. Presupuestos explícitos de 200 páginas y 8 MiB; fallo visible si no se completa, sin omitir anunciantes silenciosamente. Administración paginada de campañas, estados y métricas.

Configuración comercial central con lanzamiento null, 20 cupos/30 días fundador/30 días convocatoria/14 días estándar; aprobación transaccional, recibo por negocio normalizado, protección de históricos y no acumulación. No se inventa fecha ni se activan anuncios. Consentimiento publicitario explícito; solicitudes antiguas sin él no se aprueban automáticamente. Configuración y auditoría incluidas en respaldo.

Seis HOUSE_AD con destinos reales, botón comercial permanente en menú y portada, mensajes de promoción consultados al servidor. Tarifas 2990/5990/9990/19990 CLP solo referenciales, no aprobadas, IVA pendiente configurable. No hay cobros ni suscripción. Métricas comerciales de primera parte separadas de HOUSE_AD; clics no son ventas. Edición/renovación gratuita con token y consentimiento sobre publicaciones directas, sin modificar cargos del Radar ni fechas editoriales.

## Pruebas y pendientes
Pruebas locales de reglas, transacciones y paginación aprobadas; compilación y navegador pendientes de CI. La terminal bloqueó npm con EPERM; no se reintenta ni se pide un permiso rutinario: se utiliza el CI existente con [security checks only]. Datos sintéticos exclusivamente en adaptador local, ninguna escritura o carga de prueba a AppDeploy.

Se medirán 0,20,100,500,1000 y 5000 registros y concurrencia de 1,5,20 promesas en un proceso. No equivale a capacidad ni cuotas reales de plataforma. El almacenamiento de fotos, la carga distribuida, los límites del proveedor y los costos reales necesitan observación controlada aparte. Mantener dictamen NO LISTA para producción por cabeceras ausentes, íconos inválidos, identificación legal y restauración integral no certificada, además de validar esta versión antes de desplegar.

P1: CRM ampliado, exportaciones, audiencia/UTM con privacidad, estadísticas individuales, índices/proyecciones territoriales si suben las cuotas de lectura, reservas contractuales de impresiones, excepciones comerciales auditables y revisión de identidad de negocios homónimos/alias. P2: contratación, pagos, IVA/facturación aprobados y renovaciones consentidas. Ningún componente P1/P2 se presenta como ya disponible.
