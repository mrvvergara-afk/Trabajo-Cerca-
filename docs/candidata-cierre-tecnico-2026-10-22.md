# Trabajo Cerca — cierre técnico y candidata

**22 de octubre de 2026. Veredicto: NO LISTA para lanzamiento público general.** Se preparó y probó una candidata sin desplegarla. Restan cuatro puertas concretas de lanzamiento; no se propone reconstruir la aplicación.

## 1. Versión y conservación

Se verificó primero la rama `repair/mulchen-captura-2026-10-17`: su cabeza era `3d72f2246c95c13f9b1e7328d42d2fcb9cc8ca44`, posterior al código P0 `0613092a`. Se conservaron sus cambios. Código candidato probado: **`87e6bb9a9d2ae404edf760093398a7897c342ace`**. Solicitud de integración **[PR #2, borrador](https://github.com/mrvvergara-afk/Trabajo-Cerca-/pull/2)**; no integrada.

La app sigue en el snapshot **1792676091153**. Nada de esta continuación se desplegó, ni se insertaron datos de prueba en ella. `main` sigue en `fab392b824e4100a4bba6dfe9289825297d24707`. La rama contiene la reparación acumulada completa: al abrir el PR eran 145 commits y 505 archivos, con cero commits por detrás de main y sin conflicto de integración detectado. Requiere revisar el conjunto, no tratarlo como un parche pequeño.

## 2. Bloqueantes corregidos en el código

- **Seguridad API:** envoltorio común con CSP restrictiva, HSTS, antiiframes, nosniff, política de referencia y permisos, conservando las cabeceras del SDK. Errores sin caché e indicación de no indexación. Se mantienen autenticación/allowlist administrativa, cuotas y denegación de proveedores facturables y OCR remoto.
- **PWA:** reparados los dos PNG inválidos a partir del ícono válido existente, sin cambiar la identidad. Maskable opaco con símbolo dentro del área segura. Manifiesto y caché versionados; el service worker excluye API, diagnósticos y respuestas privadas.
- **SEO:** sitemap estático limitado a la portada pública y robots de preestreno. En la vista compilada ambos responden 200. La candidata conserva `noindex` y `Disallow: /` hasta aprobar el lanzamiento; no se abrieron páginas administrativas ni contactos privados.
- **Enlaces compartidos:** antes compartían la portada sin identificar el aviso. Ahora incluyen un ID público, eliminan tokens/parámetros privados y abren el detalle mediante la proyección pública actual; no consultan tablas privadas como alternativa.
- **Recuperación:** extendido el motor SQLite aislado existente para comprobar edición y eliminación posteriores a recuperar. Se verificó recuperación cifrada, relaciones, reapertura durable y comparación sin diferencias. No es una restauración del servicio AppDeploy.
- **Reproducibilidad:** lockfile verificado y compilación mediante `npm ci`; snapshot de código completado con los módulos backend y recursos originales que faltaban en el directorio comercial. No se sustituyó el SDK de producción por el adaptador de pruebas.
- **Información funcional honesta:** retirada de la promesa de resúmenes automáticos; la pantalla declara la función en preparación y no activa suscripciones. No se añadió ni cambió ningún cron.

## 3. Pruebas y evidencia

La candidata pasó el [run de PR 39820868682](https://github.com/mrvvergara-afk/Trabajo-Cerca-/actions/runs/39820868682). La [ejecución final 39820553743](https://github.com/mrvvergara-afk/Trabajo-Cerca-/actions/runs/39820553743), también aprobada sobre el mismo código, confirmó además la lectura pública del SDK de la app desplegada.

| Comprobación | Resultado y alcance |
|---|---|
| Suites del repositorio | **243 Python y 345 Node: aprobadas**. Incluyen verificadores, receptor firmado, retención, cuotas, administración y reglas comerciales. Son regresiones aisladas, no una nueva captura/publicación real. |
| Compilación | Frontend, tipos de módulos comerciales y bundle backend completo aprobados; backend 462.076 bytes. Dependencias de ejecución: cero vulnerabilidades reportadas por npm audit en ese momento. No certifica ausencia de defectos ni vulnerabilidades futuras. |
| Publicación y comercial | Formularios de oficio libre, necesidad y negocio enviados al adaptador aislado, con consentimiento, sin exigir cuenta ni precio de servicio. Pruebas de 20 fundadores/30 días, transición a 14 días, duplicidad, vencimiento sin cobro y métricas separadas aprobadas. No se activó una promoción real. |
| Cero anunciantes y profesionales | HOUSE_AD y estados vacíos funcionales; anuncio pagado elegible conserva su posición; pausa administrativa comprobada con adaptador. No hay anuncios ficticios creados en la app. |
| Diseño | 320×568, 390×844, 768×1024 y 1440×1000 sin desbordamiento ni errores JavaScript detectados; cabecera móvil 64 px, navegación inferior 58 px y pie accesible. |
| PWA/SEO/privacidad | PNG, CRC, dimensiones y área segura correctos; Chromium normal no detectó impedimentos de instalación. Service worker listo, API fuera de caché, enlace compartido funcional, privacidad con foco y Escape, sitemap/robots 200 y cero infracciones CSP detectadas en localhost. No se hizo instalación física Android/iOS. |
| Restauración representativa | **14 tablas, 72 registros, un archivo, 87 unidades comparadas, cero diferencias**. Relaciones de 20 anunciantes, configuración, HOUSE_AD, métricas, consentimiento/token privado, rechazo de otro propietario y edición/renovación/eliminación tras reapertura. Cifrado en reposo y cero llamadas de red. **Datos sintéticos; no es la copia privada del propietario ni una restauración SDK autenticada.** |
| Protección del radar | Hashes de las seis funciones programadas y definición de seis crons idénticos al snapshot original. No se modificó la frecuencia, ni se activaron operaciones manuales/proveedores. |

La primera prueba nueva de PWA falló por ejecutarse en incógnito; se corrigió el entorno usando un perfil temporal normal y la prueba final pasó. No se ocultó el impedimento ni se consideró una instalación aprobada en ese primer intento.

Los JSON de evidencia se conservan en `docs/evidence/cierre-tecnico-2026-10-22/`. Artefacto final de PR `12444666276`, SHA-256 **659234cbf08ce0f475f7167c68f1c664975caaeb33c8479fcf6df2610ce42b90**, comprobado tras descargar; no se depende solo de sus siete días de retención.

## 4. Observación real de la app, separada de la candidata

Lecturas SDK completas a las **17:15 y 17:17 UTC**, sin entradas ni salidas de IDs entre ellas: cuatro páginas, **57 registros / 56 tipados como oferta**, 11 tarjetas iniciales y tres IDs de Traiguén presentes. Son inventario existente, no nuevas vacantes verificadas. Traiguén registra éxito real el 22-oct a las **13:35:37 UTC**, próxima revisión el 23-oct a las 01:35:37 UTC.

Se observaron **49 registros con revalidación pendiente**, incluido el cargo CMPC presente; el indicador `verified` heredado no demuestra una revisión fresca. Hay 11 empleadores candidatos a revisión por llevar nombres de portales. No se consultaron sus fuentes individualmente en esta tanda ni se alteraron esos registros. La calidad editorial completa sigue pendiente; no se certifica el catálogo como íntegramente verificado.

Las cinco rutas operativas sensibles y la exportación de respaldo rechazaron acceso anónimo con **401**; aporte fotográfico remoto devolvió **503** explicado y analítica externa permaneció deshabilitada. Cero recolectores/proveedores activados por la prueba. **Publicaciones nuevas hechas en esta continuación: cero.**

En la versión desplegada, el sitemap sigue en **403** y las seis cabeceras de seguridad del HTML siguen ausentes. Esto no contradice el resultado local: la candidata aún no está publicada.

## 5. Capacidad, costos y pendientes secundarios

No se repitieron las simulaciones de 5.000 anuncios. Se conserva el resultado P0 del run 39800053653: 50 páginas, frío 88,157 ms, P95 concurrente 184,028 ms, respuesta 4.188 bytes y RSS total del proceso 127,71 MiB, con un SDK simulado. **No son latencias, concurrencia distribuida ni cuotas reales de AppDeploy.**

El catálogo aún requiere escaneo por caché fría y caché por instancia; filtros SDK no equivalen a índices que reduzcan costo. Lecturas/escrituras, eventos y recibos, imágenes, transferencia, tráfico e instancias pueden generar gastos según las cuotas de la cuenta, que no se comprobaron. No se contrataron servicios ni habilitaron pagos, cobros o suscripciones.

P1/P2: panel/CRM avanzados, estadísticas comerciales completas, optimización de proyecciones territoriales y caché distribuida según uso, integración de pagos/facturación únicamente con autorización futura. PostHog externo permanece deshabilitado por la política existente; las métricas comerciales internas se prueban separadas de ingresos y no se inventan ventas.

## 6. Cuatro puertas pendientes y solución concreta

1. **Alojamiento:** configurar cabeceras reales del documento en AppDeploy o en un dominio con capa de borde compatible, y verificar respuestas HTTP y login. La herramienta no expone configuración de esas cabeceras; CSP meta y cabeceras JSON no sustituyen las del HTML. No se migró a Cloudflare ni se alteró infraestructura.
2. **Protección de main:** API de rama confirma `protected:false`. El conector no tiene administración. En GitHub, configurar regla para main: PR obligatorio, comprobación `site-inventory-proof` requerida, sin force-push ni eliminación. No se exige un revisor externo que el propietario no tenga. Verificar de nuevo antes de integrar.
3. **Responsable legal:** faltan nombre completo o razón social, comuna y país confirmados, y confirmar el correo público de privacidad actualmente usado: `trabajocerca.malleco.biobio@gmail.com`. Se dejó configuración explícitamente incompleta, sin inventar identidad ni cambiar el correo de administración. También requiere aprobación del responsable la política aplicable de conservación y ejercicio de derechos.
4. **SDK/restauración de plataforma:** falta una instancia aislada autorizada para restaurar y ejercitar autenticación, almacenamiento y flujos reales del SDK. Las herramientas disponibles no exponen ejecución SDK aislada ni un despliegue privado; crear otra app publicaría una instancia, por lo que no se hizo sin autorización de publicación. Solución: habilitar staging aislado de AppDeploy o entorno oficial de prueba con cuota conocida; restaurar una copia autorizada allí, comparar conteos/hashes, relaciones, archivos y permisos, y repetir los flujos reales sin tocar el laboratorio actual. Usuarios OAuth, secretos e infraestructura requieren el mecanismo de recuperación de la plataforma; no están acreditados por el `.tcbackup`.

## 7. Publicación y reversión, preparadas pero no ejecutadas

Antes de integrar: cerrar las cuatro puertas, revisar los avisos pendientes antes de anunciarlos como verificados, confirmar que main no avanzó, que el PR continúa sin conflictos y que los checks corresponden a la cabeza exacta. Guardar respaldo cifrado vigente fuera del dispositivo y verificarlo. No reiniciar cupos fundadores ni recibos.

Con autorización explícita: integrar por PR, guardar el SHA de integración y la versión anterior de AppDeploy; desplegar el snapshot completo candidato, sin adaptadores QA ni fixtures, usando el SDK real. Comprobar estado ready, cabeceras, permisos, formularios, eventos internos, PWA, enlaces y feed por IDs. Solo entonces configurar la fecha oficial de lanzamiento y cambiar robots/noindex de forma controlada; nunca indexar administración o datos privados. No activar cobros.

Si falla: volver a la versión de código anterior registrada —hoy 1792676091153— y comprobar feed/IDs. Esa reversión **no restaura la base de datos**. Suspender aprobaciones comerciales durante una reversión a una versión sin las nuevas reglas; no devolver cupos ni borrar entregas. No restaurar una base antigua automáticamente. En Git, usar un revert revisado, nunca reset/force-push de main.

**Estado final: candidata de código probada y PR en borrador; lanzamiento bloqueado por los cuatro puntos anteriores. No hay integración, despliegue ni autorización de cobro implícitos.**
