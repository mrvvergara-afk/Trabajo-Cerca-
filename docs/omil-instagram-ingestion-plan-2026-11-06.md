# Trabajo Cerca — Ingesta OMIL desde Instagram / redes (BORRADOR SIN DESPLIEGUE)
Fecha: 2026-11-06. Preparación aislada de main. Ninguna tarea ni API activa.

## Hallazgo verificable
- OMIL Angol: https://www.instagram.com/omilangol2026/ (registrado en motor-b-sources.ts; publicación individual NO verificada por API).
- OMIL Victoria: https://www.instagram.com/omil_victoria/ (cuenta reconocida en documentación municipal de victoriachile.cl).
- En la prueba GitHub Actions 42157840484 de 2026-11-06, HTTP y Playwright devolvieron robots_disallowed para las fuentes sociales probadas; 0 imágenes leídas, 0 avisos extraídos.
- La rama main tiene scripts de diagnóstico: automation/motor_d_social_access_probe.py y automation/motor_d_social_browser.py. No confundir 'workflow success' con lectura efectiva.
- backend/security-policy.ts mantiene paidProviders:false, remoteAi:false; no activar productos pagados por accidente.

## Estrategia por prioridad (costo de licencia objetivo: 0)
1. **Meta Instagram Graph API Business Discovery (experimento controlado)**: crear/usar Instagram profesional de Trabajo Cerca vinculado a Facebook Page, cuenta Meta Developers, permisos y autorización de Meta pertinentes. Consultar publicaciones *solo* de cuentas OMIL públicas de tipo Business/Creator, con campos caption, timestamp, permalink, media_type y media_url cuando disponible. Confirmar requisitos y App Review en la cuenta real, nunca afirmar acceso sin prueba. No sirve para cuentas personales o Stories ordinarias. Tratar tokens como secretos, nunca en GitHub ni chat.
2. **Canal cooperativo municipal**: ofrecer a cada OMIL un formulario directo de publicación o envío de correo/archivo, con afiche, fecha de publicación, cargo, lugar de ejecución, contacto/postulación y estado abierta/cerrada. La ingesta debe poder funcionar sin que la OMIL tenga API, acceso concedido a terceros ni conocimientos técnicos. Solo leer adjuntos recibidos por autorización.
3. **Duplicados oficiales / espejos**: consultar sitio municipal, BNE, portal del empleador y páginas institucionales para la misma oportunidad. No dar por hecho que todo Instagram está republicado.
4. **Revisión asistida de excepciones**: cuando no exista API ni canal de cooperación, registrar cuenta como 'fuente_no_cubierta', sin falsificar rastreo, y permitir carga humana puntual de afiches con fuente individual. No almacenar claves ni ejecutar sesiones falsas.

## Registro de fuentes propuesto
Campos:
- commune, canonical_handle, profile_url, verified_institutional_account, verification_evidence_url
- platform, account_type: unknown|personal|business|creator
- channel: meta_business_discovery|municipal_feed|authorized_submission|manual_review|uncovered
- last_checked_at, last_post_seen_at, coverage_state, access_reason, latest_evidence_ref
- last_accepted_post_id, last_accepted_post_url, accepted_count, duplicate_count, rejected_count, blocked_count
No inferir que un perfil es Business/Creator por su nombre.

## Pipeline desacoplado
A y D detectan URLs/IDs de fuentes autorizadas y continúan el rastreo.
Canal de ingesta social recibe {social_post_id, permalink, account, timestamp, caption, media_refs, retrieved_at, authorization_method}.
B extrae texto de caption/imagen PDF/afiche cuando exista evidencia y con tamaño y tiempo acotados.
C aplica verificación flexible: entidad emisora acreditada; cargo identificable; comuna de ejecución o reclutamiento claramente diferenciados; fecha de fuente y postulación; no duplicado por permalink ni por cargo+empresa+comuna.
C solo publica después de verificación positiva; 'desconocido' se archiva como evidencia no publicable.
Historial congelado B/C jamás se reabre. Publicaciones oficiales sin fecha de cierre son publicables si la oportunidad es actual; 20 días internos por defecto cuando la fuente no declara abierto y no informa cierre, siempre conforme a las reglas aprobadas.
No tratar antigüedad de la carpeta de un afiche como fecha oficial del aviso.

## Dedupe
1. Identidad de post de Instagram (shortcode normalizado), no solo perfil.
2. URL oficial de postulación o ID ATS/BNE.
3. Hash normalizado (cargo, empleador, comuna de ejecución y fecha de origen cuando disponible).
Si el mismo aviso aparece en A, D e Instagram, actualizar evidencia y fuente, NO sumar otro aviso.
No usar la URL del perfil OMIL como enlace individual de 10 puestos distintos si existe permalink específico.

## Control de velocidad
- No interrumpir barridos A/D.
- Primera pasada: descartar material explícitamente no laboral.
- Lectura y clasificación por lote acotado y con resolución terminal; errores de red no equivalen a oferta cerrada.
- Registro técnico de la cuenta inaccesible (sin reintentos cada cinco minutos).
- KPIs separados: fuentes probadas, cuentas realmente accesibles, publicaciones detectadas, afiches realmente leídos, ofertas aprobadas, publicaciones visibles y duplicados evitados.
- Cero anuncios publicados a partir de 'profile access success' sin leer el post y su evidencia.

## Pruebas de aceptación antes de autorización para desplegar
- A: cuenta profesional pública OMIL con publicación reciente accesible por Business Discovery -> media + fecha + permalink registrados.
- B: afiche con 2 ofertas -> 2 fichas desduplicadas correctamente, lugar de ejecución real.
- C: publicación no laboral -> descartada en primera pasada.
- D: mismo aviso por BNE y OMIL -> una ficha pública.
- E: cuenta personal / privada o sin permiso -> uncovered, NO oferta inventada.
- F: error de Meta/429 -> cooldown por cuenta sin bloquear rastreo.
- G: publicación sin fecha cierre -> publicable y vence según regla, o revalida si fuente dice abierta.
- H: prueba de cobertura de las 12 comunas y fuente de Instagram original.

## Datos por confirmar externamente (no bloquean seguir preparando)
- Si la cuenta de Trabajo Cerca dispone de Instagram Business y página Facebook enlazadas.
- Si OMIL Angol y Victoria son Business/Creator (no se puede asumir).
- Si Meta concede acceso Business Discovery en el contexto y permisos reales de esta app.
- Si las OMIL aceptan feed/correo/formulario de difusión. Empezar con Angol y Victoria como pilotos.

IMPORTANTE: Esta especificación NO declara API conectada, ofertas capturadas ni deployment completado.
