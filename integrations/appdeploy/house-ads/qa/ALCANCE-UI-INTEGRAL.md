# Corrección integral de interfaz — 24 de octubre de 2026

Base: PR #2, cabeza inicial `c63fba86f9a52b0a570771b9507b9a48ea99e9cf`. Laboratorio inicial: snapshot `1792800590888` (v99). No se usa el backend antiguo de AppDeploy para reemplazar código auditado del PR.

## Cambios de presentación

- Cabecera móvil de 50 px, título de 21 px, cuatro accesos en una fila y controles de al menos 44 px.
- Fechas retiradas únicamente del resumen. El detalle, los datos y las reglas de antigüedad, novedad, lectura y caducidad se conservan.
- Fuente y acción comparten una fila; tarjetas y secciones secundarias compactas.
- Fotografías HOUSE_AD y rutas vigentes conservadas. Identificación discreta «Foto ilustrativa»; sin etiqueta sobre la fotografía.
- Radar con foco visual cada tres segundos, conteos existentes, selección manual prioritaria y pausas por visibilidad/movimiento reducido. No ejecuta motores ni consulta al servidor al girar.
- Navegación inferior con contraste, transparencia moderada y reserva para zona segura. Footer compacto.
- Reutilización de iconos 512 válidos del repositorio en rutas inmutables; identidad gráfica intacta. Se evita precargar los PNG dañados del snapshot anterior. Actualización de la clave de caché conservando exclusiones de API y datos privados.

## Protección del alcance

`ui-integral-protected-files.json` verifica 33 archivos protegidos frente a la cabeza inicial: backend, seguridad, crons, promociones, lectura, fechas, formularios y administración. No se modifican esos archivos. El despliegue parcial incluirá únicamente los archivos públicos de interfaz, manifest, service worker y pruebas nativas que hayan cambiado.

No se fusiona main, no se crean ofertas, campañas comerciales ni perfiles reales, no se activan pagos y no se ejecutan recolectores manuales. La publicación de formularios y la administración de imágenes se prueban con el adaptador aislado existente. La lectura del catálogo, sus recursos, filtros y detalles se comprueba por separado en el SDK nativo del laboratorio. No se equiparan ambos niveles de evidencia.

## Recuperación

Conservar el snapshot v99 y `Trabajo-Cerca-respaldo-ui-v99-2026-10-24.zip`. Para revertir esta corrección, restaurar únicamente los archivos visuales y PWA de ese respaldo mediante actualización parcial al mismo laboratorio; verificar el catálogo después. Evitar restaurar indiscriminadamente un snapshot completo si desde entonces cambiaron otros módulos.

## Límites

Esta entrega de interfaz no cierra por sí sola los bloqueantes históricos de seguridad, identidad legal, restauración completa ni autorización de lanzamiento. No certifica instalación física en Android/iOS ni entrega push. Los recursos gráficos públicos fijados a un commit de GitHub tienen una dependencia de disponibilidad externa, ya utilizada por las campañas existentes. No se agregan dependencias de aplicación ni servicios pagados.

Los resultados definitivos y las capturas se incorporan a la entrega después de las pruebas y de comprobar el despliegue real. Un estado `ready` no equivale a aceptación visual del propietario.
