# Incidente catálogo complementario — 26 noviembre 2026

Usuario observa fecha máxima visible 11/11 en Temuco y Los Ángeles. No confirmado directamente en UI.

Evidencia: https://www.chiletrabajos.cl/ciudad/los-angeles.html y https://www.chiletrabajos.cl/ciudad/temuco.html muestran avisos posteriores, incluso 25/11. Requieren verificación individual y conciliación.

Inventario main: 19 endpoints asociados; 14 kind=ciudad_puente, 5 public_registry_extension. Investigar si los consumidores excluyen empleos locales por kind. No asumir causa raíz.

Espejo automation/catalog_public_identities.json generado 2026-11-26T03:34:08Z: 291 identidades, 113 visibles en 12 comunas, 178 fuera de ellas. No proporciona fechas de publicación/cierre necesarias para auditoría de renovación. API directa no accesible desde herramienta web (DisabledError). Contrato backend/chatgpt-direct-import.ts en main devuelve 404.

Pendientes para cierre: comprobar por ciudad fechas máximas originales y de ingreso, paginación/orden/filtros UI, rastreo, colas, aceptación territorial, publicación y bajas por fecha con evidencia. No eliminar por antigüedad sola ni reactivar vencidas sin evidencia. Mantener catálogo complementario separado; recuperar avisos vigentes desde 12/11 sin duplicar. Registrar altas y bajas por ciudad, razón y timestamp. Validar extremo a extremo antes de despliegue. No se modifica producción en este registro.
