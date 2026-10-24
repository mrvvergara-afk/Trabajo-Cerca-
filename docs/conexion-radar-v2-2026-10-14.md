# Conexión controlada del nuevo motor — 14 de octubre de 2026

El motor del piloto tiene una conexión explícita al receptor firmado ya instalado en la app v99. Se reutiliza el intercambio existente; no necesita otra interfaz ni otra versión de AppDeploy. Esta fase no integra `main`, no cambia credenciales, no contrata servicios ni añade un cron permanente.

## Qué se implementó

- `scripts/radar_v2_publish.py` restaura los dos respaldos por separado y entrega únicamente registros preparados desde evidencia admisible del piloto, hasta tres por lote.
- Para documentos locales, reconstruye el texto de todas las páginas archivadas, comprueba el archivo original, completitud/confianza, fecha y vigencia. No confía en una bandera persistida `verified`. Los aportes sin origen confirmado y los perfiles sociales sin un adaptador validado siguen pendientes.
- Para el control oficial, archiva la página individual real de BNE y vuelve a comprobar sus datos con el mismo verificador que admite la app. Una captura de más de 24 horas no recibe una fecha de verificación nueva.
- Conserva los IDs de candidatos del histórico, limita el lote firmado y mantiene el intercambio anterior cuando no hay registros aptos. Los respaldos de captura y publicación permanecen independientes, con snapshots anteriores conservados.
- La confirmación exige el ID de ejecución del lote nuevo, los candidatos/fuentes correspondientes y los IDs presentes en un feed completo. Un resultado publicado de una ejecución anterior no confirma esta conexión.

La ejecución requiere el input manual `radar_v2_handoff=true` en la rama de reparación o un commit explícito `[radar v2 handoff]`. Solo ese job recibe el permiso OIDC necesario para firmar. Los trabajos programados de la rama principal y los proveedores pagos no se activan con este marcador.

## Control real y pruebas

El control es [Cajeros/as peaje Negrete, BNE 2026-109726](https://www.bne.gob.cl/oferta/2026-109726), con fecha original del 15 de septiembre y cierre del 17 de noviembre. El aviso ya estaba publicado: prueba recepción y conservación de identidad. Veinte vacantes del mismo cargo no se presentan como veinte avisos. Este control no cuenta como nueva captación de Facebook, Instagram, OMIL o afiches.

La ejecución [38584587407](https://github.com/mrvvergara-afk/Trabajo-Cerca-/actions/runs/38584587407), sobre `626c9327841279dec24185eb961de18941d4e2d8`, aprobó **277 pruebas: 131 Python y 146 Node**. La conexión se comprobó contra el validador del backend vigente y con un PDF escaneado ficticio completo de cinco páginas. También se probaron evidencia antigua, banderas falsas, límites, repetición y recibos de otros lotes. Las ofertas ficticias no se envían a la app.

## Estado de la ejecución real

El lector recuperó los 94 trabajos y 69 objetos anteriores y archivó el control oficial. El respaldo de captura quedó con 95 tareas terminadas y 70 objetos, sin perder los 69 anteriores. El histórico de publicación conservó 365 candidatos y sus cinco recibos anteriores, y registró una verificación nueva.

Se creó un lote firmado de un registro en `bba03e1ae4ad07c834c179f03ce9d78202243d51`. El escritor existente de la app lo recibió y el SDK confirmó el lote exacto `38584587407` a las **12:06 de Chile (15:06 UTC)**. El aviso mantuvo el ID **`free-d294f2d92f9e56840e53553adef2420f48b30847`**, visible en el feed completo `631bd259-62f5-4de8-b99c-ed971cf0c4ab`. Los tres IDs anteriores de BNE seguían visibles.

El resultado es **un aviso confirmado, ya existente; cero publicaciones nuevas**. La comprobación no se cerró usando el lote anterior. El recibo nuevo se guardó en `d0477d30e1ea5ea9236e398643412acb2332630e`, con los mismos 365 candidatos, 3.220 observaciones, 35 intentos, cinco checkpoints, nueve runs y seis recibos. SQLite pasó su comprobación de integridad. El respaldo de captura es `74a3ac25dcf1b15cb3f03ab5c95e87eb72ebd143`.

La ejecución de GitHub y la lectura de AppDeploy terminaron correctamente. La app sigue `ready`, con el escritor exitoso y sin errores reportados. No se hicieron llamadas manuales a proveedores pagos ni se modificó la versión v99. La [evidencia compacta](evidence/radar-v2-connection-2026-10-14.json) conserva commits, conteos, lote, ID y manifiesto.

## Pendientes de captación y operación

La conexión al receptor no entrega automáticamente datos que Facebook/Instagram no exponen. Todavía faltan avisos recientes de referencia, fechas y archivos originales accesibles, extracción suficiente para documentos largos/afiches y cobertura de las demás comunas. La publicación social requiere validar su adaptador antes de activar esa vía.

La observación de siete días evalúa estabilidad y cobertura; no bloquea esta primera prueba controlada de conexión. La programación externa permanente y la integración de `main` siguen pendientes de revisión. La app conserva su versión: en esta fase cambia el productor externo y sus datos, no el código desplegado de AppDeploy.
