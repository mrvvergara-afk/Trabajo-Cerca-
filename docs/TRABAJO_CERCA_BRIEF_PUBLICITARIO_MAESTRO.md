# Trabajo Cerca — Manual maestro de campañas y autopublicidad

**Estado:** laboratorio. **Última revisión de código:** 16 de noviembre de 2026. **Uso:** brief reutilizable para ChatGPT, Gemini, Canva, DeepSeek, diseñadores y administración comercial.

## 1. Qué estamos construyendo

**Marca:** Trabajo Cerca. **Promesa:** Empleos, servicios y negocios de tu comuna.
La plataforma no vende productos ni asegura contrataciones: ofrece acceso a ofertas verificadas, directorio local moderado y visibilidad territorial para pequeños negocios. La publicidad debe resolver necesidades reales sin interrumpir la búsqueda de empleo.

La primera demostración comercial es **nuestra propia autopublicidad**: tiene que enseñar cómo sería un anuncio bien hecho, sin presentar interacciones del laboratorio como resultados de clientes.

## 2. Territorio y contexto

Las 12 comunas de cobertura son Angol, Collipulli, Ercilla, Lumaco, Los Sauces, Purén, Renaico, Traiguén, Victoria, Mulchén, Negrete y Nacimiento.

Localidades: **Mininco = Collipulli; Coihue/Coigüe = Negrete; Capitán Pastene = Lumaco**. Estas localidades pueden aparecer en textos comerciales, pero no deben confundirse con comunas adicionales. Quilaco queda excluido.

No inferir ubicación GPS del visitante: el filtro de comuna indica interés territorial, no geolocalización real.

## 3. Qué permite el código hoy: no prometer capacidades futuras

| Capacidad | Estado actual del laboratorio |
|---|---|
| Publicidad propia de respaldo si el espacio no está reservado | Sí, administrada por el inventario |
| Campañas propias con selección manual de tres ilustraciones | Sí, **solo en autopromoción destacada**, con imágenes existentes |
| Imagen comercial individual | Sí: JPG, PNG o WebP, **máximo 200.000 bytes** |
| Carrusel comercial con varias imágenes | **No implementado** |
| Video comercial | **No implementado** |
| Segmentación comercial | Por comuna, sección y espacio configurados |
| Espacios editoriales | Bajo buscador, entre resultados, destacado y formularios (según sección) |
| Mensaje, rubro, CTA, enlace HTTPS/WhatsApp, prioridades y vigencia | Sí, en editor administrativo con validaciones |
| Medición de impresiones visibles y clics | Existe el registro propio del navegador, sujeto a auditoría/antiabuso |
| Resumen y CSV comercial | Sí, de las **filas consultadas** del laboratorio; no es el histórico completo |
| Atribución de ventas reales | No; un clic en WhatsApp no prueba conversación ni venta |
| Alta de usuarios finales | No es requisito para consultar empleo, servicios o negocios |

Límites verificados del editor: **negocio 120 caracteres, rubro 90, titular 120, descripción 300, CTA 38**. Enlaces válidos por HTTPS. WhatsApp comercial necesita autorización explícita cuando se incorpora o cambia su número.

Las fechas de campaña son **administrativas**, no información principal que deba publicarse en el anuncio.

## 4. Jerarquía de espacios

- **Bajo buscador:** tarjeta breve relacionada con la comuna y una acción principal.
- **Entre resultados:** mensaje contextual, compacto y distinguido de las ofertas laborales.
- **Destacado:** mayor espacio visual, sin desplazar el contenido de empleo.
- **Formulario:** promoción editorial discreta, sin competir con los campos del formulario.
- **Servicios y negocios:** en la ficha deben primar nombre, rubro, categoría, valoración revisada y contacto autorizado; las recomendaciones comerciales no deben simular vínculos no comprobados.

No usar ventanas emergentes automáticas, audio, video automático, temporizadores agresivos ni varias promociones solapadas. Mantener funcionamiento en móviles pequeños, incluyendo 360px de ancho y conexiones lentas. Las imágenes deben cargar de forma diferida cuando sea posible.

## 5. Método de creación de campaña

1. **Identificar el negocio y verificar el permiso.** Guardar categoría, nombre comercial, comuna de cobertura, y consentimiento para publicar contacto/enlace.
2. **Seleccionar una necesidad concreta** de las personas. Ejemplo: repuestos y conexiones para reparaciones del hogar.
3. **Redactar una sola promesa defendible.** No inventar precios, descuentos, horarios, existencias, certificaciones ni valores de reputación.
4. **Preparar una imagen principal y variantes.** El editor comercial acepta hoy **una imagen**. Las otras piezas se conservan como propuestas para una fase multimedia futura, sin hacer creer que ya se publican.
5. **Ajustar titular, texto y CTA al espacio y comuna.** Preferir «Consultar disponibilidad» o «Consultar por WhatsApp» cuando corresponda.
6. **Probar versión móvil:** legibilidad, recorte, ausencia de parpadeos y accesibilidad táctil.
7. **Seleccionar comuna, sección y espacios.** Comprobar en catálogo público antes de concluir que se publicó. Una campaña para una comuna particular no aparece necesariamente con el filtro «Todas».
8. **Medir y explicar límites de atribución.** Separar resultados de prueba y públicos; nunca llamar «ventas» a los clics.

## 6. Sistema creativo recomendable

**Foto/ilustración:** usar una pieza principal rectangular de aproximadamente 1200 × 675 píxeles como fuente, adaptable a diversos recortes. Mantener el centro y los bordes importantes libres de texto pequeño; la aplicación incorpora titular, descripción y CTA como texto accesible **fuera** de la imagen.

**Compresión:** entregar JPEG/WebP o PNG optimizado a **menos de 200.000 bytes**. El tamaño en píxeles es guía de diseño, no garantía de admisión: manda el peso real y MIME.

**Estética de Trabajo Cerca:** local, cotidiana, verosímil, cercana, confiable. Verde de marca, contraste suficiente y composición sobria. No usar fotos falsas que aparenten ser trabajadores o locales reales si no existe autorización.

**Textos mínimos:** titular claro, una explicación concreta, localidad verificable y una acción. La creatividad no debe contener fechas administrativas de vigencia.

## 7. Campaña piloto propuesta: Ferretería Mininco (solo muestra)

**Condición:** solo material de laboratorio o ejemplo. Antes de presentarla como publicidad de un cliente, verificar autorización, datos, existencias, servicios y medios de contacto.

- **Público:** personas interesadas en Mininco/Collipulli y alrededores.
- **Necesidad:** materiales y repuestos para reparaciones o mantenciones.
- **Titular sugerido:** «Materiales para tu próximo arreglo, cerca de ti».
- **Detalle sugerido:** «Consulta por fittings, conexiones y materiales para tus proyectos. Confirma disponibilidad y horarios directamente con el negocio».
- **CTA:** «Consultar disponibilidad».
- **Imagen principal:** composición de ferretería local con elementos de gasfitería y construcción, **sin rótulos de precios ni productos no comprobados**.
- **Variantes creativas:** (1) accesorios y herramientas; (2) atención en local; (3) ubicación/contacto. **Estas tres piezas no constituyen aún un carrusel comercial dentro de la app.**

**Secuencia esperada del usuario:** consultar vacantes en una comuna → descubrir un servicio de gasfitería realmente publicado → buscar negocios del rubro → consultar a la ferretería. La existencia de un proveedor y sus servicios solo puede afirmarse si su ficha está aprobada.

## 8. Métricas: qué decir y qué no

| Evento | Interpretación correcta | No demuestra |
|---|---|---|
| Impresión visible | Oportunidad de exposición de un anuncio según reglas de visibilidad del navegador | Usuario único ni atención efectiva |
| Clic en anuncio | Intención de abrir un enlace publicitario | Compra |
| Clic WhatsApp | Intento de iniciar contacto | Conversación o venta |
| CTR | Clics / impresiones registradas en el mismo alcance | Rentabilidad ni conversión de negocios |
| Código promocional usado | Acción declarada/atribuida si el comerciante la registra | Incremento causal de ventas |

**Todos los valores previos al lanzamiento son laboratorio**. No mezclarlos con resultados de clientes reales. Evitar recopilar nombres, contactos, CV, RUT o identidad de visitantes para medir impresiones.

Los informes del administrador muestran solo los registros cargados, con capacidad de exportar CSV; no afirmar que son cifras históricas totales cuando la tabla está paginada.

## 9. Lista de comprobación de aceptación

- Campaña muestra el nombre del anunciante y rotulación comercial adecuada.
- Comuna y sublocalidad se muestran correctamente; no aparece fuera de cobertura.
- Una imagen aprobada, optimizada y legible en móvil, sin vídeo ni movimientos automáticos.
- El CTA lleva a un destino seguro y autorizado, y no se duplica.
- La imagen sigue funcionando con ancho de pantalla de 360px y preferencia de movimiento reducido.
- El administrador puede editar y comprobar persistencia; no se borra al volver a entrar.
- Se puede visualizar en los espacios elegidos, sin invadir formularios ni ofertas laborales.
- Impresiones y clics están identificados como eventos de navegador; no inflar con pruebas sintéticas.
- Cualquier hueco publicitario vuelve a la autopromoción sin mostrar campañas vencidas.
- Sin campos privados expuestos ni cambios de las 12 comunas.

## 10. Prompt maestro para otras herramientas

> Actúa como diseñador publicitario y estratega UX para **Trabajo Cerca**, plataforma PWA de empleos, servicios y negocios locales en 12 comunas de Malleco y norte de Biobío. La identidad de marca usa verde y un diseño moderno, sobrio, accesible y rápido. No uses video ni animaciones invasivas. Necesito crear la campaña de **[negocio y rubro]**, que opera en **[comuna/localidad]** con estas necesidades comprobadas: **[productos y servicios confirmados]**. El objetivo es **[consulta por WhatsApp / abrir web / reconocer negocio]** y el contacto autorizado es **[URL HTTPS aprobado]**. Prepara: (a) titular máximo 120 caracteres, (b) descripción máxima 300 caracteres, (c) CTA máximo 38 caracteres, (d) propuesta de imagen principal con formato adaptable y peso final máximo 200 KB, (e) dos variantes creativas para experimentos futuros, (f) explicación de por qué sería pertinente a la audiencia, (g) pruebas de legibilidad móvil y (h) riesgos o datos que no podemos afirmar. Usa solo información entregada y marca explícitamente las suposiciones. Recuerda que en el editor comercial actual solo se publica una imagen por campaña, y las métricas no acreditan ventas. Entrega materiales listos para revisión, no una promesa de publicación automática.

---

**Nota técnica:** Este manual describe decisiones verificadas en código actual y propuestas diferenciadas. No habilita pagos, modifica campañas ni realiza un lanzamiento comercial.
