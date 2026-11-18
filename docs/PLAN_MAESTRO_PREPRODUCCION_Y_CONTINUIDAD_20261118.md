# Trabajo Cerca — Plan maestro de preproducción y guía de continuidad

> **Versión de referencia:** 1.0 · **Fecha de acuerdo:** 18-11-2026 · **Estado:** planificación y estabilización, **NO autorización de lanzamiento ni despliegue**.
>
> **Tablero único de seguimiento:** [GitHub #74](https://github.com/mrvvergara-afk/Trabajo-Cerca-/issues/74)  
> **Auditoría específica de motores y publicaciones:** [GitHub #72](https://github.com/mrvvergara-afk/Trabajo-Cerca-/issues/72)  
> **Regla fundamental:** priorizar usuarios y resultados reales; evitar auditorías y rediseños repetitivos.

## 1. Visión y decisión ejecutiva

**Trabajo Cerca** debe permitir a personas de su territorio acceder a empleos reales y vigentes, publicar perfiles de oficios/servicios y encontrar negocios locales. A los anunciantes, contratar un espacio claro y a la administración, operar el sistema sin conocimientos de programación.

**No buscamos un 100 % cosmético imposible:** sí exigimos **cero fallas críticas conocidas**, estabilidad comprobada, seguridad básica validada y funciones esenciales operativas antes de exponer datos y operaciones de personas reales.

**La métrica de éxito del rastreo es una oferta efectivamente visible en el catálogo, verificable, vigente, no duplicada y en la comuna real**; una oferta detectada, importada o encolada no cuenta como publicación. Un día sin avisos nuevos puede ser válido si queda acreditado que no hubo ofertas aptas.

### Territorio invariable

- **Catálogo principal: exactamente 12 comunas:** Angol, Collipulli (Mininco), Ercilla, Lumaco (Capitán Pastene), Los Sauces, Purén, Renaico, Traiguén, Victoria, Mulchén, Negrete (Coihue/Coigüe) y Nacimiento.
- **Complementario:** Temuco y Los Ángeles, consultables en secciones/filtros secundarios; si el trabajo se desarrolla realmente en alguna de las 12 comunas base, debe asignarse a esta última.
- **Quilaco excluido** salvo nueva decisión explícita.

## 2. Cinco frentes de trabajo y orden

| Frente | Prioridad | Producto verificable | Condición de cierre |
|---|---|---|---|
| **A. Entornos, versiones y respaldos** | Bloqueante | LAB independiente de PROD, datos ficticios, acceso separado, proceso de release y recuperación | Despliegue de ensayo, respaldo/restauración, rollback y actualización PWA probados |
| **B. Cuadro de mando de Control de Gestión** | Necesario | Centro de Control ejecutivo, móvil primero, con KPI reales de motores, catálogo, publicidad y salud | Puede responder «qué motor rinde, qué fuente falla, dónde se pierde el candidato» sin abrir código |
| **C. Banco creativo y publicidad** | Necesario | Biblioteca de imágenes con derechos, publicidad institucional cuidada y flujo comercial de punta a punta | Solicitud ficticia → revisión → aprobación → imagen → espacio → publicación → vencimiento → autopublicidad de respaldo |
| **D. Seguridad, rendimiento y experiencia** | Bloqueante | Pruebas de acceso, datos, carga, web, Android/PWA, formularios y caídas externas | Sin fallas P0/P1 conocidas en rutas críticas; umbrales definidos y aprobados con evidencia |
| **E. Aceptación integral y lanzamiento progresivo** | Puerta de salida | Pruebas de motores bajo #72, integridad territorial, piloto controlado y checklist go/no-go | Evidencia final, aprobación del propietario y funcionamiento estable |

**Secuencia:** A habilita LAB; en paralelo se pueden **diseñar** B y C sin tocar producción. Construir/probar B+C en LAB; ejecutar D; consolidar E. Evitar rehacer los motores en este plan: el circuito específico se cierra en #72.

## 3. Diseño del Centro de Control ejecutivo (BI)

El propietario tiene perfil de **Ingeniería en Control de Gestión**. La administración debe parecer un instrumento para tomar decisiones y no un listado interminable de expedientes.

### Portada — cinco KPI esenciales

1. **Ofertas nuevas visibles**, periodo seleccionado (hoy / 7 / 30 días), distinguiendo origen automático y manual/forzado.
2. **Cobertura efectiva del rastreo** por motor y global **sin sumar denominadores incompatibles**.
3. **Motores saludables**: última ejecución real, programadas/cumplidas, retraso y error.
4. **Candidatos pendientes/atascados** con antigüedad y causa principal.
5. **Publicidad activa y solicitudes por resolver**, con acceso a métricas validadas.

### Embudo y trazabilidad por cada motor A, D, ChatGPT y Gemini

- Denominador propio: **fuentes previstas según inventario de ese motor**, territorio, modalidad/fuente y fecha.
- Estados **fuente programada → fuente intentada → fuente leída efectivamente → enlaces/fichas individuales → candidatos distintos → verificación → revisión → publicación visible → bajas verificadas**.
- Calcular: **% intento = intentadas / previstas**; **% lectura efectiva = leídas / previstas**; **% conversión a catálogo = publicaciones nuevas verificadas / candidatos únicos elegibles**. No dividir por cero; mostrar «Sin datos».
- Separar **bloqueada, no accesible, falla técnica, sin soporte, leída sin aviso, aviso existente, vencida, comuna incierta, ATS ambiguo**. Los intentos fallidos nunca cuentan como cobertura efectiva.
- Mostrar tendencias de 7/30 días, ranking de fuentes realmente productivas, desglose de 12 comunas y mercados complementarios separados, latencia rastreo→catálogo, tasa de duplicados y pérdidas por etapa.
- Atribuir una misma vacante a **primera detección** y a **motores que también la encontraron**; **jamás duplicar conteos de publicación**.
- Drilldown por motor/fuente/comuna y exportación CSV. Mencionar fecha/hora y procedencia del dato; no inventar resultados si telemetría aún falta.

### Publicidad y operación

- Solicitudes nuevas/en revisión/aprobadas/rechazadas.
- Campañas activas/pausadas/caducadas y próximas a vencer, ocupación por espacio/página/comuna.
- Impresiones, clics y CTR **solo cuando estén realmente medidos, con consentimiento aplicable**; KPIs sin soporte se muestran «Sin datos suficientes».
- Estado de API pública, feed, PWA, cron, errores recientes y última copia/restauración probada.
- **Interfaz móvil:** 360–430 px; información ejecutiva arriba; menú compacto; tablas con filtros/expansión, sin desbordes horizontales, tipografía legible y sin controles minúsculos.

### Prueba de aceptación

El administrador debe poder responder en menos de dos minutos, desde el teléfono: *«¿Cuáles motores rastrearon hoy? ¿Qué fuentes fallaron? ¿Qué porcentaje logró lectura efectiva? ¿Cuántas ofertas nuevas se ven en el catálogo? ¿Dónde se atascan? ¿Qué campañas vencen pronto?»* y encontrar cifras respaldadas por logs y catálogo.

## 4. Banco de imágenes y autocampañas

- Crear un **banco propio** alojado de forma controlada, con ficha de cada imagen: autor/origen, licencia o autorización, uso permitido, campaña, formato (móvil/escritorio), texto alternativo, fecha de aprobación, versión y estado.
- Meta de diseño inicial **18–24 fotografías revisadas para las seis autocampañas** (3–4 por campaña). **No significa que ya existan.**
- Categorías: personas buscando empleo, oficios/trabajo técnico, reclutamiento, negocios locales, comunidad territorial, servicios profesionales. **Representar la realidad local** y evitar imágenes genéricas incongruentes.
- Editor de biblioteca: buscar, previsualizar, recortar, aprobar, sustituir, retirar y asociar a uno o más espacios, sin tocar código. Usar imágenes comprimidas WebP y tamaños adecuados; evitar dependencias frágiles de URLs externas.
- Carrusel: imagen principal y secundarias coherentes, degradado suave al texto, fotos no repetitivas, puntos discretos (no números), movimiento sereno, pausa/controles accesibles, sin cambios mientras se lee.
- Corregir desacople actual entre `imageUrl` y `storagePath` sin permitir cargar recursos sin aprobación. Si falla una imagen, usar pieza institucional **aprobada** y registrar incidencia.
- **Flujo obligatorio de ensayo en LAB:** solicitud publicitaria → persistencia y aviso → revisión → aprobación → edición → carga de imagen → asignación de página/espacio/comuna → vista previa móvil/escritorio → publicación → medición (si procede) → suspensión/vencimiento → sustitución inmediata por autocampaña.
- Mantener publicidad **suave, delicada, no invasiva**. Fechas de vigencia internas, beneficio de prueba claramente administrable y sin cifras técnicas visibles para visitantes.

## 5. Seguridad, fiabilidad, laboratorio y actualización

**Nota:** llamar «Laboratorio» a la instancia actual no garantiza aislamiento real. Antes de lanzamiento se deben comprobar **LAB y PROD separados en base de datos, secretos, almacenamiento, permisos y tráfico**.

### Pruebas de seguridad obligatorias

1. Acceso: autenticación admin, cierre/renovación de sesión, 401/403 por operación, protección de rutas privadas, recuperación y contraseñas/identidad bajo proveedor.
2. Datos: recopilar el mínimo (contacto y correo cuando correspondan), proteger información privada; control de acceso y permisos; retención, exportación y eliminación según necesidad.
3. Formularios/medios: validación de entrada, enlaces, archivos, MIME/tamaño, XSS, CSRF cuando corresponda, abusos, rate limiting, no fuga de secretos en respuestas/logs.
4. Infraestructura: HTTPS, cabeceras aplicables a API **y frontend**, dependencias, respaldo y restauración, alertas y límites/costos ante tráfico inesperado.
5. Resiliencia: pruebas de caída de GitHub/ATS, red lenta/offline PWA, usuarios simultáneos, caché, datos y versiones anteriores.

**Aprobación técnica requiere evidencia**, no solo detectar middleware o encabezados en código.

### Protocolo de actualización (no exponer ensayos al público)

`ticket/objetivo → rama y PR → pruebas automáticas → despliegue SOLO LAB → revisión funcional, visual, móvil y seguridad → aprobación humana → respaldo → promoción controlada PROD → smoke test público → monitoreo`.

- Versionar cada cambio con número/commit, requisitos verificados y plan de recuperación.
- En LAB usar **datos ficticios**, no clonar contactos reales ni secretos de producción.
- Usar versiones previas de código para reversión, **pero verificar separadamente restauración y compatibilidad de base de datos**.
- PWA: validar usuario con pestaña abierta, nueva actualización, cachés antiguas, integridad de assets, sesión y continuidad de formularios.
- Cualquier cambio fallido se revierte o desactiva de forma controlada; no lanzar otro parche sin reproducir fallo y comprobar QA.
- **No desplegar sin autorización**, salvo que el propietario cambie expresamente esa política.

## 6. Criterios GO / NO-GO

**GO a piloto cerrado (10–20 personas orientativas):**
- LAB/PROD aislados y recuperación probada.
- Ninguna vulnerabilidad crítica abierta ni fuga de datos conocida.
- Búsqueda y consulta de ofertas públicas estables; integridad de las 12 comunas y enlaces.
- Publicidad: recorrido completo verificado con campaña ficticia.
- Centro de Control utilizable en móvil; números reales y fuente de cada métrica.
- Actualización PWA y rollback probados; tiempos de carga dentro de umbrales acordados.

**GO a lanzamiento público:** aceptación del piloto, desempeño observado y sostenido, incidencias críticas 0, monitoreo y canal de soporte, política de actualización versionada, aprobación expresa.

**NO-GO:** pérdida o fuga de datos, acceso no autorizado, duplicados o lugar de trabajo erróneo sistemáticos, campañas que cobran/se activan incorrectamente, actualización PWA inutilizable, imposibilidad de revertir, feed que desaparece sin recuperación.

## 7. Reglas ágiles anti-bucle — obligatorias

- **Un backlog principal:** [#74](https://github.com/mrvvergara-afk/Trabajo-Cerca-/issues/74). Los motores tienen [#72](https://github.com/mrvvergara-afk/Trabajo-Cerca-/issues/72), enlazado aquí, no una auditoría duplicada.
- Clasificar mejoras: **P0** seguridad/datos/interrupción; **P1** funcionalidad necesaria para lanzamiento; **P2** estética secundaria o evolución. P2 no bloquea piloto cuando no deteriora experiencia crítica.
- **Máximo un paquete en construcción y uno en QA.** Agrupar 4–5 cambios compatibles sin mezclar componentes no relacionados. Las nuevas ideas se registran con evidencia, impacto y versión objetivo.
- **Definición de terminado (DoD) por cada incidencia:** causa, cambio, prueba automática, prueba con dispositivo cuando aplique, evidencia del resultado, decisión de despliegue, monitorización posterior. Sin evidencia no está cerrado.
- **No reabrir un ítem cerrado** salvo fallo nuevo reproducible; no auditar todo el proyecto por una pantalla o error individual.
- Cada avance debe declarar exactamente: *qué quedó resuelto; qué está en QA; qué sigue pendiente; qué necesita autorización; qué no se tocó*.
- No se afirma «publicado» por un proceso de rastreo ni «probado» solo por compilación satisfactoria.

## 8. Cómo retomar este trabajo en cualquier conversación

**Mensaje de reanudación recomendado:**

> «Retomemos Trabajo Cerca según el plan maestro `docs/PLAN_MAESTRO_PREPRODUCCION_Y_CONTINUIDAD_20261118.md` y el tablero GitHub #74. Lee primero ambos; recupera lo ya concluido y qué paquete está activo. Mantén motores bajo #72, sin abrir otras auditorías. Continúa desde la siguiente tarea pendiente, reúne correcciones en un solo paquete, ejecuta pruebas y no despliegues sin mi autorización».

**Estado inicial al guardar este plan:** documentación registrada; todavía **sin** nueva instancia LAB aislada, cuadro de mando BI terminado, banco fotográfico consolidado ni ensayo comercial integral aprobado. Esto define el trabajo futuro, **no** reporta dichas tareas como terminadas.

---
*Este documento contiene las decisiones y criterios estables. Los porcentajes, logs y resultados diarios cambian: consultarlos siempre en sus fuentes en tiempo real antes de declarar avance.*
