# Trabajo Cerca — paquete consolidado RC2 (motores + fotografía institucional)

**Estado:** compilación y QA de código; **sin despliegue**. Este RC2 **reemplaza** RC1 como lista candidata para el único despliegue futuro de la aplicación pública.

## Fuente de verdad
- Manifiesto: `docs/releases/TRABAJO_CERCA_CONSOLIDATED_RC2_APPDEPLOY_FILES.json`.
- Snapshot AppDeploy que soporta los parches: `1795108368721` (v99).
- Los seis archivos de backend preparados en PR #83 se mantienen, más **dos archivos frontend**: `src/house-advertising.tsx` (3 diffs) y `src/house-photo-selection.ts` (nuevo).
- `appdeploy_staging_ui` guarda copias auxiliares para prueba y hash; **solo** los ocho archivos del manifiesto son candidatos al despliegue. Nunca copiar toda la carpeta staging.

## Fotografías y derechos
- Origen de las imágenes institucionales: commit GitHub fijo `c445112b9cdb78adfce9d8065e32411c4f412c4b` en `integrations/appdeploy/house-ads/public/resources/`.
- `ORIGEN-FOTOGRAFIAS.md` declara seis imágenes originales generadas para el proyecto, ilustrativas y sin personas/negocios identificables. Existen 12 WebP (dos tamaños por categoría).
- La lógica utiliza únicamente URLs aceptadas por `safeAdImage`; URLs arbitrarias no se muestran.
- **Nota operativa:** los recursos están anclados en GitHub raw; no declarar que se transfirieron a AppDeploy ni prometer ausencia de dependencias externas. Migrar a recurso propio en futura mejora con upload verificado.

## Fallo corregido
- El banner exigía `creative.storagePath` para mostrar incluso una fotografía institucional predeterminada, pese a que `presentHouseCreative` podía proporcionar `imageUrl`.
- El nuevo selector toma la foto aprobada/personalizada en primera diapositiva; en las restantes, la foto original del tema correspondiente (`houseSequence`), no la de otro mensaje.
- Respeta `imageDisabled=true` para toda la galería, inclusive foto predeterminada; SVG local sigue de respaldo ante error de red; no altera inventario comercial ni orden de campañas.
- No genera material gráfico nuevo y no descarga fotos en producción.

## Pruebas previas al despliegue
1. CI de RC2: todos los tests del selector para seis campañas, retiro de imágenes, URL no permitida, compilación TSX y reconciliación exacta del manifiesto.
2. QA visual **solo en LAB aislado**: móviles 320, 360, 390, 430 px y escritorio; cinco pasos al cambiar manualmente diapositivas, imagen relacionada con texto, contraste, ausencia de desbordes y carga lenta con SVG.
3. QA comercial: campaña paga con espacios definidos tiene precedencia; al vencerse y quedar espacio libre aparece autopublicidad; retirada de foto no reactiva el default; las fotos comerciales no se reemplazan.
4. Revisar fuente/atribución de cada WebP; solo usar aquellas con propiedad acreditada. Documentar procedencia y uso permitido en banco definitivo.
5. Los gates RC1 sobre motores, confidencialidad, respaldo/restauración, versión y prueba real candidato→feed siguen siendo obligatorios.

## Bloqueantes vigentes para GO
- Solo se confirmó una instancia de Trabajo Cerca; el nombre «Laboratorio» no demuestra separación de BD, secretos y datos.
- Restauración, rollback, publicación efectiva, pruebas de seguridad/carga y QA visual con navegador no se han demostrado en LAB.
- **Sin autorización para desplegar** ni para crear una segunda aplicación. No usar sintéticos en el catálogo público.

Cualquier nueva modificación en el snapshot remoto invalida los diffs: volver a comparar y actualizar el manifiesto antes de un único despliegue autorizado. No ejecutar RC1 y RC2 por separado.

Referencia: plan maestro `docs/PLAN_MAESTRO_PREPRODUCCION_Y_CONTINUIDAD_20261118.md`; tareas #74 (preproducción) y #72 (motores).
