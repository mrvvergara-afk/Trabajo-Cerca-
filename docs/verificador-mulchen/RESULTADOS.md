# Corrección del verificador compartido — caso Mulchén

## Resultado

La oferta de 100 cupos **ya estaba publicada antes de esta corrección**. Se volvió a comprobar el catálogo completo mediante el SDK del frontend publicado y la tarjeta en la vista de Mulchén. No se creó otra oferta.

- ID público: `8d3d1102-ba4a-4d77-adcf-59e158cb5013`.
- [Tarjeta en Trabajo Cerca](https://trabajo-cerca-laboratorio-3ojgro.v2.appdeploy.ai/?listing=8d3d1102-ba4a-4d77-adcf-59e158cb5013).
- [Índice oficial](https://www.munimulchen.cl/pagina-central-ofertas-laborales/): Postulación Abierta en la tarjeta que enlaza exactamente al aviso.
- [Aviso original](https://www.munimulchen.cl/oferta-laboral-02-operarios-agrarios-cosecha-de-arandanos/).
- [Metadatos oficiales de WordPress](https://www.munimulchen.cl/wp-json/wp/v2/pages/17979): `date_gmt=2026-10-19T23:37:41`, equivalente al **19 de octubre de 2026, 20:37:41 de Chile**. `modified_gmt` es diferente y no se usa como fecha original.
- Una oferta única, 100 cupos. No son 100 publicaciones.
- La razón social no está nombrada por el municipio. La Municipalidad/OMIL difunde y recibe antecedentes; no se presenta como empleador agrícola.
- Postulación presencial descrita en el aviso: Oficina OMIL, Aníbal Pinto N.º 495.
- La fuente no informa fecha de cierre. No se inventó ninguna.

Lectura oficial fresca: `2026-10-30T09:45:12.259712+00:00`. Comprobación pública final: `2026-10-30T09:45:26.395Z`. Los recibos conservan UTC; la fecha original se muestra también en America/Santiago.

## Base vigente y preservación

No se encontró una rama GitHub que coincidiera íntegramente con AppDeploy. Se compararon las ramas `auditoria/codigo-vigente-2026-10-29` y `fix/estetica-portada-2026-10-29` con los archivos almacenados de la versión publicada.

Primera captura: `1793327520546`, 115 archivos de texto, fijados en `e4b23499c1a5bfcd8e395b111e2b4f1d0a198eab` sobre el repositorio completo. La rama de auditoría solo coincidía en 21 archivos compartidos y difería en 11; la rama completa coincidía en 40, difería en 63 y carecía de 12 rutas nativas. Son diferencias de archivos, no funciones faltantes.

Se detectó después la versión `1793329280879`. Cambió `backend/house-marketing.ts` y `tests/tests.json`. Ambas correcciones recientes quedaron preservadas, sin reinterpretarlas, en:

- Rama base: `baseline/laboratorio-1793329280879`.
- Commit base: `3f0f40c3136f5f0544d3b2fbd369fd125fc7e3a5`.
- Rama de reparación independiente: `fix/verificador-compartido-mulchen-2026-10-29`.
- Código probado: `b3ab70de6b57c2850ef3469802d59b529d80fb8a`.

Esta base identifica una captura de texto verificable del código nativo, no un commit originalmente vinculado por AppDeploy a GitHub. Autenticación y tres iconos binarios se excluyeron de la captura y no se tocaron. No es un respaldo de datos ni una restauración completa.

La comparación de reparación contra esa base no incluye cambios de cron, publicidad, CSS, permisos, autenticación ni datos. El cambio de frontend se limita a mensajes de revisión.

## Causa concreta

El HTML municipal contiene un `article.cargo`, encabezado h3 e instrucciones presenciales, pero no JobPosting ni una fecha visible en los formatos esperados. B buscaba fecha dentro del HTML y enlaces de postulación, mientras la fecha original vive en el endpoint oficial de WordPress. Los campos quedaban incompletos y el auxiliar no podía completar el envío automático.

La revisión final compartida devolvía `structured_jobposting_missing`. La existencia del índice oficial marcado abierto y la vía presencial no llegaban a ese verificador como evidencia alternativa.

El puente B hacia la bandeja y la entrada C local **ya existían en el código vigente y se conservaron**. No se reutilizó la conclusión histórica de que B carecía de puente.

## Implementación

Se añadió un adaptador para una plantilla municipal revisada, no una autorización genérica para HTML arbitrario. Comprueba:

1. Dominio oficial HTTPS, URL individual y canonical coincidente.
2. Un cargo dentro de la plantilla identificada.
3. Estado abierto/cerrado en la tarjeta exacta del índice; no toma el estado de ofertas vecinas.
4. Endpoint WordPress ligado al ID del aviso; `id`, `type`, `status` y `link` coincidentes.
5. Fecha original válida en `date_gmt`; no sustituye por modificación, rastreo o carpeta de imagen.
6. Lugar de trabajo dentro del aviso, distinto de la dirección de la OMIL.
7. Instrucciones presenciales utilizables y cupos leídos del cuerpo.
8. Evidencia con URL, hashes y fecha de comprobación.

Se mantiene el lector HTTP con robots, límites, HTTPS y orígenes autorizados; el JSON se habilita solo mediante modo explícito. Motor A cuenta esas lecturas dentro de su límite existente. No se cambian horarios.

La antigüedad se conserva como dato original. Un estado oficial abierto comprobado puede acreditar vigencia sin fabricar una fecha de cierre: su evidencia necesita renovarse en 24 horas. Un cierre explícito prevalece; evidencia vencida pasa a renovación pendiente, no a una afirmación de cierre real. Se conserva el corte de investigación administrativa ya existente; esta oferta del 19 de octubre lo cumple.

B puede recuperar una detección anterior sin fecha y completar la evidencia mediante la misma verificación. Si los metadatos dejan de acreditar la fecha, no sustituye esa falta con campos antiguos guardados. C local llega por su circuito existente de bandeja y verificación. No se relajaron las firmas del transporte externo de C.

## Archivos de aplicación modificados

Rutas relativas a `integrations/appdeploy/house-ads/`:

| Archivo | Cambio |
|---|---|
| `backend/municipal-offer-verification.ts` | Lector del aviso y comprobación de estado, identidad, fecha original y postulación. |
| `backend/public-source-verification.ts` | Coordinación compartida de evidencias oficiales, con HTTP y robots existentes. |
| `backend/public-source-verifier.ts` | Contrato tipado de evidencia oficial y cupos; conserva el verificador previo. |
| `backend/public-source-http.ts` | Lectura JSON explícita para metadatos, sin ampliar permisos de origen. |
| `backend/free-public-sources.ts` | Motor A: usa verificación compartida, cuenta lecturas adicionales y conserva evidencia. |
| `backend/radar-review-check.ts` | Verificación final compartida para revisión, B y C; deduplicación conservada. |
| `backend/index.ts` | La revalidación ordinaria utiliza la misma verificación oficial. |
| `backend/offer-retention.ts` | Separa antigüedad original, cierre explícito y renovación del estado abierto. |
| `backend/motor-b-independent.ts` | Motor B: extrae fecha y postulación oficiales sin depender de JobPosting. |
| `backend/radar-review-queue.ts` | Traslada evidencia al candidato de verificación, sin publicar directamente. |
| `backend/radar-admin-verification.ts` | Conserva evidencia al aprobar y compara fechas por instante, no por formato Z/.000Z. |
| `backend/motor-b-auxiliary.ts` | Recupera candidatos previos; una evidencia incompleta actual no se suple con campos antiguos. |
| `src/radar-review-inbox.tsx` | Mensajes administrativos específicos para evidencia faltante y reintentos. |

Además se agregaron scripts de QA, una captura histórica oficial identificada, pruebas y el workflow gratuito `.github/workflows/verificador-mulchen.yml`. La captura histórica solo sirve como fixture de pruebas. Las pruebas finales también utilizaron HTML, índice y metadatos descargados nuevamente desde las fuentes oficiales.

## Pruebas y resultados

[Actions — ejecución final](https://github.com/mrvvergara-afk/Trabajo-Cerca-/actions/runs/41035682826).

- **17 pruebas aprobadas, cero fallos.**
- **TypeScript estricto aprobado** para el cierre de dependencias del verificador compartido.
- Compilaciones esbuild de backend y frontend aprobadas, con SDK externo para inyección por plataforma.
- Fuentes oficiales HTTP 200; robots respetado.
- Navegador Chrome con el React y SDK públicos reales: catálogo completo, oferta encontrada y su ID presente en la paginación territorial de Mulchén.

| Ruta independiente probada | Resultado |
|---|---|
| A, recolector real `runFreePublicSources` con evidencia oficial | Verifica 1 aviso y conserva fecha original, cupos y prueba de estado abierto. |
| B, parser real y auxiliar sobre una detección sin fecha | Recupera los campos; la revisión encuentra `already_in_public_catalog` y no crea otra oferta pública. |
| C local, handler real de descubrimiento | Descubre la tarjeta; llega al verificador común y reconoce la publicación existente. |
| B y C con fecha original retirada de la evidencia | Quedan pendientes, sin usar `modified_gmt` ni campos antiguos para aprobar. |
| Reenvío administrativo repetido | No elude la deduplicación. |
| Aprobación administrativa de un candidato aislado | Conserva la prueba oficial, 100 cupos y la misma fecha aunque esté escrita con Z o .000Z. |

También se probaron cierre exacto, ofertas vecinas cerradas, origen de metadatos incorrecto, evidencia antigua, lugar de trabajo incorrecto y falta de instrucciones.

Los motores ejecutaron su código real **con base de datos aislada que modela el contrato SDK**; el lector documental se sustituyó solo en estos ensayos de HTML. Esto no prueba escritura en la base productiva, PDF/OCR ni el transporte GitHub/OIDC externo de C. No se ejecutó toda la batería histórica del repositorio ni se declara aprobada. El navegador sí utilizó el SDK real, en lectura.

## Diagnóstico de publicación

La oferta es legítimamente verificable con los documentos oficiales disponibles. **No falta ahora una fecha original ni una forma de postular: ambas están acreditadas.** La ausencia de razón social se conserva explícitamente porque el municipio no la informa.

Ya existe 1 publicación verificada con la misma URL y aparece en Mulchén. Por tanto, la acción correcta es reconocer/revalidar esa identidad, no publicar una copia. Incremento atribuible a este trabajo: **0**.

Esta corrección no fue desplegada. La presencia pública comprobada corresponde a la aplicación ya publicada, no a una supuesta publicación realizada por la rama. Un futuro despliegue autorizado debe volver a comparar la versión vigente y utilizar el parche acotado, no sustituir toda la rama.

## Entrega

- [Recibos permanentes](EVIDENCIA.json).
- [Parche de 13 archivos fuente](PARCHE-FUENTE.json), sin credenciales, QA ni cron.
- Artefacto `mulchen-evidence` en Actions: capturas de navegador, fuentes oficiales actuales, compilaciones y resultados.

No se fusionó con main, no se desplegó ni se modificaron horarios. No se contrataron servicios ni se activaron APIs de pago.
