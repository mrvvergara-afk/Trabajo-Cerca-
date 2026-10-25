# PoC: lector documental de fuentes locales (costo de API = $0)

**Rama aislada. No modifica AppDeploy, producción, base de datos, crons ni PR #2.**

La ruta de diagnóstico **que expone el backend** es `/api/ops/free-public-sources`. Se prueba con el dominio público real del laboratorio. Si no es accesible desde GitHub Actions, la ejecución genera un recibo `endpoint_unavailable` y termina con fallo verificable. Nunca sustituye una respuesta real por datos simulados.

El lector toma una exportación de solo lectura del endpoint
\`GET /api/ops/free-public-sources\`, especialmente \`documentWork.items\`.

- HTTPS y lista cerrada de dominios institucionales.
- Respeta robots.txt y rechaza redirecciones.
- Límite de 6 MB por imagen y 16 MiB por PDF, coherente con el verificador documental de la aplicación.
- Para PDF de más de 30 páginas se extrae **solo una vista previa de seis páginas** y queda marcado `documento_parcial_revision_obligatoria`; no es verificación integral ni publicación.
- Extracción local de texto de PDF (PyMuPDF) y HTML.
- OCR gratuito **Tesseract español** para imágenes públicas (JPEG/PNG/WebP) y hasta tres páginas de PDF escaneados, limitado en tiempo y tamaño.
- No hay OCR externo, Bright Data, Tavily, EXA ni IA remota.
- Las imágenes que el OCR no logra leer quedan marcadas para revisión humana, no como anuncios.
- Determina señales laborales, localidades y posibles plazos; reconoce expirados.
- **No publica automáticamente ni confirma empleador/vigencia.** Genera candidatos para revisión.
- No expone enlaces personalizados o claves en un servicio adicional.

Para ejecutar en Python con acceso a fuentes públicas:

\`\`\`sh
python -m pip install pymupdf pytesseract pillow
# Además instalar Tesseract OCR + datos de idioma español en el sistema
python -m unittest discover -s tools -p 'test_lector_documental.py'
python tools/trabajo_cerca_lector_documental.py --max-items 8 --output reporte_documental.json
\`\`\`

También acepta JSON exportado manualmente:

\`\`\`sh
python tools/trabajo_cerca_lector_documental.py --input inventario.json --max-items 8
\`\`\`

**Siguiente paso, solo después de obtener resultados reales:** enlazar un proceso de revisión/autorización y publicación con recibos de origen, deduplicación y fecha de vencimiento. No reactivar proveedores pagados ni habilitar endpoints de escritura anónimos.

El workflow ejecuta primero una muestra acotada de fuentes municipales de URL pública, y diagnostica por separado la ruta interna de la cola. La prueba de la cola se registra como fallo si devuelve HTML en vez de JSON; la prueba sobre fuentes públicas puede finalizar aunque esa dependencia no esté accesible.

El workflow puede ejecutarse al abrir un PR borrador hacia main, sin fusionar archivos. Los trabajos `push` están acotados a esta rama y la acción no tiene permiso de escritura.

Este PoC no está integrado todavía al motor diario. No cuenta como publicaciones nuevas.
