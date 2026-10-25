# Trabajo Cerca — Captura territorial reciente y preparación para despliegue
**Fecha de auditoría:** 25 de octubre de 2026  
**Estado:** piloto validado en GitHub Actions; **no incorporado aún al publicador**.

## Comprobación técnica

- Corrida exitosa: https://github.com/mrvvergara-afk/Trabajo-Cerca-/actions/runs/40201269292
- Artefacto de evidencia: ID **12601143621**, `lector-documental-solo-lectura` (JSON: auditoría de cola, prensa directa, prensa indexada, reconciliación y robots).
- El bloqueo de las noticias locales se debía a `www.traiguencity.cl` (URLError); el dominio **`traiguencity.cl`** sirve `robots.txt` con HTTP 200 y permitió lectura conforme a robots.
- **2 índices** de prensa consultados (General y Laboral Traiguén); **7 vínculos** de detalle examinados, algunos repetidos y antiguos.
- **4 artículos recientes únicos** clasificados para revisión; **2 antiguos** (agosto y junio) descartados. **6 documentos únicos** en la conciliación de todas las fuentes leídas: 4 recientes más 2 antiguos. La consulta de índice produce 11 filas de evidencia por repetir ciertos artículos; la conciliación no confunde visitas con ofertas.
- Extracción conservadora de cuerpo de artículos, fecha `article:published_time` / `time datetime`, análisis de vacantes docentes, directivas y otros cargos. Se mantienen fecha original de empleador **sin acreditar** y revisión obligatoria.
- Costo proveedores externos = **$0**; escrituras a la app = **0**.

## Artículos detectados y cargos por revisar (no publicados)

1. **OMIL Traiguén — Coordinador/a de Visual Merchandising** (1 cargo). Artículo 22/10/2026. Plazo 26/10/2026. [Fuente](https://traiguencity.cl/omil-traiguen-abre-convocatoria-para-el-cargo-de-coordinador-de-visual-merchandising/).
2. **Colegio Bicentenario Louis Pasteur** (3 cargos): Educación General Básica (primer ciclo), Matemáticas (enseñanza media) y Educación Diferencial. Artículo 23/10/2026. Cierre no confirmado. [Fuente](https://traiguencity.cl/oferta-laboral-colegio-bicentenario-louis-pasteur-de-traiguen-requiere-docentes-para-diversas-areas/).
3. **Departamento de Salud Municipal de Traiguén** (3 cargos): Químico/a Farmacéutico/a, Ingeniero/a en Prevención de Riesgos y Nutricionista. Artículo 18/10/2026; el texto consultado indica cierre 02/11/2026, **pero inicio original 01/10/2026** y no debe equipararse fecha de noticia a fecha original del llamado. [Fuente](https://traiguencity.cl/departamento-de-salud-de-traiguen-abre-concurso-publico-para-incorporar-tres-nuevos-profesionales-en-calidad-de-indefinido/).
4. **DAEM Traiguén** (2 cargos): Director/a Liceo Lucila Godoy Alcayaga y Director/a Escuela Especial Las Lilas. Artículo 17/10/2026, plazo 27/11/2026 según fuente. [Fuente](https://traiguencity.cl/abren-concursos-publicos-para-proveer-los-cargos-de-director-en-el-liceo-lucila-godoy-alcayaga-y-la-escuela-especial-las-lilas-de-traiguen/).

**9 cargos posibles = 4 artículos.** Desglose específico procedente de revisión de las noticias indexadas, no una extracción estructurada automática del lector. Todos requieren corroboración de vigencia, fuente original, localidad de desempeño, instrucciones de postulación y duplicación contra el feed.

La lista JSON manual de revisión está en `docs/candidatos-traiguen-para-revision-2026-10-25.json`.

## Criterios para el próximo despliegue

1. Conservar seguridad, trabajos programados, base de datos y URL existente de AppDeploy; no merge de ramas no aprobadas.
2. Implementar una **bandeja administrativa de revisión** que reciba candidatos sin publicarlos automáticamente. La API de importación deberá exigir `requireAuth`, `requireAdminEmailAllowlist`, esquema estricto, cuotas, protección anti-repetición e integridad de fuente. **No usar endpoint público anónimo que haga escrituras**.
3. Revalidar vigencia y deduplicación contra inventario; establecer recibos verificables por cargo. Solo después habilitar publicación por el pipeline existente de forma auditada.
4. QA de primer aviso visible en móvil y de navegación; comprobar que el conteo del Radar solo aumenta por oferta realmente publicada, jamás por noticia/cargo dudoso.
5. Verificar la independencia de usuarios: el OCR de GitHub no puede requerir que un visitante inicie sesión en Trabajo Cerca.
6. Instagram/Facebook: pilotar solo contenido público realmente accesible o aportes con permiso; no asumir que esta mejora de prensa equivale a automatizar redes sociales.
7. Mantener proveedores externos en $0 y controlar presupuesto/cuotas de GitHub Actions.

## Estado operativo

- La aplicación AppDeploy sigue en snapshot `1792935124802`, estado `ready`, con siete tareas habilitadas.
- **Este cambio solo está en GitHub**, rama `poc/lector-documental-gratis-2026-10-25`, PR #3 en borrador. **No se ha desplegado todavía el recolector integrado**.
- El operador ya dispone de exportación de referencias de documentos protegida en laboratorio, comprobada por HTTP 401 para anónimos.

**Punto de parada:** no se habilitan nuevas escrituras de candidatos ni publicaciones hasta tener una ruta administrativa segura y pruebas aisladas de su funcionamiento.
