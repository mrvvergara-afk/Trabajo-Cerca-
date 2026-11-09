# Revisión documental OCR → Motor D

La cola no autoriza por sí sola. `revisar_ocr.py` firma la decisión con HMAC-SHA256 y `promover_revision_a_motor_d.py` comprueba firma, campos, vigencia y bytes originales descargados nuevamente de una fuente permitida (sin redirecciones y respetando robots). La clave `MOTOR_D_REVIEW_SIGNING_KEY`, de al menos 32 caracteres, debe quedar exclusivamente en el entorno privado del revisor y del productor autorizado, fuera de Git. Sin clave, firma o descarga verificable se generan cero ofertas OCR.

1. Radar/lector conservan SHA-256 y fechas, sin exportar extractos OCR. El adaptador conserva decisiones y verificaciones mientras la evidencia es la misma; revoca autorización al cambiar bytes, fecha, cierre o extractor, y al vencer el plazo de revisión.
2. El revisor contrasta el documento completo y prepara un JSON privado con `title`, `employer`, `work_commune`, `date_source`, `publication_date_confirmed: true`, `application_url` (ruta HTTPS explícita), `deadline` (ISO o null), `vigencia_verified_at`, `revalidate_after` (timestamps con zona; máximo siete días), `extractor`, `work_location_verified`, `employer_verified`, `application_route_verified`, `application_evidence`, `evidence: "individual_page_with_job_terms"`, `http: 200`, `source_commune_not_confirmed: false`. Todos los indicadores deben ser verdaderos, excepto el último. La evidencia debe corresponder al puesto individual, incluso si está dentro de un PDF o afiche. PDF parcial no es suficiente. La fecha original no se reemplaza por el rastreo; una fecha antigua no significa cierre.
3. Con la clave en el entorno privado:

```sh
python automation/revisar_ocr.py --review-id ocr_ID --decision approve --reviewer IDENTIDAD --notes 'Contraste documental y vigencia' --fields /ruta/privada/campos.json
python automation/revisar_ocr.py --review-id ocr_ID --decision reject --reviewer IDENTIDAD --notes 'Motivo de rechazo'
python automation/promover_revision_a_motor_d.py
```

4. Revisar `promotion_preview.json`. Solo tras verificarlo generar lotes con `--produce-batches`. Esta opción escribe en `automation/motor_d_ready`, no publica directamente. Para ensayos usar `--ready-dir /tmp/lotes-ocr`; nunca incorporar fixtures al índice real.
5. Revisar y llevar los lotes e índice a `main` mediante PR. El importador desplegado lee exclusivamente `main`, deduplica contra el catálogo vivo y solo confirma publicación después de observar la oferta en el feed completo. El importador vuelve a descargar los bytes y comprobar el SHA-256; si el documento cambia o no está disponible se detiene sin escribir. La autorización OCR vence también en el importador (`ocr_revalidate_after`); un lote vencido queda procesado sin publicación. Una revisión nueva necesita volver a pasar los controles y no reabre automáticamente un recibo previo.

Las 12 comunas se mantienen; Mininco pertenece a Collipulli y Coihue a Negrete; Quilaco queda excluido. Los dos lotes del 8 de noviembre se conservaron sin alterar sus ofertas en `quarantined_batches` del índice, fuera de la lista importable: existen inconsistencias territoriales y falta de acreditación independiente de vigencia. Requieren revisión real antes de volver a autorizarse.

## Validación aislada

```sh
python -m unittest discover -s automation -p 'test*.py' -v
python -m unittest discover -s automation/trabajo_cerca -p 'test*.py' -v
python automation/qa_a_d_public.py  # solo lectura de producción
```

Dependencias: requests, beautifulsoup4, pymupdf y Node 24. `test_motor_d_importer.py` ejecuta el parser de la versión desplegada `1794174098585` y el puente actualizado con base de datos/feed simulados. Comprueba aceptación del lote generado por Python, idempotencia, bloqueo por vigencia, rechazo de comuna contradictoria y confirmación solo con presencia en catálogo; no escribe ofertas reales.

El cron de Radar promueve revisiones únicamente en `main` y con el secreto GitHub `MOTOR_D_REVIEW_SIGNING_KEY`; si falta registra `OCR_PROMOTION_BLOCKED` y mantiene cero lotes OCR. Las claves locales del revisor y del productor deben coincidir. Los eventos de PR nunca reciben esa clave.
