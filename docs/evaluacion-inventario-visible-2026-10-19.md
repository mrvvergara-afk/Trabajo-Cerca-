# Evaluación de lo que aparece en la app · 19 de octubre

El resultado de las nuevas lecturas sigue siendo **cero avisos difíciles nuevos
confirmados y cero nuevas publicaciones**. Las pruebas técnicas aprobadas no
sustituyen ese resultado.

## Qué comprobé en la página real

La ejecución [39251976732](https://github.com/mrvvergara-afk/Trabajo-Cerca-/actions/runs/39251976732)
leyó el SDK y la portada pública, sin recolectar, publicar ni usar proveedores
pagos. Comprobación: 19-oct-2026, 09:25:55, hora de Chile.

- La portada muestra 15 tarjetas en su carga inicial y tiene el botón Cargar más.
- Los tres cargos de Traiguén están entre esas tarjetas: químico farmacéutico,
  ingeniero en prevención de riesgos y nutricionista. Sus IDs coinciden con los
  tres publicados anteriormente; no son publicaciones nuevas.
- El recorrido SDK completo requiere cuatro páginas y devuelve 57 registros,
  55 tipados como job_offer. Esos registros incluyen otras localidades,
  duplicados y contenido antiguo o de calidad pendiente. **No equivalen a 55
  vacantes nuevas verificadas**, y no se sustituyó el contador por ese número.
- El manifiesto sigue siendo 1f07ac8d-5ddf-4ae9-a3ef-8c3b06504245.

El 15 de la portada no era el inventario completo: se calculaba con las tarjetas
ya cargadas, mientras el texto decía oportunidades vigentes. Las páginas del
feed pueden tener distinto tamaño. No existe aquí una captura por ID de las
18 que el usuario vio ayer; por tanto no atribuyo la diferencia histórica exacta
a vencimientos, bajas ni pérdida de datos. Sí queda descartada la desaparición
actual de los tres cargos de Traiguén en esta comprobación.

## Errores corregidos

La comprobación técnica anterior dejaba de paginar cuando encontraba los tres
IDs esperados. Confirmaba esos IDs, pero no demostraba que hubiera leído todo
el inventario. Se corrigió: ahora continúa hasta el último cursor, controla
repeticiones, valida la cantidad total y conserva cargo, fuente y ubicación de
cada tarjeta. Un fallo intermedio o alcanzar el límite de lectura impide declarar
completo el inventario.

También se corrigió la etiqueta de portada: cuando existe otra página indica
ofertas cargadas y aclara que hay más en el listado. No se aumentaron números
ni se crearon ofertas para aparentar crecimiento.

La lectura completa quedó aplicada en AppDeploy 1792412685799 y comprobada por
el job indicado. El ajuste posterior de etiqueta corresponde a 1792412862351;
su estado final se registra en el JSON adjunto. Se conserva la rama independiente
repair/mulchen-captura-2026-10-17; main, históricos, credenciales y los seis crons
no se modificaron.

209 pruebas Python y 19 archivos Node aprobados. Las pruebas nuevas cubren IDs
encontrados antes de la última página, interrupciones, límites, cursores repetidos,
duplicados, diferencias de conteo y separación entre portada e inventario SDK.

## Qué falta para obtener publicaciones nuevas

El lector general conectado a la cola guarda originales y evidencia. Todavía
no convierte automáticamente cada documento en cargos aprobados y lotes firmados.
Tener el lector y el receptor disponibles no significa que todos los pasos entre
ambos estén cerrados. Falta completar la extracción y verificación por cargo,
con fecha original dentro de 45 días, empleador, trabajo real y postulación;
enviar los aprobados al receptor autorizado y confirmar cada ID en el feed y
en la página.

Además, la lectura completa expone calidad heredada pendiente: hay títulos que
son solo nombres de ciudades, repeticiones de TENS y ejemplos como Victoria's
Secret en La Serena asociados a Victoria. Estos registros son evidencia de que
no debemos usar el total bruto del SDK como medida de empleos válidos. No se
eliminaron ni revalidaron en esta prueba. La siguiente reparación debe trabajar
sobre su procedencia y ubicación, conservando sus registros históricos.

Los Sauces y Nacimiento mantienen una API excluida por robots; las publicaciones
exclusivas de Facebook/Instagram siguen sin una nueva vía pública autorizada.
Agregar OCR no soluciona ese acceso. Para la próxima entrega debe priorizarse
una fuente primaria accesible y llevar un aviso nuevo hasta publicación visible,
antes de presentar otra tanda de lecturas como avance de cobertura.

No hay una fecha fundada para prometer más avisos difíciles. El criterio de éxito
es una oferta nueva con evidencia y un ID visible, no el número de páginas leídas,
pruebas aprobadas ni ofertas revalidadas. La evaluación de esta tanda es cero.

[Evidencia completa](evidence/evaluacion-inventario-visible-2026-10-19.json).
