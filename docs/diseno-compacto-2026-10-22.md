# Diseño compacto de Trabajo Cerca — 22 de octubre de 2026

Aplicado exclusivamente al laboratorio `trabajo-cerca-laboratorio-3ojgro`, versión AppDeploy `1792676091153`, estado ready, sin errores frontend/backend/red en QA. Base anterior `1792632646829`. Sin integración a main ni lanzamiento público general.

## Cambios
Cabecera móvil de una línea que se desplaza con la página. Menú con cuenta, acceso administrativo condicionado a autorización y opciones secundarias. Búsqueda y comuna visibles, con acciones directas para ofrecer trabajo/oficio y contratar. Barra inferior compacta que desaparece al abrir formularios. Publicidad propia compacta identificada HOUSE_AD, conservando prioridad comercial. Ciudades complementarias y actualidad laboral después de resultados. No se alteró inventario, credenciales ni programación de tareas.

## Pruebas
Run 39778284134, commit 50e9fc3f513fc935d966840f67f89454f6e1c574: 243 pruebas Python y 325 Node aprobadas, compilación Vite y TypeScript correctos. Playwright en 320×568, 390×844, 768×1024 y 1440×1000: sin desbordamiento, formularios correctos, pie accesible, menú y cuenta accesibles; cabecera móvil 64 px y navegación inferior 58 px. Ensayo HOUSE_AD sin anunciantes/profesionales confirmado; los tres empleos sintéticos usados exclusivamente para medir el diseño NO se desplegaron ni representan inventario real. Evidencia JSON adjunta.

El contrato de pruebas desplegadas conserva las 16 comprobaciones existentes y agrega dos lecturas seguras de la interfaz nueva; los ensayos que requieren SDK simulado se mantienen solamente en qa/. El observador territorial ahora admite el menú compacto y la elegibilidad de campañas propias sin sembrar anuncios para forzar precondiciones.

## Pendientes y límites
Verificación adicional del feed y navegación live en curso mediante observador de solo lectura. No se publicaron ofertas nuevas por este cambio. Se mantienen advertencias previas de dos íconos PNG de 512 px inválidos. No certifica restauración integral de plataforma ni cierre de todos los bloqueantes de producción. PostHog permanece deshabilitado por política; las métricas propias son de primera parte. No se probaron cambios administrativos reales iniciando sesión por el propietario ni se activaron clientes de ensayo en el laboratorio. La rotación respeta prioridad y ubicaciones existentes; el cumplimiento contractual de impresiones requiere un sistema comercial adicional.
