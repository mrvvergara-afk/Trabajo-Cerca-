# TRABAJO CERCA — ENCARGO DE AUDITORÍA EXTERNA PARA DEEPSEEK
**Fecha de corte:** 9 de noviembre de 2026  
**Repositorio:** https://github.com/mrvvergara-afk/Trabajo-Cerca-  
**Proyecto:** Trabajo Cerca, catálogo gratuito de empleos locales en Chile  
**Modalidad solicitada:** revisión técnica independiente, priorizando fuentes públicas, acceso autorizado y costo cero. **No desplegar ni publicar.**

## 1. Objetivo medible

Proponer y, si se dispone de acceso técnico al repositorio, demostrar soluciones que **incrementen los avisos nuevos, verificables y efectivamente publicados**, respetando las restricciones de las fuentes. No interesa una lista de enlaces sin procesar: cada oferta debe demostrar **cargo, empresa, lugar de ejecución, vigencia, enlace de postulación y fuente original**, pasar deduplicación y aparecer una única vez en el catálogo.

**Territorio de 12 comunas (no ampliar):** Angol, Collipulli (incl. Mininco), Ercilla, Lumaco (incl. Capitán Pastene), Los Sauces, Purén, Renaico, Traiguén, Victoria, Mulchén, Negrete (incl. Coihue/Coigüe), Nacimiento. **Quilaco excluida.**

## 2. Diagnóstico que ya está verificado: no repetir auditorías sin avance

- Motor A y Motor D rastrean; B/C deben procesar material documental y colas. Hay URL, contenido y fecha histórica desde septiembre 2026. Los avisos antiguos se incluyen si aún siguen abiertos.
- El GitHub Actions `Motor D - Barrido territorial 12 comunas` ha rastreado fuentes reales y generado lotes; el importador de laboratorio está en `https://trabajo-cerca-laboratorio-3ojgro.v2.appdeploy.ai/`. Una oferta **en lote no significa publicada**: se requiere recibo + ID exacto en feed público completo.
- `automation/motor_d_territorial_daily.py`: consulta las 12 comunas y fuentes ATS/portales. `automation/motor_d_express.py`: convierte fichas individuales verificadas en lotes. `automation/motor_d_catalog_probe.py`: cotejo contra feed completo y normalización de ID de Chiletrabajos. `automation/omil_evidence_gate.py`: ingreso *solo de lectura* de evidencia de afiches con deduplicación, sin autoaprobar.
- `automation/trabajo_cerca/fuentes_diarias.json`: inventario territorial de 39 URL semilla, 23 sitios web y referencias sociales. La existencia de una URL de Facebook/Instagram en el inventario **no equivale a haber leído sus publicaciones**.
- `automation/motor_d_social_access_probe.py` y `automation/motor_d_social_browser.py` probaron acceso HTTP + Playwright público, con respeto a robots.txt. El 9 de noviembre el acceso directo a Facebook/Instagram estaba restringido (`robots_disallowed`); **no se obtuvieron imágenes ni texto de historias**. No inferir “cero empleos” a partir de una fuente inaccesible.
- Indeed devuelve HTTP 403 en el ejecutor; otros portales pueden bloquear según sesión o robots. Chiletrabajos a veces devuelve resultados nacionales cuando se requiere una comuna: usar rutas geográficas con H1/título territorial validado, y verificar el lugar de trabajo en el aviso, no la ubicación de la empresa reclutadora.
- El 9 de noviembre un usuario aportó 3 capturas de historias de `@omilnacimiento`. Eran ofertas de Serfonac ya publicadas originalmente en Chiletrabajos el 5/11: conductor `3923758`, mecánico automotriz `3923364` y mecánico soldador `3923358`. El feed público completo confirmó los tres activos, **sin duplicados por ID original**, en 214 registros. La OMIL anunciaba **jornada presencial el 12/11**; no confundir con fecha original ni cierre de portal.
- `automation/qa_omil_nacimiento_posters.py`, `automation/motor_d_discovery/omil_nacimiento_20261109_evidence.json` e `issue #22` documentan ese caso. Acceso a historias de Instagram sigue sin resolverse, aunque una réplica en portal alternativo permitió localizar los tres trabajos.
- Las claves `MOTOR_D_REVIEW_SIGNING_KEY` / secreto OCR no deben recibirse, copiarse ni registrarse en propuestas. Los afiches y documentos nuevos necesitan revisión firmada antes de publicar.

## 3. Investigación solicitada, por orden

### P0 — Facebook/Instagram: vías reales de acceso autorizado

**Diferenciar claramente**: lectura de una página *propia* mediante token oficial de su administrador; lectura de páginas ajenas según aprobación de Meta y funciones **Page Public Content Access / pages_read_engagement**; contenido de Instagram Professional accesible mediante permisos correctos; y restricciones específicas de las **historias de cuentas ajenas**, donde acceso público/hashtag no garantiza obtener Stories. Investiga las reglas oficiales actuales y señala requisitos, revisiones, límites, si es gratuito, y quién debe conceder acceso.

Diseñar alternativa sin scraping prohibido:
1. Solicitar a OMIL municipal autorización para transmitir avisos a un buzón corporativo o formulario público, feed JSON/RSS o carpeta de afiches; o publicación simultánea en sitio municipal.
2. Recibir afiches que comparta una persona autorizada mediante un formulario de envío voluntario; proceso: hash/archivo -> extracción OCR -> fecha original separada de descubrimiento -> comprobación de vacante individual/empleador/comuna -> cotejo feed completo -> revisión firmada (si falta evidencia) -> lote -> confirmación visible.
3. Descubrimiento indirecto desde **fuentes que reproducen legítimamente el aviso**: web municipal, portal ATS oficial, BNE/Chiletrabajos, medios locales, enlaces compartidos de forma pública y permitida. Exigir enlace y fecha originales cuando existan.
4. Medir comuna × cuenta × fuente: `accessible`, `restricted`, `no_posts`, `job_posts`. **No sumar cuentas restringidas como “0 avisos”.**

No proponer rotación de proxies, evadir CAPTCHAs o robots, uso encubierto de sesiones, robo de tokens, endpoints privados, cuentas falsas, compra de listas ni pagar servicios sin presupuesto.

### P1 — Portales empleo y ATS

Investigar, con evidencia verificable y sin inventar API:
- Chiletrabajos: listado geográfico y fichas individuales, identificador de empleo (últimos números en URL), fecha original y fecha de cierre.
- Indeed y LinkedIn: acceso permitido mediante acuerdos/API oficial o lectura de páginas ATS del empleador. No presentar un HTTP 403 como “resuelto”.
- BNE/Trabajando/Laborum/Computrabajo/Opción Empleo: feeds públicos verificables, licencias y robots específicos, APIs oficiales o enlaces a empleador.
- ATS de CMPC, ARAUCO, Frontel/SAESA, Falabella y otros con trabajo en las 12 comunas. Mostrar qué endpoint se usa, si permite automatización y cómo evitar duplicación cruzada entre ATS, agregadores y afiches.
- Fuentes municipales: RSS, `wp-json/wp/v2` cuando esté habilitado y autorizado, categorías OMIL, comunicados y PDF públicos. Una portada sin enlaces laborales NO implica 0 avisos en las redes del municipio.

### P2 — Flujo real de publicación

Auditar que `radar -> fichas -> verificación flexible -> OCR/revisión firmada -> ready -> importador -> feed público` no pierda ofertas al cambiar de fecha, al caer un portal o al coincidir dos cron. Verificar concurrencia, reintentos idempotentes y retención de motivos de descarte.

**Evitar** aprobación automática por solo detectar keywords, asumirse fecha de publicación desde `observed_at`, asumir ejecución por comuna OMIL, o hacer duplicados porque cambia el slug de Chiletrabajos.

## 4. Entregables exigidos a DeepSeek

1. **Matriz de fuentes** para las 12 comunas, con fuente, método de acceso, condición legal/técnica, evidencia de prueba, costo, periodicidad y status: usable / condicionado / bloqueado.
2. **Tres alternativas viables** ordenadas por impacto × esfuerzo × dependencia de terceros: una sin cooperación de Meta; una con cooperación de OMIL; una con autorización formal de Meta. Cuantificar costos, no inventar probabilidades.
3. **POC mínimo reproducible** (Python o TypeScript), sin claves en texto, con fixture real, pruebas unitarias y fallos explícitos para `robots_disallowed`, HTML vacío, feed incompleto y catálogo no accesible. No publicar ni acceder a datos privados.
4. Análisis de cambios exactos al repositorio (archivo, función, razón, regresión, impacto esperado) y de integración con Motor A/D/B/C.
5. **Plan de cierre de 1 ciclo**: ejecutar rastreo permitido, publicar al menos 1 oferta auténtica no duplicada **si se puede verificar**, mostrar recibo y ID público; si no es viable, evidencia concreta de bloqueo, sin maquillar contadores.

## 5. Formato de la respuesta

- Resumen ejecutivo ≤250 palabras.
- Tabla de fuente/comuna y alternativas técnicas.
- Referencias a **documentación oficial actual** de Meta, portales o proveedores, con fecha de consulta. Diferenciar permiso/función realmente disponible de suposiciones.
- Parches o propuestas de código mínimos, con tests y comandos.
- Riesgos legales, operativos y económicos explícitos.
- Lo que **sí** se puede lograr sin pedir nuevas cuentas y lo que depende de permiso de administradores de OMIL o Meta.

**No solicitar acceso al repositorio privado, secretos, credenciales ni pagos; limitarse a lectura del código público y material facilitado. No realizar despliegues ni cambios directos en producción.**
