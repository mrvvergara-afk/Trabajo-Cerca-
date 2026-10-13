# Avisos recientes y ejecución horaria — 13 de octubre de 2026

Esta continuación comprueba la entrada de avisos recientes y prepara la revisión de la programación, después de los cuatro pilotos documentales. No modifica `main`, credenciales ni cuotas de proveedores. El resultado de los pilotos anteriores está en [conexión de documentos](conexion-documentos-2026-10-13.md).

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

Se preparó un diagnóstico gratuito de hasta seis canales institucionales enlazados desde páginas primarias, alternando Facebook e Instagram. Solo registra estado HTTP, formato, tamaño, título y cantidad de referencias a publicaciones; no conserva HTML, cookies ni tokens. Un perfil sin enlaces legibles sigue sin cobertura acreditada. El diagnóstico no inicia sesión ni llama a servicios de captura pagos.

## Pruebas y piloto

Las pruebas nuevas comprueban selección de fuentes revisadas, cuotas, deduplicación, prioridad documental, relectura y conservación del histórico, además del tratamiento de una pantalla de acceso social. Los resultados del conjunto completo y la observación de IDs se completarán con el piloto real. Detectar o firmar una oferta no se declara publicación hasta comprobarla en el feed completo mediante el SDK.

## Activación del horario

El workflow conserva `17 * * * *`. GitHub ejecuta las programaciones desde la rama predeterminada, `main`. La rama independiente permite ejecutar pilotos explícitos; no activa un lector horario permanente. La app ya admite el lote firmado del workflow exacto del repositorio desde `main`, pero el código actual de esa rama todavía no lo produce.

La revisión debe comprobar pruebas, evidencia de ingesta/feed y preservación del histórico antes de integrar el flujo a `main`. No se creó un servicio pago ni un mecanismo de autoejecución para sustituir esa revisión. Sigue pendiente acreditar un aviso social/documental reciente completo y un recorrido histórico de 45 días en cada canal.
