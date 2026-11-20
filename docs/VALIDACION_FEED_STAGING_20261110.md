# Validación del catálogo en staging

El flujo `validate-public-feed-staging.yml` ejecuta pruebas estáticas de integridad sobre la copia recuperada de AppDeploy.

**No equivale a una compilación TypeScript ni a una prueba del servicio real.** La integración con AppDeploy requiere aún aprobación de despliegue y pruebas de extremo a extremo.

Criterio de cierre: workflow verde, backend compilado, manifest público accesible, 228 ofertas verificadas preservadas o bajas justificadas, sin degradación de latencia.
