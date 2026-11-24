# Validación operativa aislada — 24 de noviembre de 2026

El laboratorio usa el ID AppDeploy `trabajo-cerca-qa-sdk-aislado-lykn7b`. Sus tablas y su almacenamiento pertenecen a esa app. No se enlazó ningún secreto de producción. El catálogo oficial solo se consultó por GET y sirve de referencia, con 286 ofertas verificadas en el corte obtenido. El laboratorio arrancó con manifiesto vacío y una fila sintética residual de la prueba anterior del SDK, que no se proyectó. No se hizo una importación de los 286 avisos ni una migración de sus estados.

## Evidencia de publicación real

Se descubrió en el índice público de ChileTrabajos una ficha de Angol y se confirmó la identidad de su JobPosting, el lugar real, su fecha, su vigencia y el enlace de postulación. Se ejecutó el mismo Motor A con una entrada acotada para reproducir el circuito en el laboratorio. A registró dos nuevas ofertas, el publicador confirmó ambas y una consulta independiente las encontró verificadas y no duplicadas en el catálogo.

| Aviso visible | Fecha original UTC | Cierre UTC | Latencia descubrimiento → primer manifiesto |
|---|---|---|---:|
| Conductor/a Clínico Urgencias Angol · Xinerlink | 18/11/2026 15:19:56 | 01/02/2027 15:19:56 | 31,092 s |
| Conductor profesional con vehículo sedán/diesel · Angol | 13/11/2026 11:36:00 | 27/01/2027 11:36:00 | 31,092 s |

Los dos recibos tienen hora de descubrimiento 12:15:15.736 UTC, visibilidad 12:15:46.828 UTC y manifiesto `952cc521-28f3-47b9-b24a-0930046de839`. Ambos cumplieron 15 min. Esta prueba cubre un ciclo acotado y dos muestras con el mismo inicio. No acredita el percentil operativo de 15 min durante un día ni rendimiento de las otras fuentes.

### Carga acotada y colas

Tras la publicación todas las 13 lecturas, en tandas de 1, 4 y 8 lectores, devolvieron 200, el mismo corte y las dos verificadas sin degradación. El P95 observado de ocho lecturas fue 1,168 s bajo esa pequeña muestra. Es latencia HTTP, distinta de latencia de publicación.

El publicador procesó dos nuevas altas y los recibos quedaron conciliados. No hubo una cola de candidatos lista en la muestra de este ensayo. No hay evidencia de reducción sostenida bajo llegada concurrente de candidatos reales. El test paralelo de leases y recuperación por respuesta de commit ambigua se conserva como simulación; el lease único y la escritura atómica se comprobaron antes con el SDK real y datos sintéticos.

### Atribución histórica disponible

`automation/reconcile_public_attribution.py` recorrió el catálogo oficial a las 11:50:42 UTC y contrastó 286 fichas verificadas con 100 entradas de lotes públicos D y ChatGPT. Encontró 33 coincidencias exactas por ID D, 8 por ID ChatGPT, una corroboración por ambos motores y 221 avisos sin evidencia pública en esos dos índices. Coincidir por fuente, cargo y empleador corrobora una oferta; la identidad exacta aporta procedencia del productor. Falta evidencia para reconstruir la atribución completa de A, B, C y Gemini y los tiempos históricos. Se dejaron los casos sin datos como tales.

## Despliegue y configuración

- El export completo se aplicó sobre el proyecto aislado que tenía el banco de pruebas del SDK. Se mantuvo el proyecto oficial en la versión 1795487203524. El laboratorio se publicó con noindex y robots de exclusión. La referencia al icono en el HTML utiliza un SVG disponible en el snapshot.
- El laboratorio carece del manifiesto de reconciliación de la DB oficial. El runtime inicialmente registró `Identity reconciliation baseline unavailable or oversized`. Se aisló la dependencia en `backend/feed-reconciliation-config.ts`. La rama conserva el valor oficial; el overlay del laboratorio lo define como `undefined`.
- Los archivos de ensayo de `automation/lab/` se despliegan con sus rutas backend respectivas. El probe OCR inserta la imagen de `ocr-fixture.base64` en lugar de `__OCR_FIXTURE__` y deja solo un recibo por etiqueta. `GET /api/lab/evidence` devuelve resultados acotados del laboratorio. Los hooks de prueba están habilitados solo para ese ID, mediante el overlay del `backend/index.ts`: `runLabOcrProbe` dentro de B/C y el cron de publicación, `runLabTargetedDiscovery` únicamente en minutos múltiplos de 15. La fuente programada habitual permanece en su cron.
- Los puentes públicos D y ChatGPT aceptan lectura sin token cuando no existe uno. El módulo de configuración ChatGPT conserva `main` y `automation/chatgpt_ready/` como destino oficial. El ensayo de publicación de lote revisado está fijado al commit `bb3b62ab693f4c13a5a269953afd10088146bc5b` y a `automation/lab/chatgpt_ready/`. El lote `chatgpt-20261124-7ba3e3b05c0ee58a39` usa la ficha real de Xinerlink revalidada. Es un ensayo del contrato y de la entrega usando GitHub. El productor autónomo externo y su calendario requieren su propio acceso.
- El build del backend rechazó canvas nativo y el runtime rechazó `require.resolve` durante OCR. Las correcciones extrajeron las imágenes XObject de PDF, usaron PNG sin canvas e incorporaron Tesseract Core 6.1.2 y el modelo español comprimido, íntegro por SHA-256. El modelo se deriva de `@tesseract.js-data/spa@1.0.0` (`4.0.0_best_int`), datos [tessdata_best](https://github.com/tesseract-ocr/tessdata_best) con licencia Apache-2.0. El generador reproducible está en `automation/lab/rebuild_ocr_model.py`, y la licencia se incluye junto con él.
- El panel de administración en el navegador mostró acceso restringido. La API respondió 401 al cliente sin sesión. La prueba autenticada requiere una sesión AppDeploy del laboratorio cuyo correo verificado esté en la allowlist administrativa. Gemini requiere vincular a la app aislada `MOTOR_C_GITHUB_READ_TOKEN`, token propio con permiso Contents de lectura para `mrvvergara-afk/motor-rastreo-gemini`. El conector externo leyó el productor (143 fuentes intentadas, 73 accesibles, 70 bloqueadas) y el blob de cola (45 confirmadas principales y 8 pendientes principales), lo que acredita el origen pero no la importación de AppDeploy.

## Repetición y reversión

- Fuente de la app: rama GitHub `entrega/implementacion-integral-1795487203524`. La versión estable antes de OCR WASM y el lote de ensayo fue `1795522341684`. El ensayo WASM/ChatGPT fue `1795522581074`. Para revertir en el laboratorio usar exclusivamente su ID y revisar después `/api/listings?fresh=1` y `/api/ops/radar-feed`. Preservar los recibos en DB.
- Para repetir la carga de lectura: `python automation/lab/read_catalog_load.py`. Para verificar la fuente del modelo tras `npm ci --legacy-peer-deps --ignore-scripts`: `python automation/lab/rebuild_ocr_model.py`. Pruebas: `node --test tests/*.test.mjs` y `python -m unittest discover -s automation -p 'test_*.py'`.

## Resultados adicionales del runtime

- **D**. El catálogo confirmó `chatgpt_d_9e173e643c73999fa7f6`, «Se buscan enfierradores Nacimiento», con comuna Nacimiento, fecha original 04/11/2026 y cierre 18/01/2027. Coincide por ID con el lote aprobado `motor-d-20261105-587316aa026504f6c4` de GitHub. Primer manifiesto `e0be4342-a284-48bb-a78d-5b84b53bdad6`, visible a las 12:20:30.093 UTC, **11,305 s desde la cola de proyección**. No hay timestamp de descubrimiento de D para medir su latencia completa.
- **OCR empaquetado**. El probe de AppDeploy pasó a las 12:20:14 UTC con `tesseract_local_spa` y sin error. Usó un afiche controlado. El PDF escaneado se comprobó localmente con OCR real; el ensayo operativo no encontró un documento municipal nuevo elegible que llegara a publicación.
- **Trabajando.cl**. A las 12:17 UTC leyó un sitemap, encoló cuatro enlaces y registró cero errores en ese ciclo. Todavía no acredita recorrido de fichas de extremo a extremo desde ese sitemap. La publicación acreditada de A procede de ChileTrabajos.
- **Reversión real**. Se reactivó `1795522341684` sobre el mismo laboratorio y se verificaron las tres fichas, el mismo corte 12:20:27.224 UTC y los mismos IDs, sin cambios en el JSON de comparación. Luego se reactivó `1795522581074`. No se restauró ni se reemplazó la DB. La app oficial quedó fuera del ensayo.
- **Salud del catálogo**. El manifiesto completo reportó 3 visibles verificadas, 0 cambios pendientes, y páginas conciliadas. La referencia de 286 corresponde al catálogo oficial, no a este conjunto nuevo. Falta una prueba de migración diferencial con fechas y evidencia histórica para verificar qué avisos deberían conservarse o salir.

## Gate restante

NO-GO para producción. A y D ya demostraron publicación real en laboratorio y se verificaron OCR empaquetado y reversión de código. Siguen abiertas la importación privada de Gemini, la sesión autenticada del panel, una muestra sostenida de llegadas y salidas reales y la conciliación de migración con la base oficial. La generación autónoma externa de ChatGPT sigue dependiendo del acceso a su planificador, aunque el lote revisado de laboratorio ya está en GitHub. No se habilitaron permisos extra ni se tocaron credenciales de producción.

### Contraste del lote ChatGPT y verificación de la ficha D

El bridge leyó el lote de prueba desde GitHub a las 12:20:17 UTC. El recibo registró **un duplicado, cero altas y cero caducados**. La ficha ya se había publicado por A, de modo que se comprobó el envío, la lectura del lote revisado y la deduplicación, con corroboración de A y del lote ChatGPT. El calendario real del productor externo sigue pendiente y no se escribió en su índice oficial.

Para la ficha D, el ID y su fecha de cierre se conciliaron con el lote aprobado y la API pública; la relectura independiente posterior de la ficha fuente agotó el tiempo de espera. El resultado operativo acredita importación y proyección con la evidencia del lote. No acredita una segunda lectura viva de esa ficha en ese intento.

El snapshot final de laboratorio es **1795523019719**. Expone un resumen acotado de los puentes y ejecuta una comprobación única de acceso de Gemini desde el cron en ese laboratorio. El bundle que se ensayó en **1795522581074** y el snapshot final empaquetan el mismo motor OCR. La lectura de identidades del laboratorio devolvió `complete:true`, `provisional:false`, 3 registros y 3 IDs únicos. Los crons de producción siguen sobre **1795487203524**.

### Referencias

- [Laboratorio AppDeploy](https://trabajo-cerca-qa-sdk-aislado-lykn7b.v2.appdeploy.ai/)
- [Recibos operativos acotados del laboratorio](https://api-v2.appdeploy.ai/app/trabajo-cerca-qa-sdk-aislado-lykn7b/api/lab/evidence)
- [Identidades visibles del laboratorio](https://api-v2.appdeploy.ai/app/trabajo-cerca-qa-sdk-aislado-lykn7b/api/listings/identities)
- [Lote revisado de ensayo](https://github.com/mrvvergara-afk/Trabajo-Cerca-/blob/bb3b62ab693f4c13a5a269953afd10088146bc5b/automation/lab/chatgpt_ready/20261124/chatgpt-20261124-7ba3e3b05c0ee58a39.json)

### Corte operativo ampliado del 24 de noviembre

- El laboratorio acumuló 45 recibos de primera visibilidad y reportó 45 fichas en el manifiesto completo, con cero cambios de proyección pendientes y cero verificaciones listas en el momento del muestreo. Los recibos atribuyen 18 a A y 27 a D. La cola en cero en ese corte no permite calcular una tasa sostenida de reducción.
- A tiene 17 recibos con latencia medible de descubrimiento a visibilidad. Diez quedaron bajo 15 minutos. El P50 es 110,262 s y el P95 y P99 son 3.729,118 s (rango más próximo; muestra pequeña). Un recibo carece de fecha de inicio. Para D los 27 recibos miden desde la cola de proyección: entre 0,710 y 11,305 s. No se conoce el tiempo transcurrido desde el descubrimiento externo de D.
- El proceso combinado B/C de las 20:12 UTC reportó un documento completado acumulado, cero PDF restantes y ocho fichas HTML examinadas, cinco bloqueadas y cero HTML verificadas en ese ciclo. Los bloqueos correspondían a documentos DOCX que requieren lector local. Tres fichas HTML quedaron pendientes por ambigüedad de fuente o lugar de trabajo. El OCR empaquetado quedó acreditado con el control conocido.
- Gemini registró en el propio runtime `missing_github_read_token`. La inspección del panel después de reanudar volvió a mostrar acceso restringido. Falta una sesión AppDeploy autorizada para confirmar el cuadro de mando con datos reales.
- D registró `import_error` al alcanzar `motor-d-20261120-a9e1312c01453fbd0c`. Se guardan por lote los fallos de importación y los recibos incongruentes, y se sigue leyendo el índice. Se conserva el límite de cuatro archivos por ejecución y se reintentan fallos transitorios hasta cinco veces. Una regresión verifica el avance al siguiente lote y que el lote rechazado no se relea mientras su índice siga igual.
- La lectura pública recorrió las dos páginas de identidad y devolvió 45 IDs únicos, con cierre de recorrido confirmado. La corrección de D compiló y AppDeploy dejó lista la versión `1795551497165` en el laboratorio. La suite final local aprobó 23 pruebas Node y 37 pruebas Python.
