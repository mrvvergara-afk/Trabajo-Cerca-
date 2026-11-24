# Trabajo Cerca — Entrega de implementación integral

24 de noviembre de 2026. Producción observada en AppDeploy **1795487203524**. Rama local **entrega/implementacion-integral-1795487203524**. Base exportada completa, **195 archivos**, Git tag **appdeploy-1795487203524**, commit **3ffaa52b34aad2790f79f9297167ed55ac8fdd90**. El commit consolidado se obtiene con `git rev-parse HEAD`.

## Conciliación y alcance

El snapshot activo confirmó la base de la auditoría. Al comenzar esta fase, GitHub main había avanzado de `dddcb4f3c045abf032ebb682cc10fd7c7756676e` a `9a3d5314b48165963214bc3f0153dac77dd9352f`. Su diferencia consistía en siete archivos de evidencia y estado de Motor D, sin cambios del código de la aplicación. Esos datos siguen en GitHub; la rama AppDeploy usa el export activo como base y deja los datos del productor en su repositorio. Para el handoff ChatGPT, se integraron el contrato y las pruebas de GitHub como código operativo separado en `automation/`. Se aplicó el diff de la auditoría sin conflictos y se conservaron recursos, diseño y componentes comerciales.

| Motor | Implementación entregada | Situación que falta demostrar |
|---|---|---|
| A | RSS/Atom estructurado, separación de documentos incluso en la ruta de onboarding, destino PDF/imagen por enlace autorizado. Para Trabajando.cl, XML por ventanas, prefijo verificable, reintentos acotados, espera por host ante 429, cuarentena durable y recibos de visibilidad. | Rendimiento del barrido nacional en AppDeploy, capacidad bajo fuentes reales y latencia desde descubrimiento. La ventana todavía relee el prefijo y reinicia al cambiarlo. |
| B | PDF digital, PDF escaneado y afiches PNG/JPEG/WebP por el cron B/C existente. OCR español con datos empaquetados, límite de bytes/píxeles/páginas, dos documentos por ejecución, reclamo condicional y recibo por intento. Se puede recuperar el resultado durable después de un fallo al actualizar el checkpoint B/C. | Ejecutar canvas, PDF.js y el worker OCR dentro del runtime AppDeploy completo. Un resultado OCR aporta evidencia y queda pendiente si falta fecha, postulación o confirmación de lugar. No se habilitó publicación de un afiche solo por OCR. |
| C | Lectura del handoff A independiente del feed, prioridad de fichas recientes, conteo de enlaces sin adaptador, diferidos y última ejecución útil. RSS/Atom alimenta la misma admisión. Guarda atribución C cuando el verificador aprueba una ficha. | Validar la utilidad de cada fuente. Se pudo reconciliar un ciclo real de 34 enlaces con logs del snapshot activo. |
| D | Salta referencias inválidas y archivos ausentes/no aprobados, registra espera o bloqueo por versión del índice, distingue entradas nuevas, duplicados y expiración, exige visibilidad verificada. | Ejecución autenticada con lote real. Fallos posteriores de OCR/autorización/verificación en un lote aún pueden detener ese ciclo. |
| ChatGPT | El generador de lotes serializa por bloqueo local, escribe mediante fsync y rename, recupera lote huérfano y conserva la exigencia de aprobación. Importador con cuatro archivos intentados por ciclo, retroceso persistente, cuarentena por versión del índice, clasificación de duplicados/correcciones/expiración y confirmación verificada. | El rastreador externo tiene que entregar JSON revisado y publicar lote más índice en un solo commit GitHub. El índice observado seguía terminando en el 18/11. Los reportes de cobertura quedan separados de la aprobación. |
| Gemini | Progreso persistente separado de errores, cursores ligados al SHA, reserva por intervalo, entradas ya encoladas se omiten, retención de cursor limitada y procedencia Gemini desde inbox a catálogo. | Barridos reales consecutivos en el runtime, fallos de GitHub y atribución al catálogo para las entradas efectivamente aprobadas. |

Laborum, Opción Empleo, Chiletrabajos, BNE, Empleos Públicos, Arauco/ATS, municipios, OMIL y salud conservan sus reglas de identidad y fuentes actuales. Los cambios comunes de transporte y RSS pueden beneficiar a esas rutas. Opción Empleo se usa como agregador y la ficha original sigue siendo obligatoria. LinkedIn, Indeed y Computrabajo respetan robots, errores de acceso y las reglas del publicador. No se acreditó un nuevo feed/API autorizado para esos portales ni se incorporó un método de evasión. La cobertura real de cada fuente sigue siendo una medición del laboratorio productivo.

### Contraste con registros de producción

La consulta final de estado AppDeploy incluyó logs del 24/11. A las 11:47 UTC el extractor activo volvió a registrar cero fichas y exceso de bytes en ambos sitemaps. A las 11:38 UTC A registró cinco documentos pendientes y B informó cero elegibles a las 11:42 UTC. La identificación individual de esos cinco requiere filas, además del log. En el ciclo C de 09:12 UTC, 34 enlaces = 32 ya tratados + 1 diferido por indicio territorial + 1 revisado, pendiente por lugar de trabajo. A las 11:35 UTC, ChatGPT registró 128 h desde el último lote según el reloj del puente y 4/4 procesados. D informó 30 lotes procesados y 2 en cuarentena de 32. Gemini a las 09:13 UTC informó 5 duplicados y 0 nuevas colas; el cursor de verificación seguía en 36 por una comprobación incompleta. Los logs acreditan actividad del snapshot anterior, sin atribuirle nuevas publicaciones a una verificación.

## Cola, catálogo y panel

- `backend/verification-work.ts`: prioridad de admisión, reserva de la mayoría del presupuesto A para entradas nuevas cuando existe trabajo, cola separada de recuperación, reserva por token (3 min), comparación de estado en commit, máximo cinco intentos para evidencia invariable y reapertura ante evidencia nueva. Guarda resultado, intento y cambio pendiente de proyección en una sola transacción. Si se desconoce el resultado de escritura consulta el recibo. Usa el barrido legado como reconciliación.
- `backend/index.ts` y `cron.json`: cuatro verificaciones concurrentes y hasta 24 por ciclo cuando hay presión de entradas nuevas. Cola y feed cada cinco minutos. Los puentes más costosos mantienen la cadencia de 15 minutos. Las capturas de telemetría se mantienen en sus seis horarios por la ruta del publicador, para respetar el máximo de seis crons. La cifra de capacidad nominal no es rendimiento de producción.
- `backend/public-feed.ts`: hojas inmutables, reserva de publicador y comparación del control, transacción del puntero, copia de respaldo, primeras visibilidades y contador de hora. Rechaza pérdidas de publicaciones vigentes sin motivo comprobado. Identidades ya visibles o ya registradas no incrementan primeras publicaciones. Los pasos de arranque sin manifiesto previo no atribuyen retrospectivamente altas al código nuevo.
- `backend/operational-metrics.ts`: eventos de primera visibilidad de productores instrumentados, latencia por histogramas y atribución conocida. Los relojes que faltan se guardan como null. El panel usa el diseño existente para mostrar observación de la cola, última ejecución útil y distribución por motor. Distingue muestra, ausencia y error. No se completó la atribución histórica de candidatos ni la atribución múltiple de todos los duplicados. La vista muestra límites superiores de intervalos para P50/P95/P99.
- Reglas territoriales estrictas y regresiones para alias, lugar real en JobPosting, La Victoria de Santiago, Nueva Victoria y los tres avisos históricos de INMEL. Temuco y Los Ángeles permanecen complementarios y fuera del catálogo principal nuevo.

La lista íntegra de archivos se puede obtener con `git diff --name-status appdeploy-1795487203524..HEAD`. El diff consolidado externo está en `entrega-trabajo-cerca/consolidado.patch`.

## Pruebas y resultados

| Prueba | Resultado observado |
|---|---|
| Node, unidades, territorio, XML, cursor, recibos, recuperación y simulación de carga | 22 casos locales. Simulación de 120 pendientes, 12 entradas y hasta 24 salidas por ciclo. Llega a 0 al décimo ciclo, con 240 recibos únicos. No es throughput AppDeploy. |
| OCR real local (Tesseract + PDF.js) | Pasó con un afiche PNG y un PDF de solo imagen. Rechazó MIME incoherente y exceso de bytes. Fixture sintético con lectura real, sin invocación de servicios externos. |
| Python, contrato y preparación ChatGPT | 35 pruebas pasaron, incluida recuperación de archivo sin índice y rechazo de datos de cobertura sin aprobación. |
| AppDeploy SDK real | App nueva e independiente, `trabajo-cerca-qa-sdk-aislado-lykn7b`, sin credenciales ni conexiones con producción. A las 11:45:52 UTC confirmó `uniqueLease=true, committed=true, receipt=true, projectionQueued=true`. Usó el código de reserva/commit y una oferta sintética. No ejecutó OCR ni publicó una oferta en el catálogo oficial. |
| Navegador Chromium local | 320, 375, 430 y 1.440 px, sin overflow horizontal general ni errores JS del panel. El cliente SDK fue sustituido por fixture en el navegador y se bloqueó la red externa. |
| Producción, lectura pública | 290 registros completos en el catálogo, 286 ofertas únicas, 286 verificadas declaradas, 12 páginas, actualizado 11:35:19 UTC. La API administrativa devolvió 401 sin sesión. Cifras anteriores al parche; no hay un después en producción. |
| Build y tipos | Build Vite con cliente de prueba pasó. El SDK/cliente completo lo inyecta AppDeploy y no está en el export. TypeScript con declaraciones de la referencia del SDK mejoró frente a la base, con incidencias preexistentes que la prueba de compilación integral del runtime aún debe resolver o clasificar. |

Para repetir localmente:

    npm ci --legacy-peer-deps --ignore-scripts
    node --test tests/*.test.mjs
    python -m unittest discover -s automation -p 'test_*.py'
    node tests/browser/check.mjs

El último comando requiere Chromium y un puerto local disponible. Para repetir la prueba SDK real, consultar la app aislada y su GET de resultado. Para repetir feed de producción se puede usar el verificador de solo GET de la auditoría anterior.

## Gate, despliegue y reversión

**NO-GO para producción.** El SDK confirmó la reserva y el commit con fixture. Falta ejecutar la aplicación consolidada de extremo a extremo en un laboratorio con escritura y credenciales independientes. En ese laboratorio se exige comprobar importación de D, ChatGPT y Gemini, OCR con binario nativo empaquetado, catálogo íntegro y primera publicación real por candidato, vigencia, tiempos y panel autenticado. Hace falta además una ventana con entradas y salidas reales para comprobar si la meta de 15 minutos se sostiene.

1. Comparar la fuente activa del destino con la etiqueta de base. Mantener respaldo de fuente, IDs de manifiesto activo y último bueno, crons y datos de cola. Si la fuente difiere, cotejar y aplicar el diff sobre el export del destino. No reutilizar el ID oficial como destino de ensayo.
2. El laboratorio debe tener tablas y recursos propios, credenciales de solo lectura para GitHub y corpus saneado. No utilizar el laboratorio anterior si su independencia de escritura no está comprobada. En AppDeploy, sobre una base compatible, enviar solo archivos de runtime modificados (backend, src, shared si cambia, package.json y cron.json) y el manifiesto de pruebas si corresponde. `automation/` y los fixtures JS se ejecutan fuera del despliegue. Confirmar que AppDeploy instale el paquete de idioma español y los binarios de canvas, y soporte PDF.js y workers nativos.
3. Confirmar 6 crons, bloqueo de endpoints admin sin sesión, reconciliación del manifiesto y admisión de fixtures con reinicio y concurrencia. Después procesar ofertas reales autorizadas, comprobar IDs y contenidos mediante API pública del laboratorio, autoridad de fecha/lugar y latencia de ingreso a visibilidad. Revisar colas y cuotas antes de autorizar producción.
4. En caso de reversión, restaurar la versión anterior del laboratorio o el commit de base, incluido el cron anterior. Volver a formato string en `trabajando_targeted_state.queue` o recuperar checkpoint de respaldo. Guardar el estado nuevo aparte para conciliación. Conservar `tc_*` y recibos de auditoría. Usar el último manifiesto íntegro solo después de reconciliar ofertas realmente visibles, para no deshacer cierres o publicaciones válidas. No purgar tablas ni tocar secretos en un rollback.
