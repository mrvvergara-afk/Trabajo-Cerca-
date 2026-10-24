# Mejora visual del panel administrativo — 21 octubre 2026

Versión 1792626356497. Se reorganiza título, sesión, preparación para producción e indicadores. CSS acotado a .opsShell para no alterar portada ni tarjetas públicas: tipografía de 14px en controles y líneas, título de 28–40px, tarjetas y columnas adaptadas a móvil, separación consistente y foco visible. Se identifica la sesión con un distintivo y se mantiene su validación existente.

El indicador heredado se denomina Registros activos y los flags de verificación se describen como marcados en el sistema. Se aclara que los conteos internos no equivalen a vacantes vigentes verificadas en portada. No se recalculó ni reconcilió ese total con el feed: sigue siendo una tarea pendiente. Respaldo y operaciones manuales continúan bloqueados, sin afirmar preparación completa para producción.

No se modifican backend, datos, permisos, credenciales, main ni crons. Cero ofertas nuevas. Se conserva la suite existente y se agrega una comprobación visual del panel. Se amplía el observador público para verificar orden del título, legibilidad, ausencia de desbordamiento y controles sin superposición en móvil y escritorio.
