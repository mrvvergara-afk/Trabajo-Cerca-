# Trabajo Cerca — Estrategia de captura histórica e incremental

## Alcance común
Todas las fuentes: OMIL, municipalidades, radios y medios, Facebook e Instagram públicos, LinkedIn, Chiletrabajos, Indeed, Computrabajo, Laborum, Jobsora y empleadores directos. No se asume que una fuente sea técnicamente accesible; respetar acceso público, condiciones y límites de cada servicio.

## Fase 1: Backfill de 60 días
- Descubrir publicaciones de los 60 días anteriores, recorrer paginación y archivos cuando existan.
- Guardar fuente, URL canónica, ID externo si existe, fecha original, fecha de descubrimiento, texto, imagen/documento de evidencia cuando esté permitido, comuna real del trabajo, cargo, empresa y estado.
- Separar descubrimiento de verificación: **una publicación histórica no equivale a una oferta activa**.
- No inventar fechas: cuando no se conozca la fecha original, marcar desconocida y enviar a revisión.
- Usar cursor y checkpoint por fuente; registrar páginas recorridas, cobertura real y errores; no declarar completado si hubo bloqueo o paginación pendiente.
- Deduplicar por ID de origen/URL canónica y huella de cargo+empresa+comuna+fecha, conservando evidencias y cambios.

## Fase 2: Incremental diario
- Consultar publicaciones recientes desde el cursor con solapamiento de 3–7 días para cambios y publicaciones tardías.
- Revalidar anuncios abiertos y fechas límite, y archivar vencidos sin eliminarlos del histórico.
- Fuentes con cambios o alta productividad: mayor frecuencia; fuentes con bloqueos: diagnóstico, nunca éxito ficticio.
- Procesar primero las fuentes locales difíciles; no permitir que portales masivos desplacen la cuota de captura.

## Estados
`descubierta`, `pendiente_verificacion`, `vigente_verificada`, `publicada`, `cerrada`, `vencida`, `descartada`.

## Publicación
- Comuna real en las 13 localidades objetivo, puesto identificable, fecha/evidencia de vigencia, mecanismo de postulación y fuente.
- La ventana de búsqueda histórica de 60 días no autoriza publicar ofertas de 60 días como vigentes.
- Conservar avisos vigentes y actualizar/archivar por estado, nunca reiniciar el feed a cero por un fallo del recolector.

## Indicadores por fuente
Páginas/publicaciones examinadas, nuevas, repetidas, candidatas, verificadas, publicadas, vencidas, errores, última ejecución, cursor y cobertura del backfill.

## Límites de implementación
El radar experimental de GitHub hoy solo cubre páginas municipales públicas y Google News RSS. Este documento define la arquitectura objetivo; la conexión efectiva a redes sociales y portales requiere adaptadores individuales y validación técnica. No existe aún una ingesta verificada hacia AppDeploy.
