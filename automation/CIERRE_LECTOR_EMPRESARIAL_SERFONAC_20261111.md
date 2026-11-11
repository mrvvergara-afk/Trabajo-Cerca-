# Cierre técnico — Portal empresarial SERFONAC (11-11-2026)

**Problema reproducido en Motor D:** `portal.chiletrabajos.cl/empresa/serfonac/ofertas` fue accesible y devolvió 8 avisos, pero las fichas individuales de Nacimiento tenían `date_source=null`, `employer=null` y faltaba la fecha de cierre, aunque la página oficial muestra fecha absoluta, empleador y expiración. El informe de extracción anotaba `commune=Angol` porque esa era la comuna ancla del hilo de rastreo, NO la faena.

## Reparación conjunta
1. `motor_d_employer_portal.py` lee exclusivamente rutas de oferta individual con ID numerado (`/empresa/<empresa>/trabajo/<cargo>-<id>`), compara nombre empresarial visible con subportal, extrae la fecha absoluta al lado del encabezado de empresa y evita inferir la fecha a partir de `hace N días`, fechas de textos libres o vencimientos.
2. Mantiene la comuna real derivada únicamente de expresiones de lugar de trabajo en la descripción. Los Ángeles, Temuco o Concepción son domicilios de reclutamiento, no trabajos locales por defecto.
3. Extrae fecha de cierre y evidencia del enlace `Postular`; una fecha vencida, empresa no confirmada o lugar ambiguo permanece retenido.
4. Las prácticas presenciales con referencia territorial explícita también se reconocen. En cambio, las exigencias de residencia o posibilidad de viajar no son pruebas de comuna de ejecución.
5. `motor_d_express.py` reconoce como la **misma vacante** el ID numérico en `chiletrabajos.cl/trabajo/...` y `portal.chiletrabajos.cl/empresa/.../trabajo/...`; deduplicación y publicación conservan la fecha original.
6. El reporte de candidatos diferencia lugar de trabajo de la comuna ancla; se contabiliza por lugar efectivo cuando puede comprobarse y se distinguen las ofertas sin lugar confirmado.
7. CI añade prueba directa de este lector y sigue haciendo una pasada de fuentes reales, **sin importar ofertas en los PR**.

## Evidencia pública verificada
- Mecánico/a Soldador/a de Maquinaria – Nacimiento: fecha fuente **2026-11-05**; trabajo en Nacimiento; expiración **2027-01-19**.
- Mecánico/a Automotriz – Nacimiento: fecha fuente **2026-11-05**; trabajo en Nacimiento; expiración **2027-01-19**.
- El aviso de Práctica Contador Auditor – Nacimiento muestra fecha absoluta **2026-10-08** y etiqueta relativa `hace 3 días`. **Usar la fecha absoluta 2026-10-08, nunca calcularla a partir del texto relativo**.
- Otros avisos con alcance combinado Nueva Imperial/Lumaco o sin lugar de faena explícito permanecen para evaluación; no se publica una comuna elegida por intuición.

## Criterios de cierre
- Unit tests `test_motor_d_employer_portal.py` y suites existentes en verde.
- Auditoría real de página empresarial descubre fecha oficial y deduplicación; verifica catálogo **completo** antes de crear cualquier lote.
- En rama principal, solo publicar avisos originales con empresa, comuna de ejecución, fecha de origen y postulación confirmadas; todas las fuentes bloqueadas conservan su estado pendiente.
- No realizar despliegues AppDeploy ni modificar fuentes sin permisos autorizados.

No se deben atribuir publicaciones al nuevo lector mientras no estén realmente aprobadas y visibles en el catálogo.
