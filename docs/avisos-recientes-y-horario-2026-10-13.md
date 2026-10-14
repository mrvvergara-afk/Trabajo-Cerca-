# Avisos recientes y ejecución horaria — 13 de octubre de 2026

Esta continuación consiguió **dos publicaciones nuevas de BNE**, confirmó sus IDs mediante el SDK y prepara la revisión de la programación. No modifica `main`, credenciales ni cuotas de proveedores. El resultado de los pilotos documentales anteriores está en [conexión de documentos](conexion-documentos-2026-10-13.md).

## Problema y corrección

El ciclo documental filtra candidatos de publicadores locales. Las ofertas individuales de BNE tienen un adaptador de portal y no entraban en esa selección. El catálogo y el recolector nativo sí pueden conservar enlaces oficiales, pero eso no demuestra que el lector externo los verifique o emita su lote firmado.

Se añadió `scripts/curated_public_cycle.py`: relee exclusivamente ofertas individuales oficiales revisadas en el catálogo, usa el verificador existente de la página original y entrega solo registros comprobados en esa ejecución. No acepta una fecha de captura ni una localidad del resultado de búsqueda como prueba. El límite es tres lecturas por ciclo, con relectura a las 18 horas para ofertas verificadas y cuatro horas para otros resultados. Se conservan candidatos e intentos fallidos. Los documentos conservan prioridad en el lote combinado, que sigue limitado a tres ofertas.

Se incorporaron dos páginas individuales para el piloto, cuya elegibilidad se comprueba otra vez desde Actions antes de firmar:

| Fuente | Fecha original literal | Cierre literal | Lugar |
| --- | --- | --- | --- |
| [BNE · Coordinador/a Visual Merchandising](https://www.bne.gob.cl/oferta/2026-112312) | 22/09/2026 | 17/11/2026 | Traiguén |
| [BNE · Operativo/a de tienda](https://www.bne.gob.cl/oferta/2026-107065) | 09/09/2026 | 14/10/2026 | Angol |

Estas son ofertas de portal. No se presentan como avisos recuperados de Facebook, Instagram ni OMIL. Las búsquedas también encontraron avisos ya cerrados y puestos en Los Ángeles cuyo empleador menciona Collipulli; no se incorporan por esa coincidencia.

## Acceso social

Las consultas públicas de los perfiles municipales de Renaico y Mulchén, Facebook de Malleco 7 e Instagram de Renaico devolvieron restricciones o errores de lectura. Eso no demuestra que no existan avisos: demuestra que esos accesos no entregaron las publicaciones. OCR interpreta un archivo descargado; no abre una cuenta, un perfil bloqueado ni una publicación inaccesible.

El diagnóstico gratuito comprobó seis canales institucionales enlazados desde páginas primarias, alternando Facebook e Instagram. Solo registra estado HTTP, formato, tamaño, título y cantidad de referencias a publicaciones; no conserva HTML, cookies ni tokens. El límite inicial de 900 kB impedía leer los tres perfiles de Facebook: se corrigió con un límite específico de 4 MiB, sin ampliar el de otros sitios. Traiguén, Renaico y Negrete devolvieron perfiles HTTP 200 de aproximadamente 1 MiB, sin enlaces a publicaciones en el HTML inicial. Instagram de Las Noticias, Renaico y Mulchén devolvió pantallas de inicio de sesión.

Una comprobación adicional con un navegador público nuevo, sin cookies ni credenciales, **sí encontró una publicación enlazada en Renaico y otra en Negrete**. El contenido renderizado cambia respecto al HTML inicial; se acreditó una vía gratuita de descubrimiento para esos dos perfiles. Esto no demuestra que todas las publicaciones sean accesibles ni que los enlaces correspondan a empleo. La lectura individual adicional registra únicamente campos y metadatos acotados; no publica a partir de un perfil, un horario relativo o una coincidencia territorial. Las URLs de publicaciones conservan sus IDs y excluyen parámetros opacos de seguimiento.

La [lectura individual 38487573060](https://github.com/mrvvergara-afk/Trabajo-Cerca-/actions/runs/38487573060) abrió la publicación encontrada en Renaico. Su lectura no aportó una fecha original completa ni cargo, empresa, lugar de trabajo y contacto. Mostraba una antigüedad relativa: no se convirtió en fecha original ni en una oferta verificada. En la segunda lectura de Negrete no apareció el enlace observado antes, por lo que no se acredita acceso estable ni cobertura completa de ese perfil. No hubo una publicación laboral nueva de Facebook en este trabajo.

## Pruebas y piloto

Pasaron **248 pruebas: 110 Python y 138 Node**, en [Actions 38484614196](https://github.com/mrvvergara-afk/Trabajo-Cerca-/actions/runs/38484614196), después de ampliar el límite social. La comprobación con navegador y el conjunto completo también pasaron en [38484931875](https://github.com/mrvvergara-afk/Trabajo-Cerca-/actions/runs/38484931875). Las pruebas nuevas comprueban selección de fuentes revisadas, cuotas, deduplicación, prioridad documental, relectura y conservación del histórico, además de distinguir una pantalla de acceso social de un límite de bytes propio.

El [piloto 38484271444](https://github.com/mrvvergara-afk/Trabajo-Cerca-/actions/runs/38484271444) releyó directamente las tres ofertas BNE y firmó un lote de tres. El escritor existente lo procesó a las **23:35 UTC / 20:35 de Chile**. La [lectura independiente 38487142764](https://github.com/mrvvergara-afk/Trabajo-Cerca-/actions/runs/38487142764), a las 23:55 UTC, confirmó el mismo lote y un feed completo, sin rechazo de ingesta:

| Resultado | ID visible |
| --- | --- |
| Nueva oferta de Operativo/a de tienda en Angol | `1772eb49-18de-4fa8-9bdd-7aea3c9fd9a8` |
| Nueva oferta de Coordinador/a Visual Merchandising en Traiguén | `2f0f424e-d10b-4d7d-98e2-b8e1b29b9783` |
| Oferta anterior de peaje en Negrete, reverificada con el mismo ID | `free-d294f2d92f9e56840e53553adef2420f48b30847` |

Las dos ofertas Chiletrabajos del piloto anterior seguían visibles. El manifiesto `bc3f9bd3-c93a-4d44-90b4-2a68896ea43b` tiene 56 elementos públicos: el aumento fue de dos, no de 56 publicaciones nuevas. Sus tres recibos corresponden a las tres ofertas de este lote; Negrete no es una oferta nueva ni veinte publicaciones separadas.

No hubo ofertas documentales nuevas aptas en esta pasada: tres PDF siguieron sin fecha original comprobable, y dos eran parciales. El snapshot durable `420c571bb1926162787d17cf876487540ac6a6d2` conservó 365 candidatos, 3.219 observaciones, 34 intentos, cuatro checkpoints, ocho runs y los dos recibos anteriores. El lote nuevo y los snapshots previos permanecen guardados. No se ejecutaron proveedores pagos ni se cambiaron los seis cron de AppDeploy.

Después de confirmar el feed, el [monitor de lectura 38487573060](https://github.com/mrvvergara-afk/Trabajo-Cerca-/actions/runs/38487573060) guardó los tres recibos nuevos, sin recolectar ni escribir ofertas. El respaldo posterior `d2f0e2276d8d7070ec34003aa8cbaa6967474c71` mantiene los mismos candidatos, observaciones, intentos, checkpoints y runs, con **cinco recibos** acumulados. El manifiesto durable fue comprobado por separado. El lote firmado se conservó en ese respaldo; no se sustituyeron sus ofertas ni sus fechas. Las 248 pruebas también pasaron sobre el código final de esa ejecución, `37b206f9d42374906ef5247a06b4d6069d63c858`.

Los resultados, límites sociales y recibos quedan en [la evidencia compacta](../integrations/appdeploy/curated-public-observation-2026-10-13.json). Los artefactos de Actions duran siete días; los snapshots SQLite, manifiestos y recibos se conservaron además en la rama durable de datos.

## Activación del horario

El workflow conserva `17 * * * *`. GitHub ejecuta las programaciones desde la rama predeterminada, `main`. La rama independiente permite ejecutar pilotos explícitos; no activa un lector horario permanente. La app ya admite el lote firmado del workflow exacto del repositorio desde `main`, pero el código actual de esa rama todavía no lo produce.

La reparación está en el [PR #1, en borrador](https://github.com/mrvvergara-afk/Trabajo-Cerca-/pull/1). `main` conserva `fab392b824e4100a4bba6dfe9289825297d24707`; no se integró el PR. La revisión debe comprobar pruebas, evidencia de ingesta/feed y preservación del histórico antes de activar el productor horario desde la rama predeterminada.

Para ampliar las fuentes difíciles sin costos, la vía comprobada es leer publicaciones públicas mediante navegador, conservar enlace/fecha/archivo y verificar cada aviso; para canales que exigen acceso se necesitan permisos o una entrega del afiche/PDF por el publicador o la OMIL. No se contrataron servicios ni se añadieron credenciales. Sigue pendiente conectar esa recolección social al verificador con identidad y fecha originales, acreditar un aviso social/documental reciente completo y un recorrido histórico de 45 días en cada canal. Indeed, Computrabajo, LinkedIn, Laborum y Opción Empleo tienen adaptadores preparados, pero no se acredita aquí cobertura ni publicaciones nuevas procedentes de esos cinco portales.
