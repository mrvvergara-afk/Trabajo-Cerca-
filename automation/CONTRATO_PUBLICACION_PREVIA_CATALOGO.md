# Contrato de publicación segura y ranking del Motor D

Fecha: 11 de noviembre de 2026. Componente: barrido territorial de las 12 comunas de Trabajo Cerca. Referencia: PR #41.

## Problema resuelto

Tras el PR #40, el Motor D descubrió y preparó un lote con una práctica profesional SERFONAC que **ya estaba en el catálogo público**. El importador de AppDeploy tiene su propia defensa contra duplicados, pero los lotes sobrantes generan trabajo, riesgo de falsas métricas y una cola difícil de auditar.

Por otro lado, el ranking tenía un contador `ready` que dependía del campo opcional `express_ready`, normalmente ausente en candidatos del escáner real. Así no representaba fielmente las ofertas elegibles que encontraba cada fuente.

## Reglas de operación

1. **Antes de crear lotes reales**, el productor lee *todo* el feed público (paginación completa, sin degradación, con intentos acotados) y compara cada oferta por identidad del enlace y coincidencia exacta de cargo + empresa + comuna real.
2. Oferta ya existente: **no entra al lote**. Oferta realmente ausente: conserva las validaciones actuales de título, empleador, fecha original, comuna y postulación.
3. Catálogo incompleto o inaccesible tras tres intentos: **cero lotes creados**, registrar `blocked_catalog_incomplete`. No asumir que la oferta no existe; no inventar cifras de cero vacantes.
4. Si no hay ofertas elegibles: registrar `no_ready_candidates` sin afirmar que el feed público fue consultado.
5. Escribir `automation/motor_d_discovery/publication_gate.json` en *cada* ciclo con estado, fecha, total elegible, duplicados omitidos, lotes preparados, registros públicos revisados y error si existió. La automatización conserva este comprobante junto al inventario y el historial.
6. El ranking se calcula mediante la misma clasificación del publicador (`EXPRESS` y `RECUPERACION`); los enlaces de directorios, páginas con palabras laborales, fichas sin empresa/fecha/comuna o repetidos no ganan prioridad de publicación.
7. La prioridad nunca excluye fuentes del barrido: seguir intentando el **100 % del inventario público activo** y registrando los bloqueos. No eludir limitaciones de Indeed, Computrabajo, Instagram o Facebook.

## Estado de fuentes pendiente de mejora (corte del último barrido)

- **199 entradas** en el control: 172 consultas públicas y 27 perfiles sociales.
- **172/172 públicas intentadas**, **76 pendientes de uso efectivo**.
- Desglose: 46 consultas bloqueadas o fallidas; 27 perfiles sociales sin lector autorizado; 2 páginas que necesitan extractor especial; 1 fuente nacional sin filtro territorial acreditado.
- Los bloqueos más repetidos afectan búsquedas en Indeed y Computrabajo. Estrategia permitida: priorizar portales oficiales ATS, empresas y municipios con acceso público; registrar nuevas fuentes, nunca fingir respuestas a sitios bloqueados.

## Pruebas antes de fusionar

- Catálogo completo: omite oferta publicada y envía la nueva sin duplicado.
- Catálogo incompleto: no escribe índice ni lote y deja comprobante de bloqueo.
- Evita estatus de catálogo desconocidos; niega aprobación sin prueba.
- Ranking: una ficha con evidencia completa mejora la prioridad; los avisos incompletos no, y reabrir la misma ficha no suma rendimiento otra vez.
- Mantiene íntegro el inventario de 12 comunas y los lotes históricos en cuarentena.
- **No modifica AppDeploy**, no hace despliegue ni publica desde una rama de PR.

## Puerta de activación

El cambio en GitHub se prepara y verifica en PR; la fusión a `main` activa las siguientes pasadas del Motor D. Confirmar pruebas automáticas completas y pedir autorización de activación antes de fusionar. AppDeploy sólo requiere aprobación separada si se modifica su despliegue.
