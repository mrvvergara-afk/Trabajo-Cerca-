# PoC: lector documental de fuentes locales (costo de API = $0)

**Rama aislada. No modifica AppDeploy, producción, base de datos, crons ni PR #2.**

El lector toma una exportación de solo lectura del endpoint
\`GET /api/ops/free-public-sources\`, especialmente \`documentWork.items\`.

- HTTPS y lista cerrada de dominios institucionales.
- Respeta robots.txt y rechaza redirecciones.
- Límite de documentos de 6 MB, 30 páginas y 20 elementos por ejecución.
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

Este PoC no está integrado todavía al motor diario. No cuenta como publicaciones nuevas.
