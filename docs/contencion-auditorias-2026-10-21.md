# Trabajo Cerca — primera contención aplicada tras la segunda auditoría

Fecha: 21 de octubre de 2026. App de laboratorio: https://trabajo-cerca-laboratorio-3ojgro.v2.appdeploy.ai/
**Versión aplicada y ready: 1792609717327. Sigue NO APTO para lanzamiento público general.**
Rama exclusiva: repair/mulchen-captura-2026-10-17. Main conserva fab392b824e4100a4bba6dfe9289825297d24707.

## Resultado comprobado

La segunda auditoría se incorpora como evidencia de prioridades, con sus precisiones: el nombre real mergeRediscoveredEvidence, el aviso legal alternativo que mitiga parcialmente A07 y las diez suites Node que ejecutaba scan. A15, A18 y la verificación independiente del estado de protección de main no se dan por cerrados.

Esta entrega aplica contención de la superficie y del gasto. No promueve producción, no modifica credenciales ni cambia los seis crons, sus frecuencias o los históricos. No publica ofertas nuevas.

## Correcciones

- Cinco invocaciones manuales del motor ahora tienen requireAuth() del SDK y denegación adicional para todo usuario. El GET territorial ya no ejecuta una mutación. No se ha inventado una identidad administradora. Hasta configurarla, no hay una vía manual habilitada para nadie.
- El receptor nativo con firma y validación de lotes conserva su ciclo programado. El botón/POST manual de consumo queda cerrado; esto puede hacer que un handoff tenga que esperar el ciclo automático existente.
- Una política central desactiva proveedores externos facturables, IA remota y analítica externa. Tener secretos configurados no los habilita. La fachada de IA rechaza antes de llamar al SDK; los cron sociales conservan horarios y salen con motivo security_policy_disabled. No se presume ausencia de facturación histórica.
- El transporte heredado pasa por fetchPublicPage: publicadores permitidos, robots, HTTPS, redirección con identidad y presupuestos de bytes/tiempo. No reintenta mediante un scraper de pago cuando el acceso no está permitido. URLs de IP, localhost y dominios locales se rechazan, incluso formatos IP que URL normaliza.
- Cuotas globales y por origen en security_request_limits: lecturas consistentes, creación con ID elegido y comparación condicional al actualizar. Los tokens del cuerpo y forwarding headers no definen la identidad. La falta de dirección usa un bucket compartido conservador; estado incierto o base no disponible no permite pasar. En la prueba de notificaciones, la autenticación va antes de consumir cuota y el usuario autenticado tiene identidad propia.
- Los tokens propietarios nuevos usan randomBytes(32). Los anteriores siguen admitidos para no quitar a sus autores el control de sus publicaciones.
- mergeRediscoveredEvidence ya no sustituye una fecha original existente por una fecha entrante posterior. No se cambiaron retrospectivamente fechas almacenadas.
- Se añadió el evento de impresión publicitaria y visible_ms a su contrato. La salida a PostHog permanece desactivada: no afirmar que se están enviando impresiones ni que se han generado ingresos.
- El aporte fotográfico se muestra deshabilitado con una explicación. Su ruta devuelve 503 antes de ejecutar OCR o guardar una imagen; el aporte de texto/enlace y la consulta de ofertas continúan.

## Pruebas y evidencia

1. Local: 243 pruebas Python aprobadas, ocho casos nuevos de contención y 31 archivos de pruebas Node sin fallos.
2. GitHub Actions sobre el código guardado: **265 casos Node en 31 archivos**, cero fallos. Runs 39658273763 y 39658921961. Las pruebas incluyen rotación de tokens, concurrencia de admisión, error de estado incierto, IPs, denegación de IA antes de efectos, generación criptográfica y rutas sin efectos.
3. AppDeploy compiló y quedó ready, sin errores frontend/backend ni de red reportados. Continúan advertencias de los dos iconos PWA; no se declararon reparados.
4. Prueba real mediante SDK, run [39659173927](https://github.com/mrvvergara-afk/Trabajo-Cerca-/actions/runs/39659173927), job 119427367318, 19:10 UTC: las cinco rutas manuales devolvieron **401** anónimamente; photo-tip **503**; analítica respondió disabled:true. La política leída fue security-containment-v2, con cuatro capacidades deshabilitadas.
5. Navegador: aporte fotográfico deshabilitado y explicado, cierre del formulario y ofertas aún accesibles. Exploración/retorno de ciudades y actualidad funcionaron en móvil/escritorio. El rechazo 403 de un usuario común está probado con router/SDK simulado; no se inició una sesión real ni se atribuye una prueba real de operador autorizado.
6. No se probaron URLs privadas ni proveedores pagos contra destinos reales. La prueba de denegación consulta primero la política aplicada y solo entonces intenta rutas que ya están cerradas; no inicia captación ni envía formularios.

## Inventario observado

SDK completo: **57 registros / 55 tipados como oferta**, manifiesto ddee3f04-3e1c-4fae-8bb7-6f7ae564fa79; 15 tarjetas de oferta en la primera vista local. No son 55 vacantes nuevas verificadas en esta reparación.

Los tres IDs de Traiguén siguen en el feed. El estado documental indica último éxito 21-oct 13:20:40 UTC y siguiente revisión 22-oct 01:20:40 UTC. Leer ese estado no es una publicación nueva.

Frente al inventario de la auditoría de las 11:50 UTC, aparecen tres IDs y no hay salidas. Sus fechas de creación/primera publicación son del 5 y 7 de octubre; no los contamos como avisos descubiertos por esta reparación. El JSON conserva los IDs y la comparación; no se atribuye la diferencia a una causa no comprobada.

## Qué queda abierto

| Hallazgo | Estado después de esta entrega |
|---|---|
| A01 | Contenido mediante cierre de operaciones manuales; falta alta y prueba real del administrador autorizado. |
| A02 | Denegación aplicada y probada en código/rutas; falta revisión contractual de costos históricos y operación futura autorizada. |
| A03 | Transporte unificado y destinos locales bloqueados; falta revisar DNS/egress en profundidad y toda integración futura antes de cerrar el hallazgo global. |
| A04 | Cuotas persistentes y CSPRNG aplicados; falta calibrar volumen/origen real, purgar contadores viejos y probar concurrencia/fallos en la plataforma real. La concurrencia de esta entrega usa almacén simulado, no un load test. |
| A10 | Contrato corregido, pero medición externa desactivada hasta resolver privacidad y una campaña de prueba. |
| A16 | Corregido el reemplazo detectado; pendiente revisar la autoridad de fecha y republicación en todos los caminos. |
| Resto | Calidad de datos, notificaciones, recuperación integral, legales, cabeceras, PWA, teclado, metadatos, gate de release y cobertura siguen abiertos. |

Los contadores de cuotas guardan hashes y vencimiento, no la IP en claro. El campo endsAt es informativo: no se ha acreditado TTL automático. Su retención/purga debe implementarse sin nuevos crons y verificarse antes de escalar.

El entorno local se desconectó durante la preparación. No se fingió un guardado o despliegue exitoso: se conservó el paquete mediante conectores, se repitieron las pruebas sobre GitHub y solo después se aplicó. El entorno recuperó conexión; las fuentes y evidencias se entregan también como archivos.

## Respaldo y revisión

Respaldo fuente anterior durable: docs/evidence/security-containment-source-backup-2026-10-21.json en GitHub. No es un backup integral de las tablas AppDeploy: A08 sigue pendiente. Los dos manifiestos incrementales están en integrations/appdeploy/security-containment-update.json y security-containment-v2-update.json.

El paquete de revisión incluye el snapshot completo de fuentes de la app con los cambios, tests nuevos, manifiestos y evidencia SDK. No contiene secretos, sesión de usuario o exportación de tablas privadas. Debe revisarse con la auditoría base; no sustituye la puerta de lanzamiento.

Cero ofertas publicadas por esta etapa. Ninguna integración a main ni promoción de producción.
