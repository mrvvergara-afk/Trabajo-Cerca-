# Trabajo Cerca — prueba de recuperación independiente en Cloudflare (sin migración productiva)
**Fecha:** 21-11-2026. **Estado:** propuesta de arquitectura para PoC sintética; NO implica contratación, traspaso de datos, ni aprobación de Cloudflare para producción.

## Motivo de esta evaluación

AppDeploy Support confirmó que su backup Plus es manual con pausa; no existe API pública de backup/restauración automatizada, ni restore de PROD a LAB, ni credencial de servicio por app, ni blue/green garantizado. Ver `docs/releases/DECISION_APPDEPLOY_2026-11-21.md`.

**Objetivo de aceptación:** antes de tocar un registro real, demostrar con una aplicación **sintética y aislada** que se pueden ejecutar respaldo consistente de datos y archivos, cifrado externo, restauración en **un entorno diferente**, cotejo de integridad, publicación gradual y reversión del código sin tocar datos.

## Capacidades y límites verificados (documentación oficial 21-11-2026)

1. **Cloudflare Workers** tiene despliegues graduales entre versiones y rollback de código; hay riesgo de incompatibilidad entre versiones de Workers y los recursos compartidos. Por eso los cambios de esquema deben ser compatibles al menos entre versiones coexistentes.
   https://developers.cloudflare.com/workers/versions-and-deployments/gradual-deployments/
   https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/
2. **Cloudflare D1** tiene Time Travel, pero su restauración **sobrescribe la MISMA base** y cancela consultas en curso. NO sirve por sí sola como ensayo en otra base. La vía de ensayo aislado es **exportar a SQL e importar a una base D1 distinta** mediante comandos oficiales, verificando después filas, claves y resúmenes de contenido. La exportación puede bloquear solicitudes mientras dura y tiene restricciones de tamaño/compatibilidad.
   https://developers.cloudflare.com/d1/reference/time-travel/
   https://developers.cloudflare.com/d1/best-practices/import-export-data/
3. **Cloudflare R2** admite reglas de retención por bucket (bucket lock) que previenen sobreescritura/borrado durante el período definido. Sin embargo, su API compatible S3 **no admite PutBucketVersioning**; por eso diseñar archivos de respaldo con claves únicas/inmutables, manifiestos SHA-256 y una copia cifrada **fuera de la misma cuenta/proveedor**. No presentar R2 por sí solo como un sistema de backup externo completo.
   https://developers.cloudflare.com/r2/buckets/bucket-locks/
   https://developers.cloudflare.com/r2/api/s3/api/

## Etapa 0 — infraestructura de ensayo SIN datos reales

Crear recursos separados, con credenciales y cuotas acotadas:
- Worker `tc-dr-proof-lab` de acceso restringido, sin anuncio ni SEO.
- D1 `tc-dr-proof-source` con datos sintéticos y D1 `tc-dr-proof-restore` independiente para el ensayo de restauración.
- R2 `tc-dr-proof-assets` con imágenes sintéticas y `tc-dr-proof-backups` con bloqueo de retención de objetos; copia cifrada a otro proveedor o cuenta independiente.
- Ninguna cuenta de usuario ni clave de AppDeploy, ni contactos de personas reales, ni imágenes privadas de Trabajo Cerca.

No provisionar hasta tener una conexión autorizada de Cloudflare y presupuesto/alcance explícitos. No enviar tokens por el chat ni subirlos a GitHub.

## Etapa 1 — ensayo reproducible de recuperación

1. Crear un conjunto de datos sintéticos: ofertas laborales, compañías, anuncios propios y comerciales, sublocalidades (Mininco→Collipulli; Coihue→Negrete), fechas y registros de rechazo, de forma que cubra el catálogo principal de 12 comunas y los filtros secundarios de Temuco/Los Ángeles.
2. Registrar baseline, total de registros por tabla, huellas de filas ordenadas y de archivos; preservar identificadores/relaciones de referencia sin incluir PII en los comprobantes.
3. Obtener dump SQL íntegro de la fuente D1, medir duración y comportamiento con escrituras concurrentes. Probar que las escrituras durante la exportación no invalidan el estado; si ocurre, bloquear GO y definir pausa breve explícita o mecanismo consistente que se pueda demostrar.
4. Guardar respaldos SQL + archivos con cifrado externo, claves únicas por ejecución, SHA-256 por objeto y manifiesto global. Verificar permisos y protección contra modificaciones.
5. Importar **en la base RESTORE independiente**, restaurar archivos en un bucket de prueba y comparar tablas/huellas/archivos. Un SQL importado sin tablas/filas válidas NO equivale a restauración aprobada.
6. Emitir recibo JSON con `baseline`, hashes, conteos, resultados, fecha, `RPO`, `RTO`, tasas de error, IDs de entornos y pruebas. Certificar mediante firma Ed25519 **solo tras** verificar la restauración real; guardar llave privada fuera de app/repositorio.
7. Repetir con fallas simuladas: archivo faltante, snapshot desfasado, SQL truncado, error 429, permisos insuficientes, esquema incompatible y concurrencia. Todas deben resultar en NO-GO sin tocar el servicio de referencia.
8. Desplegar gradualmente una versión de Worker con cambio inocuo y comprobar contrato API/catálogo/ads/admin; luego probar rollback de código. No usar este éxito para afirmar que datos han sido restaurados.

## Etapa 2 — estudio de migración AppDeploy→estado externo

No iniciar hasta aprobar la etapa 1.
- Elaborar mapa real de tablas/índices/IDs, almacenamiento e imágenes, autenticación, publicidad, feed atómico, trabajos programados y motores A/B/C/D/ChatGPT/Gemini. No asumir compatibilidad 1:1 del SDK `db`/ `storage` de AppDeploy con D1/R2.
- Preparar extractor de transición en modo lectura. `backend/admin-backup.ts` usa exportación paginada `rolling_non_atomic`; jamás afirmar que esa exportación sea un snapshot consistente.
- Diseñar ventana aprobada, mecanismo de captura de nuevas escrituras y reconciliación por IDs, hashes, estado de publicación y versiones del feed.
- Probar recuperación y verificación con volúmenes reales **sanitizados y custodiados** antes de cambiar rutas públicas. Toda migración de autenticación exige procedimientos de consentimiento y restricciones de acceso.
- Diferenciar cambio de dominio/origen e instalación PWA Android de un despliegue de UI; actualizar íconos/manifest sin romper apps existentes.
- Definir supervisión de error, coste mensual, cuota diaria, retención externa, DNS, reversión y planes ante corte o datos divergentes.

## Matriz GO / NO-GO del nuevo circuito

| Prueba | Criterio GO |
|---|---|
| Backup consistente | Completo, cifrado, con hash íntegro y captura de escrituras controlada |
| Restore independiente | Importación en otra DB + bucket privado; filas y archivos cotejados |
| Seguridad | Tokens por recurso mínimos, rotación, cero datos o secretos en logs |
| Catálogo | Sin pérdidas, lecturas consistentes, municipios correctos |
| Despliegue de Worker | Gradual, compatible entre versiones, verificaciones pospublicación |
| Reversión | Código recuperado y datos preservados; procedimiento DR probado |
| Evidencia | Firmada por proceso independiente; el propio botón no puede certificarse |
| Costes | Cuotas y presupuestos medidos, no promedios supuestos |

**Recomendación:** empezar por la PoC sintética D1+R2 y sus pruebas DR, sin migrar Trabajo Cerca ni prometer automatización autónoma todavía. Si falla la prueba, evaluar base SQL gestionada con PITR/restauración en clon externo antes de decidir plataforma final.
