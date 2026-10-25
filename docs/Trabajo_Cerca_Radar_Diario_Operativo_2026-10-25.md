# Trabajo Cerca — Operación del radar gratuito y control diario

**Instalación:** 25 de octubre de 2026, repositorio `mrvvergara-afk/Trabajo-Cerca-`, rama `main`.

## Qué quedó configurado

- `.github/workflows/trabajo-cerca-radar-diario.yml`: ejecución programada cada día a **06:17, 12:17 y 19:17, zona America/Santiago**.
- `automation/trabajo_cerca/fuentes_diarias.json`: 14 localidades (incluidos **Mininco y Quilaco**), 40 enlaces del rastreo manual, 24 páginas oficiales/prensa/portales y 25 perfiles sociales referenciales.
- `automation/trabajo_cerca/radar_diario.py`: consulta hasta 1/3 de las 64 referencias web y de avisos por corrida; en tres corridas cubre el inventario completo. Da prioridad a la lectura por fuente y al contraste contra **todas las páginas del feed existente**, hasta el límite de seguridad.
- Extracción HTML y OCR/PDF local cuando existe acceso permitido, respetando `robots.txt`, sin redirecciones no autorizadas, sin autenticar como otra persona.
- Cada ejecución guarda `resumen.json`, `fuentes_auditadas.json`, `candidatos_revision.json` y `resumen.md` como **artefacto descargable de GitHub Actions**, retenido tres días.
- La cola separa fechas originales no acreditadas, vigencia, fuente y municipios de trabajo solo reportados; las coincidencias por URL contra el feed son **duplicados confirmados**, no publicaciones nuevas.
- Si el feed real devuelve 503, el trabajo informa fallo, deja evidencia y **no afirma que los avisos no existan**.
- Cada uno de los 25 perfiles sociales queda inventariado como `no_consultada_sin_acceso_publico_autorizado`; no existe scraping de Facebook/Instagram, se requiere API pública autorizada o recepción voluntaria de afiches.

## Tres motores coordinados

1. **Recolector de fuentes públicas:** municipios, OMIL, noticias, ofertas concretas y agregadores accesibles legalmente. GitHub Actions por tercios del inventario.
2. **Lector y normalizador:** texto de HTML y PDF con OCR gratuito local, revisión de fecha y deduplicación, sin inventar vigencia.
3. **Publicación de Trabajo Cerca:** los siete crons actuales de AppDeploy **no se tocan**. El paso desde los archivos `candidatos_revision.json` hacia `radar_candidates` aún requiere importador autenticado, idempotente y prueba de recuperación; no existe un enlace automático de escrituras a AppDeploy desde GitHub.

## Qué debe verificar el operador

En GitHub ir a **Actions → Trabajo Cerca | Radar diario gratuito** y abrir la ejecución más reciente. Revisar `candidates_to_review`, `counts_by_status`, `feed_complete`, y descargar el artefacto. Un resultado `candidato_fecha_pendiente` NO representa vacante comprobada.

Los 40 avisos de origen se conservan como referencias; **12 pendientes/exclusiones del ZIP original no se han aprobado ni importado**. El contraste anterior de 40 identificó diez coincidencias exactas, dos posibles duplicados cruzados, un conflicto territorial y 27 sin coincidencia; los 27 requieren revisión contra el inventario ACTUAL, sin declarar nuevas publicaciones por ese solo hecho.

Priorizar municipios sin avisos recientes comprobados (Renaico, Purén, Ercilla, Mininco, Quilaco); la fuente puede pertenecer a una comuna y el **puesto de trabajo a otra**. No añadir una comuna por el domicilio del publicador.

## Seguridad, reversión y costos

Los trabajos usan `permissions: contents: read`, sin secretos, sin servicios comerciales, sin acceso a bases de datos de la app, sin acciones de escritura y sin habilitar publicadores. Código y datos del catálogo quedan intactos; el despliegue de AppDeploy no fue cambiado por esta instalación.

GitHub indica que los *standard GitHub-hosted runners* son gratuitos para repositorios públicos; el almacenamiento y cuotas de los artefactos requieren atención. Los informes se retienen solo tres días para limitar consumo. No hay garantía de inicio a minuto exacto: GitHub puede retrasar las ejecuciones.

**Detener la automatización:** deshabilitar solo el workflow `Trabajo Cerca | Radar diario gratuito` desde Actions, sin cambiar los siete crons originales. Eliminar la programación de GitHub no elimina avisos ni datos existentes. Revertir los commits que crearon `automation/trabajo_cerca/` y su workflow restaura el estado del código sin afectar AppDeploy.

**Próximo bloqueo real:** importación privada e idempotente con revisión humana de fechas, vigencia, lugar y postulación. Hasta que exista, el motor genera reportes y candidatos, **NO nuevas ofertas en la portada**.
