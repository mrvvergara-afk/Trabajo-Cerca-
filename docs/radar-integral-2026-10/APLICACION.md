# Aplicación acotada y verificación pendiente

El archivo appdeploy-source-patch.json contiene 22 archivos fuente, no un despliegue ni un respaldo de datos. Fue probado en el commit 272b85e97af068d92e375487d63431e789c5e22e y depende del resto de los archivos nativos AppDeploy v99. No cargar la rama completa ni el build QA de Stitch.

1. Obtener autorización para publicar en el laboratorio y para usar los créditos existentes de AppDeploy. No añadir recargas, proveedores pagos ni servicios de OCR externos.
2. Volver a consultar la versión publicada. Si difiere de 1793152775717, comparar los 22 archivos con esa versión y reconciliar antes de enviar cambios. Conservar configuración de autenticación, cron, recursos binarios y modificaciones nativas.
3. Guardar los 22 contenidos anteriores desde AppDeploy. El baseline a39d62055499f67b39a43a76024cdf6935ccff06 documenta los textos de v99, pero excluye autenticación/binarios y no respalda datos.
4. Usar el flujo de actualización parcial de AppDeploy para la misma app y solamente los archivos del paquete. Mantener @appdeploy/sdk y @appdeploy/client inyectados por la plataforma. No ejecutar migraciones ni borrar filas.
5. Validar los tests de plataforma y comprobar feed HTTP real, manifiesto completo y paginación con SDK real. Verificar que el registro del control conserva el ID físico nativo y que el último catálogo válido sigue accesible durante reconstrucción.
6. La siguiente ejecución normal de descubrimiento vuelve a leer la fuente DOCENTE PSICOLOGO; solo continúa si confirma vigencia, Angol, postulación e identidad. No copiar el recibo del rastreo como oferta ya verificada en producción ni forzar sus condiciones.
7. Recorrer trazabilidad → fila de origen → deduplicación → manifiesto/páginas → tarjeta real en Angol → postulación. Registrar ID público efectivo, fecha/hora, incorporaciones, bajas y nuevo inventario único. Si no aparece, conservar el motivo preciso y corregirlo antes de afirmar éxito.
8. Repetir qa/radar-live-observe.mjs y comparar todos los IDs de las 13 localidades con evidence/measurement.json, considerando vencimientos/cambios ajenos a esta intervención. Mantener el PR en borrador hasta cerrar evidencia operativa y decidir el tratamiento de los tres fallos comerciales preexistentes.

Reversión: restaurar los contenidos anteriores de los archivos cambiados, sin borrar tablas ni el registro del control. La reparación conserva la fila física de control nativa para compatibilidad con el código previo y mantiene el último manifiesto válido. Conservar recibos y metadatos; no eliminar ofertas para revertir una presentación o un lector.

Verificación reproducible gratuita: .github/workflows/radar-integral.yml, qa/radar-repair.test.mjs, qa/radar-verify.mjs, qa/radar-real-crawl.mjs y qa/radar-live-observe.mjs bajo integrations/appdeploy/house-ads. Las suites nuevas usan fixtures exclusivamente como pruebas; el rastreo operativo y las mediciones usan fuentes y frontend reales. El OCR se ejecutó localmente en runners públicos con Tesseract/PyMuPDF. Su ruta no demuestra automáticamente un circuito comunitario privado.

El entorno local dejó de estar disponible durante la ejecución; los cambios, pruebas y evidencias finales se conservaron a través de GitHub y sus runners. No se presentan rutas locales inaccesibles como descargas.
