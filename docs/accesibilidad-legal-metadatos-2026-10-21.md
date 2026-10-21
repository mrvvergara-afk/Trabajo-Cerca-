# Accesibilidad legal y metadatos — 21 octubre 2026

Versión AppDeploy 1792613460877, estado ready. Se incorpora foco inicial, contención Tab/Shift+Tab, Escape y restauración de foco en ambos cuadros legales. Se agregan nombres accesibles por aria-labelledby. Se añaden descripción pública y canonical del laboratorio en index.html. No se modificaron backend, datos, credenciales ni cron.json.

Validación de despliegue correcta; QA snapshot sin errores de frontend, red o backend. Se conserva la suite existente y agrega un escenario de navegación legal. La prueba adicional local con Playwright NO se completó: Chromium abortó al arrancar por setsockopt Operation not permitted (SIGTRAP). No se presenta como prueba de teclado aprobada. A13 queda implementado pendiente de confirmación independiente en navegador; A14 parcialmente atendido, sitemap/plataforma aún pendiente. Persisten advertencias previas de dos iconos PNG 512 corruptos y cantidad de escenarios.

No apto aún para lanzamiento público general. Cero ofertas nuevas atribuibles a esta corrección. Main no integrado.
