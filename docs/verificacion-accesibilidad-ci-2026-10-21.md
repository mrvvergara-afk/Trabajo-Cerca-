# Verificación de accesibilidad y CI — 21 octubre 2026

## Resultado
App de laboratorio ready en versión 1792613460877. Prueba real en GitHub Actions [39671763089](https://github.com/mrvvergara-afk/Trabajo-Cerca-/actions/runs/39671763089), job 119471177705, commit 3d1d0afd9995f780702f3d390ea10e9842fb9672. No se integró main: conserva fab392b824e4100a4bba6dfe9289825297d24707.

## Correcciones y comprobaciones
- A13: confirmados foco inicial, contención Tab/Shift+Tab, Escape y restauración del foco en Privacidad y Términos de la interfaz actual, tanto móvil 390×844 como escritorio 1440×1000. No equivale a una auditoría WCAG completa ni verifica todas las variantes de interfaz.
- A14 parcial: descripción pública y canonical del laboratorio confirmados en respuesta renderizada. Sitemap continúa 403.
- A09 parcial: el workflow de la rama de reparación incluye pull_request, utiliza la tarea existente site-inventory-proof para todas las suites y termina antes de lecturas operativas/navegador en PR. Se reemplazó también la lista fija de diez archivos Node del scan por el glob completo. No se añadieron jobs ni cambios al schedule ni permisos globales. El disparo probado fue push en la rama de reparación; no se creó PR ni se comprobó un evento PR. No se configuró protección de rama ni comprobación obligatoria. La configuración no se ha integrado a main.
- Primera ejecución 39671599606: falló por ausencia de Pillow, con 232 pruebas intentadas y cinco omitidas. Se instalaron Pillow fijado 11.3.0, Poppler, Tesseract con modelos inglés/español y fuentes gratuitas. No se quitaron pruebas para lograr éxito.
- Segunda ejecución: 243/243 pruebas Python y 265/265 casos Node, cero omisiones. Las comprobaciones de navegador, inventario, política de seguridad y permisos anónimos pasaron.
- Las cinco rutas operativas probadas devuelven 401 anónimo; photo-tip devuelve 503. Política security-containment-v2 mantiene paidProviders, remoteAi, externalAnalytics y manualOperations en false.

## Inventario observado
Feed SDK leído completo en cuatro páginas: 56 registros, 55 tipados job_offer; 15 tarjetas de empleo iniciales. Manifiesto 87686095-343e-493d-8602-79088e9da1fe a las 20:37:08 UTC. Tres IDs de Traiguén presentes. Estos totales describen inventario heredado, no acreditan 55 vacantes nuevas verificadas. No se ejecutaron recolectores ni receptor ni publicaciones. Cero ofertas nuevas en esta continuación. No se atribuye ningún cambio de proyección al vencimiento sin evidencia.

## Bloqueantes y límites
Siguen pendientes respaldo integral AppDeploy y restauración probada, identidad administradora, identificación legal completa, cabeceras HTTP, los dos iconos PNG 512 corruptos, calidad/revalidación del inventario y otros puntos de la auditoría. Cabeceras CSP/HSTS/X-Frame-Options/X-Content-Type-Options/Referrer-Policy/Permissions-Policy ausentes en la prueba actual. No apto aún para lanzamiento público general.

Se conservan los logs y cuatro comprobantes JSON completos. No se cambió la app en esta continuación: se verificó el despliegue anterior y se mejoraron las pruebas y el workflow en la rama autorizada.
