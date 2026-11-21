# Trabajo Cerca — contrato de respaldo y recuperación para publicar versiones

Estado: **NO-GO para publicación autónoma** hasta ejecutar y certificar las etapas de recuperación. Documento técnico de control, **no evidencia de que ya exista un backup nuevo**.

## 1. Alcance del respaldo

La copia asociada a cada actualización debe contener:
- Base de datos **completa**, en un punto consistente de lectura/escritura (no exportaciones paginadas de distintos instantes).
- Archivos/objetos de almacenamiento de la aplicación, incluyendo imágenes y publicidad.
- Identificadores de versión y metadatos técnicos necesarios para restauración; los secretos y tokens **no deben copiarse a GitHub ni a logs**.
- Huellas SHA-256 por bloque y manifiesto global (sin contenido personal en el manifiesto).
- Ubicación cifrada externa e independiente del entorno de producción, con acceso restringido y retención definida.

**Alcance actual:** `backend/admin-backup.ts` devuelve `consistency: rolling_non_atomic`, `fullPlatformBackup:false`, `restoreValidated:false`. No satisface los requisitos anteriores. AppDeploy Plus anuncia funciones de respaldo y restauración (https://appdeploy.ai/faq), pero las acciones MCP conectadas no exponen un comando de copia/restore de datos. No sustituir esa ausencia mediante un exportador parcial.

## 2. Ensayo obligatorio, antes de cada publicación que afecte datos

1. Obtener snapshot oficial completo de AppDeploy en modo consistente y su número de versión/producto.
2. Copiarlo cifrado a destino controlado **fuera de la misma instancia**. Verificar integridad contra manifiesto SHA-256 y permisos de lectura.
3. Restaurarlo en un **entorno temporal privado**, distinto del LAB habitual y de producción.
4. Comprobar tablas, total de registros, claves de integridad, contenido esperado y archivos; registrar recuentos y huellas **sin revelar datos personales**.
5. Ejecutar una prueba de lectura privada limitada, sin hacer público el entorno restaurado. Destruir o aislar el entorno temporal conforme a la política de retención.
6. Emitir un recibo de restauración con resultado, fecha, hash de la copia, hash del informe, RPO/RTO y resultado del cotejo.

El proveedor debe ofrecer una operación segura de exportación y restauración; si el snapshot no es consistente o se pierde un archivo, el ensayo falla y se bloquea el release.

## 3. Certificado independiente firmado

El ejecutor GitHub `scripts/release-runner.mjs` y el backend de administración LAB exigen una **atestación Ed25519** emitida por el proceso independiente de recuperación + QA, nunca por una casilla del navegador ni por una fecha manual.

Estructura del documento JSON firmado (ejemplo de estructura, NO certificado válido):

```json
{
  "schema": "tc-release-attestation-v1",
  "issuer": "independent-recovery-qa",
  "appId": "trabajo-cerca-laboratorio-3ojgro",
  "baseline": "<snapshot-oficial-exacto>",
  "candidateSha": "<sha40-del-commit-aprobado>",
  "payloadSha256": "<huella-sha256-del-paquete>",
  "backup": {
    "scope": "full-app-data",
    "consistency": "atomic",
    "encrypted": true,
    "external": true,
    "manifestSha256": "<sha256-del-respaldo>",
    "completedAt": "<fecha-ISO>"
  },
  "restore": {
    "outcome": "passed",
    "targetAppId": "<entorno-aislado-no-productivo>",
    "recordsMatched": true,
    "filesMatched": true,
    "receiptSha256": "<sha256-del-informe-de-restauracion>",
    "verifiedAt": "<fecha-ISO>"
  },
  "feed": {
    "noEmptyPages": true,
    "noDegradedPages": true,
    "receiptSha256": "<sha256-del-test>",
    "verifiedAt": "<fecha-ISO>"
  },
  "admin": {
    "authenticated": true,
    "passed": true,
    "receiptSha256": "<sha256-del-test-e2e>",
    "verifiedAt": "<fecha-ISO>"
  }
}
```

La firma **se calcula sobre los bytes UTF-8 exactos** del JSON (`crypto.sign(null,bytes,privateKey)`), se codifica base64 y se verifica con la clave pública Ed25519. Cambiar cualquier campo invalida la firma. La clave privada debe permanecer fuera del repositorio y fuera del servidor de la aplicación, en un ejecutor de recuperación protegido con revisión independiente. Nunca generar un certificado indicando éxito sin haber realizado el ensayo.

Los secretos del workflow de GitHub Environment `production` son:
- `TC_RELEASE_PROOF_JSON`
- `TC_RELEASE_PROOF_SIGNATURE`
- `TC_RELEASE_PROOF_PUBLIC_KEY`
- `TC_APPDEPLOY_MCP_TOKEN` (credencial **owner-scoped renovable**, todavía pendiente).
- Variable `TC_RELEASE_ENABLE=approved` **solo** después de las pruebas reales.

En el LAB también se requerirá guardar mediante el flujo protegido de secretos la prueba firmada y la credencial limitada a invocar el workflow. El panel no debe marcar una condición como cumplida solo por un hash con formato correcto: debe comprobar firma, baseline y alcance.

## 4. Condiciones de despliegue y recuperación

- Confirmar que el snapshot de producción coincide con la versión base firmada, que hay un backup completo restaurable y que la versión base sigue disponible para reversión de **código**.
- Confirmar continuidad del feed real de las 12 comunas (sin `degraded`, `feedRebuilding`, `totalsProvisional` o página pública vacía); los listados de Temuco/Los Ángeles siguen secundarios.
- Ejecutar despliegue de **diffs autorizados** desde GitHub, no copiar LAB ni su BD.
- Revisar AppDeploy `READY`, QA automática, catálogo, anuncios y bloqueo de rutas administrativas sin sesión.
- Ante fallo, revertir **código** y validar catálogo; nunca afirmar que esto restaura bases de datos.
- Ante una migración de datos dañina, ejecutar recuperación de BD mediante procedimiento que preserve la información válida creada después del respaldo. No restaurar indiscriminadamente una copia antigua sobre registros nuevos.
- Guardar reporte de éxito/fallo con versión previa y nueva, hashes y estado de recuperación. Una ejecución encolada no es una publicación confirmada.

## 5. Bloqueo concreto pendiente

La **copia completa** y la **restauración de ensayo** todavía NO se ejecutaron. Falta acceso oficial a las capacidades Plus de backup/restore mediante una API autorizada o un proceso controlado del proveedor. No hay credential owner-scoped de larga duración en GitHub, ni firma independiente real, ni evidencia E2E autenticada completa. Mientras tanto el botón está instalado en LAB en modo **no publicable**.

Referencias: [Plan maestro #74](https://github.com/mrvvergara-afk/Trabajo-Cerca-/issues/74), [vigilancia AppDeploy #95](https://github.com/mrvvergara-afk/Trabajo-Cerca-/issues/95).
