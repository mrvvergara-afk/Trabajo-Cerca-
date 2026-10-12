# Reparación aplicada en Trabajo Cerca Laboratorio

Autorización: el usuario indicó «Ok aplica» después de revisar la entrega del radar.

- App: [Trabajo Cerca Laboratorio](https://trabajo-cerca-laboratorio-3ojgro.v2.appdeploy.ai/).
- Versión aplicada: `1791772015605`.
- Fecha de versión: 11-10-26, 11:26:55 p. m. (America/Santiago).
- Snapshot base auditado: `1791755107051`.
- Rama del repositorio: `repair/radar-audit-2026-10-11`.
- `main` permanece en `fab392b824e4100a4bba6dfe9289825297d24707`. No se integró la reparación en esa rama.

## Cambios aplicados

Se aplicaron los cuatro cambios de [radar-repair.json](../integrations/appdeploy/radar-repair.json) en el backend del laboratorio:

1. Metadatos de intento de enriquecimiento y referencia al ID de la oferta guardada.
2. Rotación de candidatos y cursor persistido para leer una página por ejecución de enriquecimiento.
3. Verificación con cursor y confirmación de resultados de escritura; un fallo no se contabiliza como éxito.
4. Protección de la reconstrucción del feed: si quedan páginas del inventario por leer, conserva el feed existente y evita publicar un subconjunto.

Se comprobó el código almacenado después del despliegue: cada ancla final de los cuatro cambios aparece exactamente una vez.

## Datos, credenciales y automatizaciones

- No se reinició, borró ni migró el inventario histórico.
- No se configuraron ni cambiaron credenciales.
- `cron.json` coincide con el calendario anterior; no se agregaron ni aceleraron tareas.
- No se iniciaron manualmente recolectores, Actors, OCR o búsquedas con IA.
- Las tareas automáticas existentes conservan su calendario; esta aplicación no habilita nuevos proveedores.

## Validación ejecutada

| Comprobación | Resultado |
| --- | --- |
| Pruebas Python del radar | 31 aprobadas. |
| Pruebas de funciones originales y reparadas de AppDeploy | 8 aprobadas con DB y transporte simulados. |
| Pruebas del checkpoint de Actions | 4 aprobadas. |
| Backend completo con parche | Parseo de sintaxis TypeScript correcto. |
| Despliegue AppDeploy | `ready`, versión `1791772015605`. |
| Errores reportados | Frontend: 0. Backend: 0. |
| Snapshot QA de escritorio y móvil | Sin errores de frontend ni red reportados. |
| Snapshot posterior | Los cuatro cambios presentes; calendario original conservado. |

Las **43 pruebas locales** se ejecutaron sin consultas a fuentes laborales, IA ni escrituras reales en AppDeploy. El backend completo pasó por la validación y el despliegue nativos; no se presenta el parseo local como una comprobación completa de tipos del SDK.

## Pruebas de QA de este despliegue

La suite previa de la app tenía 23 casos, incluidos barridos y OCR. Se conservó como referencia en el snapshot base y en el paquete local de aplicación. Para este despliegue se configuraron tres casos de lectura:

1. Consultar el inventario existente y recargar.
2. Cambiar entre Angol, Renaico y Toda la zona en móvil.
3. Simular HTTP 503 en la lectura y comprobar error visible y Reintentar.

Los errores simulados también bloquean en QA el envío de analítica externa y la consulta comercial. Las pruebas no crean avisos ni ejecutan motores.

El primer intento de despliegue fue rechazado porque `qa_faults` admite solo errores HTTP 400–599, no respuestas de éxito simuladas. Se sincronizó el snapshot almacenado y se corrigió únicamente la suite de QA antes de reintentar; el backend reparado ya estaba almacenado y no se volvió a reemplazar.

AppDeploy devolvió un snapshot QA sin errores, pero no un resultado individual de los tres casos ni un ID de grupo e2e. La consulta de detalle devolvió `INVALID_ARGUMENT`. **No se contabilizan esos tres casos como pruebas individuales aprobadas** ni se declara una publicación laboral real comprobada.

## Pendientes que esta aplicación no resuelve

- El radar de GitHub todavía prepara una cola local; falta la ingesta autenticada hacia AppDeploy y la confirmación de publicación por ID.
- Falta construir y promover un snapshot completo del feed por checkpoints para inventarios de más de 200 registros. Hasta entonces la protección conserva el feed previo cuando detecta lectura incompleta.
- Quedan pendientes la persistencia durable del radar externo, la deduplicación global y la verificación propia de OMIL, RSS y redes sociales.
- No se midió un incremento real de publicaciones después de este despliegue, porque esa medición exigiría ejecutar el flujo contra fuentes reales. No se dispararon proveedores de pago para obtener ese contador.

El [informe de auditoría](auditoria-radar-2026-10-11.md) y el estado `prepared_only_not_deployed` del archivo de parche describen la entrega previa. Este documento registra su aplicación posterior en el laboratorio.

El despliegue está aplicado en la app del laboratorio. La rama principal de GitHub continúa sin integrar.
