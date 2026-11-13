# ChatGPT autónomo — contrato de extracción v2 (para sustituir prompts libres tras despliegue)

## Objetivo
Investiga fuentes individualmente en las 12 comunas: Angol, Collipulli, Ercilla, Lumaco, Los Sauces, Purén, Renaico, Traiguén, Victoria, Mulchén, Negrete, Nacimiento. Normaliza Mininco→Collipulli, Coihue/Coigüe→Negrete y Capitán Pastene→Lumaco. Excluye Quilaco y empleos ubicados solo en Temuco/Los Ángeles.

## Acceso permitido
1. Prioriza APIs y ATS oficiales públicos, portales con acceso abierto y feeds documentados.
2. Usa navegador headless solo donde el acceso esté permitido; registra URL, código de respuesta, fecha de visita, evidencia del cargo, empresa, fecha, comuna efectiva y postulación.
3. Respeta rate limits y robots/condiciones aplicables; ante 403, 429, CAPTCHA o login requerido, registra "bloqueado", usa otra fuente pública autorizada y no finge cobertura.
4. No uses ocultación de fingerprint, proxy residencial rotativo para evadir restricciones ni bypass de CAPTCHA/autenticación.

## Contrato de datos por oferta
El resultado intermedio DEBE ser JSON, no texto libre. Debe validar con automation/chatgpt_extraction_schema.json y automation/chatgpt_extraction_contract.py. Por cada oferta se requieren:
- id_fuente: cg_ seguido de 20 caracteres hexadecimales, estable.
- cargo, empresa.
- comunas: una o varias de las 12 comunas/alias, correspondientes al LUGAR EFECTIVO DE TRABAJO.
- ubicacion_trabajo: texto real de ficha que menciona todas las comunas declaradas (o alias).
- modalidad: presencial/hibrida/remota/no_informada.
- salario: texto original o null, nunca inventar.
- url_original: URL HTTPS específica de la oferta.
- enlace_postulacion: enlace real HTTPS o null (si se postula presencialmente).
- fecha_publicacion: fecha original ISO comprobada, no fecha de descubrimiento.
- fecha_descubrimiento: fecha ISO del rastreo.
- fecha_cierre: ISO si existe; en otro caso null.
- justificacion: evidencia corta y procedencia, sin afirmar vigencia si solo hay índice histórico.
El módulo deriva url_canonica y hash_url_sha256 (SHA-256 URL normalizada, sin fragmentos ni tracking), y rechaza un hash inconsistente. Nunca reemplazar URL de postulación con una URL inventada.

## Puertas de publicación (en este orden)
A. Revisar cada una de las fuentes del inventario y reportar visitada/bloqueada/no revisada. No afirmar cobertura completa sin evidencia para cada fuente.
B. Obtener URL individual y constatar continuidad de recepción de postulaciones; fecha límite pasada = rechazar. Sin fecha límite exigir evidencia visible de apertura actual.
C. Validar JSON estricto y comuna real.
D. Calcular URL canónica + SHA-256; rechazar repetición dentro del lote, en index.seen_url_hashes y en catálogo PÚBLICO completo. Mantener también comprobación semántica cargo/empresa/comuna para URLs distintas.
E. Solo después de aprobación verificable se arma lote con approval=approved_for_publication, producer=chatgpt_territorial, schema_version=1 y offers=[...], y se ejecuta automation/stage_chatgpt_handoff.py.
F. Escribir lote e índice en un commit atómico, importar por puente ChatGPT separado de Motor D; comprobar receipts y visibilidad pública real. Un archivo generado NO demuestra publicación.

## Excepciones
Una ficha OMIL abierta sin fecha original debe ir por ruta especial existente de prueba municipal/documental, no falsificar una fecha para satisfacer el contrato. Para varias ofertas en un mismo afiche/perfil social se requieren identidades específicas comprobables; si todas comparten URL genérica sin ficha única, NO usar una URL fabricada o copiar el mismo URL hash para varias vacantes. Registrar el caso para revisión documental diferenciada.

## Resumen operativo
Reportar: fuentes del inventario, visitadas por comuna y estado, verificadas, descartadas, bloqueadas, nuevas tras dedup, publicadas visibles. Etiquetar "sin confirmar" cuando no existe evidencia de publicación real.
