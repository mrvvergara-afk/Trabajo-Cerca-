# Trabajo Cerca — Inventario verificable de fuentes para revisión de DeepSeek

**Corte:** 9 de noviembre de 2026. **Origen:** configuración realmente presente en el repositorio `mrvvergara-afk/Trabajo-Cerca-`.  
**Uso:** anexo obligatorio al [encargo principal](./DEEPSEEK_AUDITORIA_FUENTES_TRABAJO_CERCA_20261109.md). No ejecutar publicaciones ni despliegues a partir de esta lista.

> **Alcance y limitación:** este anexo enumera las **fuentes configuradas** en todos los inventarios actuales relacionados con rastreo y las fuentes programáticas del Motor D; no demuestra que todos sean accesibles ni pretende ser un catálogo exhaustivo de cada página de empleo existente en Internet. Una URL de aviso no es una fuente de rastreo continuo. La presencia en el código no equivale a extracción de anuncios.

## A. Territorio obligatorio y normalización

1. **Angol**
2. **Collipulli** (incluye Mininco)
3. **Ercilla**
4. **Renaico**
5. **Los Sauces**
6. **Purén**
7. **Traiguén**
8. **Lumaco** (incluye Capitán Pastene)
9. **Nacimiento**
10. **Negrete** (incluye Coihue/Coigüe)
11. **Mulchén**
12. **Victoria**

**Excluir Quilaco.** La comuna relevante es el lugar real de ejecución del puesto, no la ciudad de la OMIL, la empresa reclutadora o el domicilio del anunciante. Cuando el aviso abarque varias comunas, guardar todas las que estén explícitamente acreditadas.

## B. Resumen por inventario

| Componente | Registros | Función/estado |
| --- | --- | --- |
| `automation/trabajo_cerca/fuentes_diarias.json` — `seed_urls` | 39 | URLs de avisos individuales, principalmente históricas; NO 39 portales nuevos. |
| Mismo archivo — `discovery` | 23 | Páginas de municipios, noticias, radio y portales; rastreo depende del lector y de permisos. |
| Mismo archivo — `social_reference` | 26 | Perfiles RRSS registrados: acceso automatizado NO garantizado. |
| `automation/motor_d_territorial_daily.py` — `SEEDS` directas | 32 | Fuentes base/ATS/municipales y URLs individuales. Se solapan con otras listas. |
| Mismo archivo — ciudades Chiletrabajos | 12 | 12 rutas geográficas generadas en tiempo de ejecución; validar que el filtro municipal sea real. |
| Mismo archivo — `INDEED_SEEDS` | 12 | 12 búsquedas territoriales; comprobado bloqueo HTTP 403 en pruebas anteriores. |
| `automation/motor_d_social_sources.py` | 7 | Auditoría técnica de acceso, no capacidad probada de leer publicaciones. |
| `automation/motor_d_audit_sources.json` — `seed_pages` | 12 | Pistas históricas de auditoría; no declarar vigentes o automatizadas. |
| Mismo archivo — `employer_leads` | 15 | Pistas empleador/cargo; no todas contienen URL específica. |
| Mismo archivo — `social_discovery_sources` | 4 | Pistas sociales adicionales; requieren acceso/evidencia. |


Los registros de estas filas **se solapan** y no deben sumarse como fuentes únicas o anuncios publicados. El `seed_cutoff` del radar es `2026-10-25`; la fuente histórica auditada no implica vigencia actual.

## C. Radar: 39 URLs semilla de aviso individual

**Archivo canónico:** `automation/trabajo_cerca/fuentes_diarias.json → seed_urls`. Estas son URLs concretas, no índices de rastreo.

| ID | Comuna(s) señaladas | URL exacta (pista) |
| --- | --- | --- |
| TC-001 | Angol | [www.chiletrabajos.cl/trabajo/se-busca-operario-de-produccion-angol-3919569](https://www.chiletrabajos.cl/trabajo/se-busca-operario-de-produccion-angol-3919569) |
| TC-002 | Angol | [www.chiletrabajos.cl/trabajo/se-requieren-tens-o-enfermeras-os-3918381](https://www.chiletrabajos.cl/trabajo/se-requieren-tens-o-enfermeras-os-3918381) |
| TC-003 | Angol | [www.chiletrabajos.cl/trabajo/auditor-a-relator-a-de-calidad-e-inocuidad-alimentaria-angol-3916578](https://www.chiletrabajos.cl/trabajo/auditor-a-relator-a-de-calidad-e-inocuidad-alimentaria-angol-3916578) |
| TC-004 | Angol, Victoria, Traiguén | [www.chiletrabajos.cl/trabajo/vvendedor-en-terreno-angol-victoria-traiguen-3916595](https://www.chiletrabajos.cl/trabajo/vvendedor-en-terreno-angol-victoria-traiguen-3916595) |
| TC-005 | Angol | [www.chiletrabajos.cl/trabajo/docente-psicologo-3915967](https://www.chiletrabajos.cl/trabajo/docente-psicologo-3915967) |
| TC-006 | Angol | [www.chiletrabajos.cl/trabajo/tecnico-en-telecomunicaciones-angol-movistar-3915481](https://www.chiletrabajos.cl/trabajo/tecnico-en-telecomunicaciones-angol-movistar-3915481) |
| TC-007 | Angol | [www.chiletrabajos.cl/trabajo/encargado-ambiental-y-participacion-ciudadana-para-aif-angol-3915746](https://www.chiletrabajos.cl/trabajo/encargado-ambiental-y-participacion-ciudadana-para-aif-angol-3915746) |
| TC-008 | Angol | [www.chiletrabajos.cl/trabajo/jefe-de-asesoria-angol-3915725](https://www.chiletrabajos.cl/trabajo/jefe-de-asesoria-angol-3915725) |
| TC-009 | Angol | [www.chiletrabajos.cl/trabajo/cajero-a-asistente-integral-temporada-navidad-angol-3915270](https://www.chiletrabajos.cl/trabajo/cajero-a-asistente-integral-temporada-navidad-angol-3915270) |
| TC-010 | Angol | [www.chiletrabajos.cl/trabajo/tecnico-en-administracion-para-aif-angol-3915752](https://www.chiletrabajos.cl/trabajo/tecnico-en-administracion-para-aif-angol-3915752) |
| TC-011 | Angol | [www.chiletrabajos.cl/trabajo/geomensor-angol-3915735](https://www.chiletrabajos.cl/trabajo/geomensor-angol-3915735) |
| TC-012 | Angol | [www.chiletrabajos.cl/trabajo/encargado-calidad-para-aif-angol-3915738](https://www.chiletrabajos.cl/trabajo/encargado-calidad-para-aif-angol-3915738) |
| TC-013 | Angol | [www.chiletrabajos.cl/trabajo/laboratorista-vial-clase-b-para-aif-angol-3915741](https://www.chiletrabajos.cl/trabajo/laboratorista-vial-clase-b-para-aif-angol-3915741) |
| TC-014 | Angol | [www.chiletrabajos.cl/trabajo/prevencionista-de-riesgos-para-aif-angol-3915742](https://www.chiletrabajos.cl/trabajo/prevencionista-de-riesgos-para-aif-angol-3915742) |
| TC-015 | Angol | [www.chiletrabajos.cl/trabajo/tens-enfermera-administrativa-angol-3911374](https://www.chiletrabajos.cl/trabajo/tens-enfermera-administrativa-angol-3911374) |
| TC-016 | Angol | [www.kitempleo.cl/empleo/109303504/asistente-de-visual-angol](https://www.kitempleo.cl/empleo/109303504/asistente-de-visual-angol) |
| TC-017 | Angol | [www.kitempleo.cl/empleo/109467988/administrador-de-huerto-angol](https://www.kitempleo.cl/empleo/109467988/administrador-de-huerto-angol) |
| TC-018 | Angol | [www.kitempleo.cl/empleo/109456638/supervisor-de-terreno-angol](https://www.kitempleo.cl/empleo/109456638/supervisor-de-terreno-angol) |
| TC-019 | Angol | [www.kitempleo.cl/empleo/109453960/supervisores-de-cuadrilla-angol](https://www.kitempleo.cl/empleo/109453960/supervisores-de-cuadrilla-angol) |
| TC-020 | Angol | [www.kitempleo.cl/empleo/109456558/supervisores-de-calidad-angol](https://www.kitempleo.cl/empleo/109456558/supervisores-de-calidad-angol) |
| TC-021 | Traiguén | [www.kitempleo.cl/empleo/109828727/cosechero-frutales-traiguen](https://www.kitempleo.cl/empleo/109828727/cosechero-frutales-traiguen) |
| TC-022 | Traiguén | [www.kitempleo.cl/empleo/107893007/trabajos-de-mantencion-huerto-fruticola-traiguen](https://www.kitempleo.cl/empleo/107893007/trabajos-de-mantencion-huerto-fruticola-traiguen) |
| TC-023 | Traiguén | [traiguencity.cl/oferta-laboral-colegio-bicentenario-louis-pasteur-de-traiguen-requiere-docentes-para-diversas-areas/](https://traiguencity.cl/oferta-laboral-colegio-bicentenario-louis-pasteur-de-traiguen-requiere-docentes-para-diversas-areas/) |
| TC-024 | Traiguén | [traiguencity.cl/abren-concursos-publicos-para-proveer-los-cargos-de-director-en-el-liceo-lucila-godoy-alcayaga-y-la-escuela-especial-las-lilas-de-traiguen/](https://traiguencity.cl/abren-concursos-publicos-para-proveer-los-cargos-de-director-en-el-liceo-lucila-godoy-alcayaga-y-la-escuela-especial-las-lilas-de-traiguen/) |
| TC-025 | Angol, Victoria, Traiguén | [www.chiletrabajos.cl/trabajo/vendedor-en-terreno-zona-victoria-angol-traiguen-3915323](https://www.chiletrabajos.cl/trabajo/vendedor-en-terreno-zona-victoria-angol-traiguen-3915323) |
| TC-026 | Victoria | [www.kitempleo.cl/empleo/109901397/cajera-administrativa-victoria](https://www.kitempleo.cl/empleo/109901397/cajera-administrativa-victoria) |
| TC-027 | Collipulli | [www.kitempleo.cl/empleo/110102473/visual-merchandising-collipulli](https://www.kitempleo.cl/empleo/110102473/visual-merchandising-collipulli) |
| TC-028 | Collipulli | [www.kitempleo.cl/empleo/110041583/conductor-traslado-de-pacientes-collipulli](https://www.kitempleo.cl/empleo/110041583/conductor-traslado-de-pacientes-collipulli) |
| TC-029 | Collipulli | [www.kitempleo.cl/empleo/110226625/jefe-de-tienda-collipulli](https://www.kitempleo.cl/empleo/110226625/jefe-de-tienda-collipulli) |
| TC-030 | Mulchén | [www.chiletrabajos.cl/trabajo/relator-para-curso-de-produccion-de-miel-en-la-comuna-de-mulchen-3919935](https://www.chiletrabajos.cl/trabajo/relator-para-curso-de-produccion-de-miel-en-la-comuna-de-mulchen-3919935) |
| TC-031 | Mulchén | [www.kitempleo.cl/empleo/110253332/supervisor-a-tecnico-a-de-obra-proyecto-mulchen](https://www.kitempleo.cl/empleo/110253332/supervisor-a-tecnico-a-de-obra-proyecto-mulchen) |
| TC-032 | Mulchén | [www.kitempleo.cl/empleo/110032101/operador-de-grua-horquilla-mulchen](https://www.kitempleo.cl/empleo/110032101/operador-de-grua-horquilla-mulchen) |
| TC-033 | Mulchén | [www.kitempleo.cl/empleo/110036216/agente-atencion-al-cliente-mulchen-mulchen](https://www.kitempleo.cl/empleo/110036216/agente-atencion-al-cliente-mulchen-mulchen) |
| TC-034 | Negrete | [www.kitempleo.cl/empleo/109209990/conductor-profesional-negrete](https://www.kitempleo.cl/empleo/109209990/conductor-profesional-negrete) |
| TC-035 | Negrete | [www.kitempleo.cl/empleo/109327893/vulcanizador-empresa-de-transporte-forestal-negrete](https://www.kitempleo.cl/empleo/109327893/vulcanizador-empresa-de-transporte-forestal-negrete) |
| TC-036 | Negrete | [www.kitempleo.cl/empleo/110128066/jefe-de-taller-negrete](https://www.kitempleo.cl/empleo/110128066/jefe-de-taller-negrete) |
| TC-037 | Nacimiento | [www.kitempleo.cl/empleo/110103196/analista-de-sistemas-nacimiento](https://www.kitempleo.cl/empleo/110103196/analista-de-sistemas-nacimiento) |
| TC-038 | Los Sauces | [www.kitempleo.cl/empleo/109379051/ingeniero-en-electricidad-en-terreno-los-sauces](https://www.kitempleo.cl/empleo/109379051/ingeniero-en-electricidad-en-terreno-los-sauces) |
| TC-040 | Lumaco | [www.chiletrabajos.cl/trabajo/relator-para-curso-de-administracion-gastronomica-3919940](https://www.chiletrabajos.cl/trabajo/relator-para-curso-de-administracion-gastronomica-3919940) |


## D. Radar: 23 páginas de descubrimiento configuradas

**Archivo canónico:** `automation/trabajo_cerca/fuentes_diarias.json → discovery`. Páginas de la prensa y portales a explorar. Una portada no demuestra ausencia de ofertas en redes.

| ID | Cobertura asignada | Tipo | URL |
| --- | --- | --- | --- |
| M02 | Mulchén | municipal | [www.munimulchen.cl/pagina-central-ofertas-laborales/](https://www.munimulchen.cl/pagina-central-ofertas-laborales/) |
| M03 | Negrete | municipal | [www.muninegrete.cl/oficina-municipal-de-intermediacion-laboral-omil/](https://www.muninegrete.cl/oficina-municipal-de-intermediacion-laboral-omil/) |
| M04 | Victoria | municipal | [victoriachile.cl/category/omil/](https://victoriachile.cl/category/omil/) |
| M05 | Collipulli | municipal | [municipalidadcollipulli.cl/concursos-publicos/](https://municipalidadcollipulli.cl/concursos-publicos/) |
| M06 | Renaico | municipal | [municipalidadrenaico.cl/concursos-publicos/](https://municipalidadrenaico.cl/concursos-publicos/) |
| M07 | Lumaco | municipal | [munilumaco.cl/](https://munilumaco.cl/) |
| M08 | Angol | municipal | [noticias.angol.cl/index.php/noticias](https://noticias.angol.cl/index.php/noticias) |
| M09 | Traiguén | municipal | [mtraiguen.cl/direccion-de-fomento-productivo/](https://mtraiguen.cl/direccion-de-fomento-productivo/) |
| M10 | Purén | municipal | [munipuren.cl/llamados-a-concurso-2026/](https://munipuren.cl/llamados-a-concurso-2026/) |
| M11 | Ercilla | municipal | [muniercilla.cl/](https://muniercilla.cl/) |
| M12 | Los Sauces | municipal | [www.munilossauces.cl/noticias](https://www.munilossauces.cl/noticias) |
| M13 | Nacimiento | municipal | [www.nacimiento.cl/noticias](https://www.nacimiento.cl/noticias) |
| M14 | Collipulli | municipal | [municipalidadcollipulli.cl/](https://municipalidadcollipulli.cl/) |
| P01 | Traiguén | press | [traiguencity.cl/noticias/traiguen/laboral-traiguen/](https://traiguencity.cl/noticias/traiguen/laboral-traiguen/) |
| P02 | Traiguén | press | [traiguencity.cl/noticias/traiguen/general/](https://traiguencity.cl/noticias/traiguen/general/) |
| P03 | Angol | press | [www.angolnoticiasnew.cl/](https://www.angolnoticiasnew.cl/) |
| P04 | Malleco | press | [www.malleco7.cl/](https://www.malleco7.cl/) |
| P05 | Malleco | press | [lasnoticiasdemalleco.cl/](https://lasnoticiasdemalleco.cl/) |
| P06 | Lumaco | radio | [www.radionativa.cl/](https://www.radionativa.cl/) |
| P07 | Collipulli | radio | [radioviaducto.cl/](https://radioviaducto.cl/) |
| D01 | Región | directory | [sence.gob.cl/personas/omil](https://sence.gob.cl/personas/omil) |
| D02 | Chile | portal | [www.bne.gob.cl/ofertas](https://www.bne.gob.cl/ofertas) |
| D03 | Chile | portal | [www.empleospublicos.cl/pub/convocatorias/convocatorias.aspx](https://www.empleospublicos.cl/pub/convocatorias/convocatorias.aspx) |


## E. Radar: 26 referencias sociales registradas

**Archivo canónico:** `automation/trabajo_cerca/fuentes_diarias.json → social_reference`. La mayoría usan `manual_or_authorized_api_only`; **no tratarlas como fuentes leídas**. Verificar políticas actuales de Facebook/Instagram y permisos oficiales. No eludir robots, inicio de sesión, CAPTCHAs ni restricciones de Meta.

| ID | Cobertura | Modalidad | Cuenta/red |
| --- | --- | --- | --- |
| S01 | Angol | manual_or_authorized_api_only | [www.facebook.com/omil.angol.5/](https://www.facebook.com/omil.angol.5/) |
| S02 | Angol | manual_or_authorized_api_only | [www.instagram.com/omilangol2026/](https://www.instagram.com/omilangol2026/) |
| S03 | Angol | manual_or_authorized_api_only | [www.facebook.com/municipalidad.angol/](https://www.facebook.com/municipalidad.angol/) |
| S04 | Collipulli | manual_or_authorized_api_only | [www.facebook.com/MunicipioCollipulli/](https://www.facebook.com/MunicipioCollipulli/) |
| S05 | Ercilla | manual_or_authorized_api_only | [www.facebook.com/municipio.ercilla/](https://www.facebook.com/municipio.ercilla/) |
| S06 | Renaico | manual_or_authorized_api_only | [www.facebook.com/p/OMIL-Renaico-100068789023921/](https://www.facebook.com/p/OMIL-Renaico-100068789023921/) |
| S07 | Renaico | manual_or_authorized_api_only | [www.facebook.com/municipalidadrenaico/](https://www.facebook.com/municipalidadrenaico/) |
| S08 | Los Sauces | manual_or_authorized_api_only | [www.facebook.com/MuniLosSauces/](https://www.facebook.com/MuniLosSauces/) |
| S09 | Purén | manual_or_authorized_api_only | [www.facebook.com/omilpurenaraucania/](https://www.facebook.com/omilpurenaraucania/) |
| S10 | Purén | manual_or_authorized_api_only | [www.facebook.com/MunicipalidadDePuren/](https://www.facebook.com/MunicipalidadDePuren/) |
| S11 | Traiguén | manual_or_authorized_api_only | [www.facebook.com/omil.traiguen.5/](https://www.facebook.com/omil.traiguen.5/) |
| S12 | Lumaco | manual_or_authorized_api_only | [www.facebook.com/municipalidadlumaco/](https://www.facebook.com/municipalidadlumaco/) |
| S26 | Nacimiento | manual_or_authorized_api_only | [www.instagram.com/omilnacimiento/](https://www.instagram.com/omilnacimiento/) |
| S13 | Nacimiento | manual_or_authorized_api_only | [www.facebook.com/p/OMIL-Municipalidad-de-Nacimiento-100072332712701/](https://www.facebook.com/p/OMIL-Municipalidad-de-Nacimiento-100072332712701/) |
| S14 | Nacimiento | manual_or_authorized_api_only | [www.facebook.com/MunicipalidadDeNacimiento/](https://www.facebook.com/MunicipalidadDeNacimiento/) |
| S15 | Negrete | manual_or_authorized_api_only | [www.facebook.com/NegreteOmil/](https://www.facebook.com/NegreteOmil/) |
| S16 | Negrete | manual_or_authorized_api_only | [www.facebook.com/MuniNegreteCL/](https://www.facebook.com/MuniNegreteCL/) |
| S17 | Mulchén | manual_or_authorized_api_only | [www.facebook.com/munimulchen/](https://www.facebook.com/munimulchen/) |
| S18 | Victoria | manual_or_authorized_api_only | [www.facebook.com/omil.victoria/](https://www.facebook.com/omil.victoria/) |
| S19 | Victoria | manual_or_authorized_api_only | [www.instagram.com/omil_victoria/](https://www.instagram.com/omil_victoria/) |
| S20 | Victoria | manual_or_authorized_api_only | [www.facebook.com/victoriachile/](https://www.facebook.com/victoriachile/) |
| S21 | Malleco | manual_or_authorized_api_only | [www.facebook.com/RadioNativaCl/](https://www.facebook.com/RadioNativaCl/) |
| S22 | Los Sauces | manual_or_authorized_api_only | [www.facebook.com/Canal8LosSaucesTV/](https://www.facebook.com/Canal8LosSaucesTV/) |
| S23 | Angol | manual_or_authorized_api_only | [www.facebook.com/groups/6118694138210991/](https://www.facebook.com/groups/6118694138210991/) |
| S24 | Angol | manual_or_authorized_api_only | [www.facebook.com/groups/empleosenangol.arau/](https://www.facebook.com/groups/empleosenangol.arau/) |
| S25 | Nacimiento, Negrete | manual_or_authorized_api_only | [www.facebook.com/p/OMIL-Territorio-Biobio-Centro-100072292644529/](https://www.facebook.com/p/OMIL-Territorio-Biobio-Centro-100072292644529/) |


## F. Motor D: 32 fuentes directas definidas en código

**Archivo canónico:** `automation/motor_d_territorial_daily.py → SEEDS`. Algunas entradas apuntan a un aviso específico (revisar vigencia), otras a una fuente recurrente. El motor debe distinguirlas.

| Comuna | Nombre configurado | URL |
| --- | --- | --- |
| Angol | Municipalidad Angol | [noticias.angol.cl/](https://noticias.angol.cl/) |
| Angol | Hospital Angol concursos | [hospitalangol.cl/concursos/](https://hospitalangol.cl/concursos/) |
| Collipulli | Municipio Collipulli | [municipalidadcollipulli.cl/](https://municipalidadcollipulli.cl/) |
| Ercilla | Municipio Ercilla | [muniercilla.cl/](https://muniercilla.cl/) |
| Lumaco | Municipio Lumaco | [munilumaco.cl/](https://munilumaco.cl/) |
| Los Sauces | Municipio Los Sauces | [munilossauces.cl/](https://munilossauces.cl/) |
| Purén | Municipio Purén | [munipuren.cl/](https://munipuren.cl/) |
| Renaico | Municipio Renaico | [municipalidadrenaico.cl/concursos-publicos/](https://municipalidadrenaico.cl/concursos-publicos/) |
| Traiguén | Municipio Traiguén | [mtraiguen.cl/category/bolsa-de-empleo-o-concurso/](https://mtraiguen.cl/category/bolsa-de-empleo-o-concurso/) |
| Victoria | Municipio Victoria OMIL | [victoriachile.cl/departamentos-y-direcciones/udel/omil/](https://victoriachile.cl/departamentos-y-direcciones/udel/omil/) |
| Mulchén | Municipio Mulchén empleos | [www.munimulchen.cl/pagina-central-ofertas-laborales/](https://www.munimulchen.cl/pagina-central-ofertas-laborales/) |
| Negrete | Municipio Negrete OMIL | [www.muninegrete.cl/oficina-municipal-de-intermediacion-laboral-omil/](https://www.muninegrete.cl/oficina-municipal-de-intermediacion-laboral-omil/) |
| Nacimiento | Municipio Nacimiento | [nacimiento.cl/](https://nacimiento.cl/) |
| Angol | Salud Araucanía Norte | [ssan.redsalud.gob.cl/trabaje-con-nosotros/](https://ssan.redsalud.gob.cl/trabaje-con-nosotros/) |
| Collipulli | Arauco empleo | [jobs.arauco.com/Chile/search/](https://jobs.arauco.com/Chile/search/) |
| Nacimiento | CMPC empleo | [cmpc.csod.com/ux/ats/careersite/4/home?c=cmpc](https://cmpc.csod.com/ux/ats/careersite/4/home?c=cmpc) |
| Mulchén | OMIL Mulchén temporada | [www.munimulchen.cl/oferta-laboral-personal-temporada-agricola-packing-y-cosecha-de-arandanos/](https://www.munimulchen.cl/oferta-laboral-personal-temporada-agricola-packing-y-cosecha-de-arandanos/) |
| Mulchén | OMIL Mulchén arándanos 100 cupos | [www.munimulchen.cl/oferta-laboral-02-operarios-agrarios-cosecha-de-arandanos/](https://www.munimulchen.cl/oferta-laboral-02-operarios-agrarios-cosecha-de-arandanos/) |
| Victoria | Municipio Victoria OMIL publicaciones | [victoriachile.cl/category/omil/](https://victoriachile.cl/category/omil/) |
| Angol | Hospital Angol estado postulaciones | [hospitalangol.cl/estado/postulacion/](https://hospitalangol.cl/estado/postulacion/) |
| Nacimiento | Chiletrabajos · Serfonac mecánico soldador | [www.chiletrabajos.cl/trabajo/mecanico-a-soldador-a-de-maquinaria-nacimiento-3923358](https://www.chiletrabajos.cl/trabajo/mecanico-a-soldador-a-de-maquinaria-nacimiento-3923358) |
| Nacimiento | Chiletrabajos · Serfonac mecánico automotriz | [www.chiletrabajos.cl/trabajo/mecanico-a-automotriz-nacimiento-3923364](https://www.chiletrabajos.cl/trabajo/mecanico-a-automotriz-nacimiento-3923364) |
| Nacimiento | Chiletrabajos · Serfonac conductor | [www.chiletrabajos.cl/trabajo/conductor-de-transporte-de-carga-y-personal-nacimiento-3923758](https://www.chiletrabajos.cl/trabajo/conductor-de-transporte-de-carga-y-personal-nacimiento-3923758) |
| Angol | Chiletrabajos · Operario alimentos Angol | [www.chiletrabajos.cl/trabajo/se-busca-operario-de-produccion-angol-3919569](https://www.chiletrabajos.cl/trabajo/se-busca-operario-de-produccion-angol-3919569) |
| Traiguén | Chiletrabajos · Reponedor Traiguén | [www.chiletrabajos.cl/trabajo/part-time-para-traiguen-en-la-araucania-3924463](https://www.chiletrabajos.cl/trabajo/part-time-para-traiguen-en-la-araucania-3924463) |
| Mulchén | Chiletrabajos · Reponedor Mulchén | [www.chiletrabajos.cl/trabajo/reponedor-part-time-mulchen-3927989](https://www.chiletrabajos.cl/trabajo/reponedor-part-time-mulchen-3927989) |
| Purén | Chiletrabajos · Prevencionista obras Malleco | [www.chiletrabajos.cl/trabajo/prevencionista-de-riesgos-malleco-3924497](https://www.chiletrabajos.cl/trabajo/prevencionista-de-riesgos-malleco-3924497) |
| Angol | Radio Viaducto | [radioviaducto.cl/](https://radioviaducto.cl/) |
| Angol | Las Noticias de Malleco | [lasnoticiasdemalleco.cl/](https://lasnoticiasdemalleco.cl/) |
| Angol | Fashion's Park · portal oficial de contratación | [fashionspark.hiringroom.com/jobs](https://fashionspark.hiringroom.com/jobs) |
| Angol | Falabella · empleos oficiales | [muevete.falabella.com/](https://muevete.falabella.com/) |
| Angol | Unimarc · empleos oficiales | [unimarc.trabajando.cl/](https://unimarc.trabajando.cl/) |


## G. Motor D: 12 índices Chiletrabajos y 12 búsquedas Indeed dinámicas

**Archivo canónico:** `automation/motor_d_territorial_daily.py → SEEDS.extend / INDEED_SEEDS`. No son 24 URLs explícitas adicionales en JSON, sino rutas generadas a partir de las 12 comunas. El acceso a Indeed se registra como **bloqueado** si retorna 403, no como cero ofertas. Los índices de Chiletrabajos requieren comprobación territorial de su H1/título.

| Comuna | Chiletrabajos (ruta territorial) | Indeed (consulta; acceso por verificar) |
| --- | --- | --- |
| Angol | [www.chiletrabajos.cl/ciudad/angol.html](https://www.chiletrabajos.cl/ciudad/angol.html) | [cl.indeed.com/jobs?q=&l=Angol&fromage=2](https://cl.indeed.com/jobs?q=&l=Angol&fromage=2) |
| Collipulli | [www.chiletrabajos.cl/ciudad/collipulli.html](https://www.chiletrabajos.cl/ciudad/collipulli.html) | [cl.indeed.com/jobs?q=&l=Collipulli&fromage=2](https://cl.indeed.com/jobs?q=&l=Collipulli&fromage=2) |
| Ercilla | [www.chiletrabajos.cl/ciudad/ercilla.html](https://www.chiletrabajos.cl/ciudad/ercilla.html) | [cl.indeed.com/jobs?q=&l=Ercilla&fromage=2](https://cl.indeed.com/jobs?q=&l=Ercilla&fromage=2) |
| Renaico | [www.chiletrabajos.cl/ciudad/renaico.html](https://www.chiletrabajos.cl/ciudad/renaico.html) | [cl.indeed.com/jobs?q=&l=Renaico&fromage=2](https://cl.indeed.com/jobs?q=&l=Renaico&fromage=2) |
| Los Sauces | [www.chiletrabajos.cl/ciudad/los-sauces.html](https://www.chiletrabajos.cl/ciudad/los-sauces.html) | [cl.indeed.com/jobs?q=&l=Los%20Sauces&fromage=2](https://cl.indeed.com/jobs?q=&l=Los%20Sauces&fromage=2) |
| Purén | [www.chiletrabajos.cl/ciudad/puren.html](https://www.chiletrabajos.cl/ciudad/puren.html) | [cl.indeed.com/jobs?q=&l=Pur%C3%A9n&fromage=2](https://cl.indeed.com/jobs?q=&l=Pur%C3%A9n&fromage=2) |
| Traiguén | [www.chiletrabajos.cl/ciudad/traiguen.html](https://www.chiletrabajos.cl/ciudad/traiguen.html) | [cl.indeed.com/jobs?q=&l=Traigu%C3%A9n&fromage=2](https://cl.indeed.com/jobs?q=&l=Traigu%C3%A9n&fromage=2) |
| Lumaco | [www.chiletrabajos.cl/ciudad/lumaco.html](https://www.chiletrabajos.cl/ciudad/lumaco.html) | [cl.indeed.com/jobs?q=&l=Lumaco&fromage=2](https://cl.indeed.com/jobs?q=&l=Lumaco&fromage=2) |
| Nacimiento | [www.chiletrabajos.cl/ciudad/nacimiento.html](https://www.chiletrabajos.cl/ciudad/nacimiento.html) | [cl.indeed.com/jobs?q=&l=Nacimiento&fromage=2](https://cl.indeed.com/jobs?q=&l=Nacimiento&fromage=2) |
| Negrete | [www.chiletrabajos.cl/ciudad/negrete.html](https://www.chiletrabajos.cl/ciudad/negrete.html) | [cl.indeed.com/jobs?q=&l=Negrete&fromage=2](https://cl.indeed.com/jobs?q=&l=Negrete&fromage=2) |
| Mulchén | [www.chiletrabajos.cl/ciudad/mulchen.html](https://www.chiletrabajos.cl/ciudad/mulchen.html) | [cl.indeed.com/jobs?q=&l=Mulch%C3%A9n&fromage=2](https://cl.indeed.com/jobs?q=&l=Mulch%C3%A9n&fromage=2) |
| Victoria | [www.chiletrabajos.cl/ciudad/victoria.html](https://www.chiletrabajos.cl/ciudad/victoria.html) | [cl.indeed.com/jobs?q=&l=Victoria&fromage=2](https://cl.indeed.com/jobs?q=&l=Victoria&fromage=2) |


## H. Auditoría social Motor D: 7 fuentes de prueba

**Archivo canónico:** `automation/motor_d_social_sources.py`. Son pruebas de accesibilidad, no lectores capaces de obtener automáticamente stories. La existencia de `@omilnacimiento` está respaldada por capturas proporcionadas por el usuario; eso no autoriza el acceso automatizado a Meta.

| Cuenta | Comuna | Prioridad | Perfil |
| --- | --- | --- | --- |
| OMIL Nacimiento Instagram | Nacimiento | critical | [www.instagram.com/omilnacimiento/](https://www.instagram.com/omilnacimiento/) |
| OMIL Nacimiento Facebook | Nacimiento | critical | [www.facebook.com/p/OMIL-Municipalidad-de-Nacimiento-100072332712701/](https://www.facebook.com/p/OMIL-Municipalidad-de-Nacimiento-100072332712701/) |
| Municipalidad Nacimiento Facebook | Nacimiento | critical | [www.facebook.com/MunicipalidadDeNacimiento/](https://www.facebook.com/MunicipalidadDeNacimiento/) |
| OMIL Angol Instagram | Angol | critical | [www.instagram.com/omilangol2026/](https://www.instagram.com/omilangol2026/) |
| Radio Nativa Instagram | Angol | normal | [www.instagram.com/radionativacl/](https://www.instagram.com/radionativacl/) |
| Municipalidad Angol Facebook | Angol | critical | [www.facebook.com/municipalidad.angol/](https://www.facebook.com/municipalidad.angol/) |
| Radio Nativa Facebook | Angol | normal | [www.facebook.com/RadioNativaCl/](https://www.facebook.com/RadioNativaCl/) |


## I. Inventario histórico complementario — 12 pistas de auditoría

**Archivo canónico:** `automation/motor_d_audit_sources.json → seed_pages`. Su estado es pista histórica, no disponibilidad actual. Los elementos marcados como duplicados siguen siendo duplicados.

| Fuente/pista | Categoría | Enlace | Advertencia |
| --- | --- | --- | --- |
| OMIL Mulchén - arándanos | municipal | [www.munimulchen.cl/oferta-laboral-personal-temporada-agricola-packing-y-cosecha-de-arandanos/](https://www.munimulchen.cl/oferta-laboral-personal-temporada-agricola-packing-y-cosecha-de-arandanos/) | DUPLICADA CONFIRMADA por administrador; vigencia solo contextual |
| Municipalidad Lumaco concursos | municipal | [www.munilumaco.cl/index.php/sala-de-prensa/98-concursos-publicos-municipalidad-de-lumaco](https://www.munilumaco.cl/index.php/sala-de-prensa/98-concursos-publicos-municipalidad-de-lumaco) | Revalidar antes de incluir |
| Municipalidad Lumaco oferta de apoyo laboral | municipal | [munilumaco.cl/index.php/sala-de-prensa/694-lumaco-trabajo-apoyo-laboral](https://munilumaco.cl/index.php/sala-de-prensa/694-lumaco-trabajo-apoyo-laboral) | Revalidar antes de incluir |
| Municipalidad Traiguén concursos | municipal | [mtraiguen.cl/category/bolsa-de-empleo-o-concurso/](https://mtraiguen.cl/category/bolsa-de-empleo-o-concurso/) | Revalidar antes de incluir |
| Municipalidad Traiguén 3 cargos | municipal | [mtraiguen.cl/municipalidad/bases-para-llamado-a-concurso-publico-de-3-cargos/](https://mtraiguen.cl/municipalidad/bases-para-llamado-a-concurso-publico-de-3-cargos/) | Revalidar antes de incluir |
| Empleos Públicos - convocatoria individual | empleo_publico | [empleospublicos.cl/pub/convocatorias/avisotrabajoficha.aspx?i=143787](https://empleospublicos.cl/pub/convocatorias/avisotrabajoficha.aspx?i=143787) | verificar ubicación y cierre en ficha; no publicar solo por existir |
| Logística Hualpén - convocatoria Angol | agregador | [cl.computrabajo.com/ofertas-de-trabajo/oferta-de-trabajo-de-conductores-profesionales-bus-residencia-en-angol-y-alrededores-en-angol-70D0C388EE0D8A6261373E686DCF3405](https://cl.computrabajo.com/ofertas-de-trabajo/oferta-de-trabajo-de-conductores-profesionales-bus-residencia-en-angol-y-alrededores-en-angol-70D0C388EE0D8A6261373E686DCF3405) | solo pista: si hay restricciones, buscar fuente empleador; no forzar acceso |
| Logística Hualpén - empleos | agregador | [cl.computrabajo.com/hualpen/empleos](https://cl.computrabajo.com/hualpen/empleos) | solo descubrimiento |
| CMPC - Cornerstone | ats | [cmpc.csod.com/ux/ats/careersite/4/home?c=cmpc](https://cmpc.csod.com/ux/ats/careersite/4/home?c=cmpc) | usar extractor Playwright separado |
| Hospital de Angol - concursos oficiales | institucional | [hospitalangol.cl/concursos/](https://hospitalangol.cl/concursos/) | Fuente oficial prioritaria; separar concursos internos, reemplazos y llamados abiertos; NO tomar solo etiquetas como prueba definitiva de vigencia |
| Hospital de Angol - bolsa de trabajo | institucional | [hospitalangol.cl/enlaces/](https://hospitalangol.cl/enlaces/) | Identificar enlace específico Bolsa de Trabajo Hospital Angol y monitorear fichas reales |
| Empleos Públicos - Enfermera Diálisis Hospital Angol | empleo_publico | [www.empleospublicos.cl/pub/convocatorias/avisopizarronficha.aspx?i=125294](https://www.empleospublicos.cl/pub/convocatorias/avisopizarronficha.aspx?i=125294) | Ficha potencialmente histórica; comprobar cierre individual, no confundir con reemplazo UPC/UCI del afiche |


## J. Pistas históricas por empleador — 15 registros

**Archivo canónico:** `automation/motor_d_audit_sources.json → employer_leads`. No son 15 portales ni 15 ofertas aprobadas; algunas referencias carecen de URL individual o de comuna real de trabajo. Por privacidad, no copiar correos personales ni datos de contacto obtenidos en afiches al informe de auditoría externa.

| Empleador | Pista de cargo | Comuna indicada | Estado / acción |
| --- | --- | --- | --- |
| TeamWork | Agente de atención al cliente | Mulchén | Pista histórica; requiere revalidación |
| Aramark | Auxiliar de casino part time | Mulchén | Pista histórica; requiere revalidación |
| Atento Chile | Asesor comercial | Angol | Pista histórica; requiere revalidación |
| Logística Hualpén | Conductores profesionales | Angol | Pista histórica; requiere revalidación |
| Progestion | Mercaderista reemplazo | Angol; Collipulli | Pista histórica; requiere revalidación |
| MVS Group | Cajero(a) de servicios | Collipulli | Pista histórica; requiere revalidación |
| JCS Logística | Conductor astillas Coihue | Negrete | Pista histórica; requiere revalidación |
| Falabella | Apoyo abastecimiento Navidad | Angol | Pista histórica; requiere revalidación |
| Hospital Dr. Mauricio Heyermann Torres de Angol | Enfermero/a - bolsa de reemplazos UPC/UCI | Angol | Pista histórica; requiere revalidación |
| Don Agustín | Reemplazo apoyo en sala | Traiguén | Pista histórica; requiere revalidación |
| TRANSAP | Maquinista | Nacimiento | awaiting_specific_original_post_url_and_catalog_duplicate_check |
| Gestión de Proyectos | Albañil | Angol | awaiting_post_specific_url_catalog_duplicate_check_and_workplace_classification |
| Gestión de Proyectos | Capataz o supervisor | Angol | awaiting_post_specific_url_catalog_duplicate_check_and_workplace_classification |
| Transportes (empleador no individualizado) | Chofer A5 - rampla | Angol | awaiting_post_specific_url_catalog_duplicate_check_and_workplace_classification |
| Transportes (empleador no individualizado) | Chofer A4 - camión 15T | Angol | awaiting_post_specific_url_catalog_duplicate_check_and_workplace_classification |


## K. Pistas de redes adicionales del inventario histórico

| Cuenta | Red | Territorio / rol | Acceso / advertencia |
| --- | --- | --- | --- |
| @omilangol2026 | instagram | Angol | automatic_capture_disabled_by_AppDeploy_SECURITY_POLICY |
| @empleos_victoria | instagram | descubrimiento territorial de avisos de Victoria, Traiguén y Malleco | No asumir acceso automático a historias; usar repost como pista y buscar origen |
| @hospital_angol | instagram | fuente institucional de avisos de reemplazos | Sin prueba de acceso |
| @donagustin_oficial | instagram | empleador de Traiguén; confirmar publicación directa | Sin prueba de acceso |


## L. Plataformas y ATS obligatorios a investigar aunque no estén automatizados

Las siguientes **categorías de fuentes objetivo** aparecen en los requisitos del proyecto, pero **no deben darse por conectadas ni por totalmente rastreadas** solo porque su marca está escrita en el encargo:

| Plataforma / categoría | Propósito | Verificación exigida |
| --- | --- | --- |
| Indeed | Fuente crítica de avisos territoriales | HTTP/robots/permisos y alternativa de ATS empleador; 403 significa bloqueo. |
| LinkedIn / páginas de empleadores | Descubrir anuncios corporativos y originales | No atribuir acceso a anuncios privados ni automatización a una URL de perfil. |
| Chiletrabajos | Índices y fichas individuales | Confirmar filtro por comuna, fecha, fecha de cierre, empleador y `job_id`. |
| BNE | Portal oficial | Revisar si hay ficha pública accesible y términos de uso; no extrapolar una búsqueda vacía. |
| Trabajando.com | Portal y ATS | Inspeccionar feeds públicos disponibles sin suponer API. |
| Laborum | Agregador | Verificar acceso y fuente original. |
| Computrabajo | Portal/agregador | Verificar acceso, robots y empleador original. |
| Opción Empleo | Agregador | Buscar URL de oferta original y evitar duplicación. |
| Empleos Públicos | Convocatorias del Estado | Separar concursos vigentes, internos e históricos. |
| CMPC / Cornerstone | ATS empleador | Validar labores en Mininco/Nacimiento/Mulchén u otra comuna objetivo. |
| ARAUCO / jobs.arauco.com | ATS empleador | No inferir lugar de ejecución por sede del empleador. |
| SAESA/Frontel y contratistas | Vacantes energía y operación territorial | Buscar fuentes públicas oficiales y ubicación real del servicio. |
| Falabella / Fashion's Park / Unimarc | Empleadores retail | Verificar fichas y vigencia, no asumir continuidad por página general. |
| OMIL municipales y SENCE | Avisos territoriales institucionales | Explorar feed municipal/afiches con permiso de titular; prueba de vínculo original. |
| Medios y radios locales | Afiches o reproducciones autorizadas | Trazar anuncio a empleador y controlar fecha. |
| Kitempleo | Fichas histórico/agregador | Preferir postulación en fuente original y evitar duplicar. |
| Hospitales y servicios públicos de salud | Reemplazos/concursos | Distinguir bolsas vigentes, llamados cerrados y cargos internos. |


## M. Matriz de control territorial de cobertura **configurada** (NO cobertura efectiva)

| Comuna | Semillas URL radar | Descubrimiento local radar | RRSS inventariadas | Motor D directo (no dinámicas) | Chiletrabajos / Indeed |
| --- | --- | --- | --- | --- | --- |
| Angol | 21 | 2 | 5 | 10 | 1 / 1 |
| Collipulli | 3 | 3 | 1 | 2 | 1 / 1 |
| Ercilla | 0 | 1 | 1 | 1 | 1 / 1 |
| Renaico | 0 | 1 | 2 | 1 | 1 / 1 |
| Los Sauces | 1 | 1 | 2 | 1 | 1 / 1 |
| Purén | 0 | 1 | 2 | 2 | 1 / 1 |
| Traiguén | 6 | 3 | 1 | 2 | 1 / 1 |
| Lumaco | 1 | 2 | 1 | 1 | 1 / 1 |
| Nacimiento | 1 | 1 | 4 | 5 | 1 / 1 |
| Negrete | 3 | 1 | 3 | 1 | 1 / 1 |
| Mulchén | 4 | 1 | 1 | 4 | 1 / 1 |
| Victoria | 3 | 1 | 3 | 2 | 1 / 1 |


Los medios regionales `Malleco`, `Región` y `Chile` pueden aportar a varias comunas. **No** están sumados artificialmente como una visita por comuna en esta matriz.

## N. Reglas para la auditoría independiente y criterios de cierre

1. Leer primero las **definiciones canónicas** en archivos del repositorio; esta fotografía es de 09-11-2026. Si hay diferencias, actualizar tabla y explicar cambios, no inventar fuentes.
2. Clasificar cada entrada como `individual_listing_seed`, `discoverable_index`, `authorized_social_reference`, `historical_lead` o `portal_target_unconnected`.
3. **Separar**: URL configurada, HTTP accesible, contenido legible, anuncio laboral identificable, oferta vigente, candidata verificada, en lote y visible en catálogo con ID exacto. Registrar `blocked` y `not_checked` sin convertirlos a 0 avisos.
4. Fechas separadas: original, descubrimiento, jornada de postulación OMIL, cierre real. Sin rechazo automático de anuncio antiguo aún abierto.
5. Deduplicar por ID original (p.ej. Chiletrabajos numérico), URL canónica y cargo+empresa+**comuna de ejecución**. La comuna de OMIL/reclutamiento no es comuna de ejecución.
6. Para avisos capturados en Facebook/Instagram: exigir acceso autorizado o evidencia facilitada voluntariamente, hash documental, revisión con firma cuando proceda y comprobación de catálogo antes de publicar. Prohibidas técnicas de evasión de permisos.
7. Priorización: encontrar ofertas **nuevas y efectivamente publicables**. No rediseñar la plataforma ni ampliar alcance. El resultado se mide por publicaciones verificadas, no por volumen de enlaces.
8. Entregar lista de **fuentes faltantes identificadas** con prioridad, requisitos de permiso/costo y propuesta mínima de integración. No afirmar “inventario total del mercado” con estas listas.

**Documentos de respaldo:** [encargo principal](./DEEPSEEK_AUDITORIA_FUENTES_TRABAJO_CERCA_20261109.md) · `automation/trabajo_cerca/fuentes_diarias.json` · `automation/motor_d_territorial_daily.py` · `automation/motor_d_social_sources.py` · `automation/motor_d_audit_sources.json`.

## O. Actualización controlada al 11 de noviembre de 2026 — inventario ampliable

La tabla de la sección B es una **fotografía del 9 de noviembre**, no el límite de ejecución del Motor D. El inventario operativo posterior es `automation/motor_d_source_registry.py` más `automation/motor_d_portal_families.json`, que conecta nuevas fuentes sin eliminar las anteriores ni contar un simple intento HTTP como lectura útil.

**Nuevas páginas de descubrimiento del radar (D04 y D05):**

- D04 — Mipleo: https://www.mipleo.cl/ofertas-de-trabajo/ . Portal nacional pendiente de verificar filtros por las 12 comunas; leer su portada NO demuestra rastreo territorial completo.
- D05 — Kitempleo: https://www.kitempleo.cl/ . Portal nacional pendiente de verificar filtros por las 12 comunas; una ficha histórica NO prueba un índice activo.

**Corte actualizado:** `fuentes_diarias.json` registra 25 páginas permanentes de descubrimiento, 26 referencias sociales y 39 enlaces a ofertas individuales históricas. El contrato operativo único conserva además las siete familias de búsquedas por comuna y las fuentes empresariales CMPC, ARAUCO, SERFONAC, Brayben, SERFOCOL y SAFCO. Para cada fuente deben distinguirse las categorías `consultada`, `accesible`, `bloqueada`, `pendiente de conector`, `ofertas verificadas` y `publicaciones confirmadas`.
