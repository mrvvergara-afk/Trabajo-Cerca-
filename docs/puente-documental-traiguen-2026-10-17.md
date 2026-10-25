# Tres cargos documentales aceptados por el consumidor y el feed en local

## Resultado

La continuación logró que **los tres cargos reales de Salud Municipal de Traiguén lleguen como ofertas distintas al consumidor y al feed de prueba**, con su URL municipal original y postulación presencial. Las tres conservaron sus IDs tras cerrar y abrir la base de datos y repetir el lote. No hubo duplicados ni eliminación del registro histórico usado como control.

**La app pública todavía no recibió estas ofertas.** Se ejecutó el código del consumidor con un adaptador SQLite local que implementa la interfaz del SDK; no se conectó el escritor de AppDeploy, no se firmó un lote de GitHub, no se desplegó, no se modificó `main` y no se activaron crons. Esta prueba acredita el puente local con revisión de evidencia; no acredita captación y publicación desatendidas.

| Cargo real | ID estable del candidato | Postulación comprobada |
|---|---|---|
| Químico Farmacéutico (a) | `39515f1faa2264b877e35a61` | Sobre en Oficina de Partes de Salud, Balmaceda 424, Traiguén; L–V 09:30–14:00; bases, página 11 |
| Ingeniero (a) en Prevención de Riesgos | `5e1b494fc86fe4b7a3c9df68` | Mismo departamento y dirección; L–V 09:00–14:00; bases, página 24 |
| Nutricionista | `dfe66c57250c29b5efab22fb` | Mismo departamento y dirección; L–V 09:00–14:00; bases, página 24 |

El cierre se reconstruyó como **2 de noviembre de 2026, 14:00 de Chile** (`2026-11-02T17:00:00Z`), combinando la fecha del calendario común con la hora explícita de recepción de antecedentes. No se completaron por suposición los espacios de fecha en blanco de las plantillas.

Fuente: [publicación municipal](https://mtraiguen.cl/municipalidad/bases-para-llamado-a-concurso-publico-de-3-cargos/) y [PDF oficial de 33 páginas](https://mtraiguen.cl/wp-content/uploads/2026/10/DAEX-BASES-Y-CALENDARIO.pdf). La captura íntegra y el OCR están documentados en [la prueba anterior](prueba-salud-traiguen-2026-10-17.md).

## Correcciones

1. **Identidad por cargo.** El historial anterior imponía una URL única por candidato y el feed deduplicaba por URL. Ahora las unidades documentales tienen tablas propias en SQLite y una identidad derivada de la publicación y del cargo normalizado. El hash del PDF pertenece a la prueba de contenido, no a la identidad: una actualización del documento puede conservar el ID del cargo. Las identidades de ofertas anteriores siguen calculándose igual. No se inventaron enlaces individuales ni parámetros en la URL municipal.
2. **Verificación mediante páginas completas y campos acotados.** `document_unit_bridge.py` exige el PDF original, su HTML primario fechado, las 33 páginas procesadas y hashes íntegros. Cada campo revisado debe citar un texto literal del objeto de su página y la lectura OCR correspondiente. Cargo, empleador, lugar de trabajo, calendario común, cierre y postulación tienen referencias separadas. Una etiqueta `verified` o un texto declarado no sustituyen esos originales.
3. **Postulación presencial.** El contrato del consumidor admite instrucciones ligadas a su página y un enlace a las bases. Conserva la dirección y el horario en la oferta. El teléfono de consultas no se transforma en medio de postulación. La ubicación de trabajo se acredita con la tabla o las funciones del cargo, no con el domicilio para entregar el sobre.
4. **Lote y feed coherentes.** Consumidor, historial y feed usan la misma identidad por cargo. El consumidor valida el lote entero y rechaza identidades repetidas antes de escribir. La repetición actualiza las mismas filas y sus mismos IDs. El feed conserva su paginación y sus límites de tamaño.
5. **Respaldo y recibos.** Los respaldos auditan también las nuevas tablas de unidades e intentos. La restauración preserva las tres fichas y el historial previo. El historial admite recibos de esos candidatos sin fusionarlos con el candidato de URL única.
6. **Conexión al traspaso existente.** `radar_v2_publish.prepare` acepta manifiestos revisados explícitos y los revalida antes de incluir sus IDs. El ejecutor puede seleccionarlos mediante `RADAR_V2_DOCUMENT_REVIEW_FILES`, restringido a JSON acotados de `config/document-reviews/`. Sin selección explícita no publica estas unidades. No se cambió el workflow para activar esa opción.
7. **Filtro territorial restante.** El control del publicador solo admitía Renaico y Negrete. Se incorporó Traiguén para que no descartara los tres cargos después de verificarlos. `publish_enabled` y `paid_providers_enabled` permanecen en `false` en la configuración del piloto.

El manifiesto de Traiguén contiene referencias revisadas para esta convocatoria; el código no contiene una lista especial de estos tres profesionales. La extracción automática previa sigue generando propuestas. Todavía hace falta revisión de evidencia para preparar un manifiesto como este para otro documento.

## Contraste con la app y pruebas

Se leyeron archivos de la versión aplicada **`1791924889565`** sin modificarla. Los tres módulos base coincidieron con los del repositorio antes de esta reparación: adaptadores, consumidor y feed. La prueba local utilizó también extractos de las funciones reales `externalOfferRecord`, `projectFeedListing`, `feedRefreshAt` y sus dependencias de esa versión. No se sustituyeron sus reglas por un proyector que aceptara cualquier registro.

- **175 pruebas Python aprobadas**, incluidas doce nuevas: tres unidades bajo una URL; restauración y recibos; reejecución; citas/hash/lectura alterados; páginas faltantes; fecha original desconocida; captura antigua; original perdido; listado cerrado; documento vencido; traspaso explícito y rechazo posterior de una fuente cerrada.
- **17 archivos de pruebas Node aprobados.** El nuevo archivo comprueba el recorrido de los tres cargos, identidades compatibles, rechazo del lote antes de escrituras, referencias obligatorias, duplicados y la regla real de frescura de 24 horas.
- Referencia real: **3 preparados → 3 guardados localmente → 3 visibles en el feed local**. Reinicio: 3 conservados. Repetición: mismos 3 IDs, cero duplicados.
- Vencimiento simulado: cero unidades visibles, tres registros fuente conservados. Las ofertas con evidencia de más de 24 horas también quedan fuera de la proyección; se comprobó sin cambiarles la fecha original ni el cierre.
- Respaldo real del productor: tres unidades y tres intentos restaurados con los mismos IDs. La prueba Node conserva además una fila histórica sintética como control; no se contó como un aviso real recuperado.
- `git diff --check` y aplicación local de los cambios incrementales sobre los módulos base leídos: aprobados.

Evidencia: [registro de la integración](evidence/puente-documental-traiguen-2026-10-17.json). Las primeras ejecuciones de la prueba se conservaron por separado; los resultados finales con la política real de la app están identificados como `consumer-app-policy`.

## Entrega preparada y pasos para producción

El paquete [document-unit-repair.json](../integrations/appdeploy/document-unit-repair.json) contiene diez cambios acotados en los tres módulos del backend, con hashes de base y destino. Se comprobó que aplican exactamente sobre los archivos leídos de la app. No necesita cambiar su controlador, secretos ni proveedores. **No se aplicó este paquete.** Antes de desplegar debe releerse la versión aplicada y detenerse si cambiaron sus archivos; no debe reemplazarse una versión más nueva con la copia auditada.

Para conseguir las tres publicaciones en la app falta:

1. Revisar esta rama y el paquete; luego aplicar los tres módulos a la app autorizada. La restricción de no integrar `main` antes de revisar se mantiene.
2. Recolectar de nuevo HTML y PDF en el estado durable que usará el productor, comprobar que son los mismos contenidos revisados y preparar un lote fresco. Los datos usados aquí están en una carpeta local independiente, no en la rama de datos de GitHub.
3. Ejecutar el productor autorizado con el manifiesto correspondiente, obtener la firma real de Actions y observar tres recibos y tres IDs en un feed completo de AppDeploy. **La firma, transporte, SDK remoto y publicación real de este lote siguen sin probarse.**
4. Mantener la revalidación. La app oculta evidencia de más de 24 horas. El manifiesto actual y la captura no deben reutilizarse indefinidamente ni renovarse cambiando solo sus timestamps. El proceso de revisión y nueva captura debe completar ese ciclo antes de prometer publicaciones automáticas permanentes.

Continúan pendientes la capacidad del archivo compartido para documentos grandes sin perder histórico y la captura directa recurrente de Facebook e Instagram. El puente probado no resuelve su acceso ni mide cobertura de las otras fuentes regionales. No se gastó en APIs ni en otros servicios externos.

## Repetir la prueba local

Con una captura existente y evidencia revisada, desde el repositorio:

```bash
python -m scripts.document_unit_bridge \
  --pilot /ruta/a/captura/state --history /ruta/a/prueba/history.sqlite3 \
  --manifest config/document-reviews/traiguen-salud-2026-10-17.json \
  --output /ruta/a/prueba/producer
node scripts/document_consumer_proof.mjs \
  --queue /ruta/a/prueba/producer/publication_queue.json \
  --output /ruta/a/prueba/consumer-nuevo
```

La captura y la revisión deben superar las comprobaciones de frescura; este comando no vuelve a buscarlas en internet. La prueba del consumidor usa SQLite local y un registro sintético de control, nunca el SDK remoto. La carpeta del consumidor debe ser nueva. Los IDs del candidato son deterministas; los IDs de filas que crea SQLite varían entre pruebas nuevas y se conservan al repetir dentro de la misma prueba.
