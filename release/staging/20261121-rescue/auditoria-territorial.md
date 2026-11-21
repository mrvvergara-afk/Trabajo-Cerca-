# Auditoría territorial de Trabajo Cerca oficial — 21/11/2026

Destino exclusivamente: `trabajo-cerca-laboratorio-3ojgro`. No tocar el LAB `trabajo-cerca-lab-aislado-xirg9w`.

## Casos con evidencia de fuente (no implica que se hayan corregido en la base de datos)

| Código | Puesto | Comuna vista en capturas de la app | Evidencia del lugar efectivo | Acción |
|---|---|---|---|---|
| Chiletrabajos **3933712** | Consultores 2000: Prevencionista AIF - Chañaral | Purén | Chiletrabajos marca **Chañaral** como localidad; en la descripción dice AIF **Angol**. Ninguna prueba lo sitúa en Purén. | Retirar de Purén; revisar discrepancia Chañaral vs Angol antes de asignar comuna. |
| Chiletrabajos **3935812** | Recompany: Líder Prevención y SIG | Purén | Chiletrabajos indica **Santiago**. | Retirar de Purén y del feed principal. |
| Chiletrabajos **3934867** / Trabajando **6151630** | CMPC: Analista de Vibraciones - Mininco Planta Plywood | **Angol** (captura usuario, ficha visible) | Portal de empleo de CMPC/Trabajando define **Collipulli**; puesto en Planta Plywood de **Mininco**, que pertenece a Collipulli. Chiletrabajos lo muestra como Angol. | **Reclasificar a Collipulli**, conservando oferta verificada y vínculo original. No eliminar. |

### Enlaces de contraste
- https://www.chiletrabajos.cl/trabajo/prevencionista-de-riesgos-aif-chanaral-3933712
- https://www.chiletrabajos.cl/trabajo/lider-prevencion-de-riesgos-y-sistema-integrado-de-gestion-3935812
- https://www.chiletrabajos.cl/trabajo/analista-de-vibraciones-mininco-planta-plywood-3934867
- https://www.trabajando.cl/trabajo/6151630-analista-de-vibraciones-mininco-planta-plywood
- https://cmpc.trabajando.cl/

## Otros defectos detectados en CÓDIGO (no aseverar cantidad de avisos afectados)
1. `backend/index.ts`, proyección de `projectFeedListing`: `locationScope` añade `recruitmentCommunes` si `territorialRecruitmentVerified`, aunque la regla territorial exige lugar efectivo. Revisar uso y no publicar por zona de reclutamiento.
2. `backend/index.ts`, `corrections` para IDs 3891310, 3891189, 3889603, 3894935: añade la comuna corregida sobre `existing` en vez de reemplazar o precisar cada sede efectiva. Puede mantener falsamente la comuna anterior e inflar conteos. El caso 3894935 es genuinamente multiciudad (incluye Mulchén), por lo que NO sustituir ciegamente múltiples comunas sin revisar la fuente.
3. `src/App.tsx`, `normalizedRadarStats`: recalcula solo Collipulli y usa cifras posiblemente desactualizadas en las otras 11; el radar puede decir 2 en Purén mientras las fichas locales muestran 0.
4. `shared/workplace-consistency.ts`: detección de contradicciones remotas limitada a Chañaral y Santiago; no detecta título Mininco + `workCommunes` Angol, ni otras ciudades fuera del territorio. Adaptadores solo examinan el patrón «comuna de X» o excepciones.
5. `shared/territories.ts` define ciudades complementarias Temuco, Los Ángeles, **Concepción y Chillán**; `src/App.tsx` usa esa lista como `travelPlaces`. Alcance acordado: solo Temuco y Los Ángeles secundarios.
6. **Vigencia para revisar**: aviso Chiletrabajos 3891189 «Paramédico/a Traiguén», publicación del 31/08/2026, aparece marcado como expirado/desactivado en la fuente; solo auditar su presencia actual, no afirmar que está publicado sin leer feed vivo.

## Criterios de cierre
- Leer **todos** los registros visibles del catálogo oficial (cursor hasta `nextCursor=null`, detectar feed degradado) y comparar URLs originales, `title`, `workLocation`, `workCommunes`, `recruitmentCommunes` y estatus; registrar IDs y evidencia.
- Para ofertas sin ambigüedad, corregir la comuna real: **Mininco → Collipulli, Coihue/Coigüe/Cohigue → Negrete, Capitán Pastene → Lumaco**.
- Contradicciones fuente: revisión, nunca inventar comuna; conservar documento y trazabilidad. No descartar trabajos válidos publicados en Temuco/Los Ángeles cuyo trabajo efectivamente se realiza en una de las 12 comunas.
- Conteos del radar/estadísticas salen del conjunto de ofertas verificadas visibles, no de un contador obsoleto.
- Probar caso multiciudad genuino y ofertas con ciudad de publicación distinta del lugar real, para evitar falsos negativos.
- No decir «auditoría exhaustiva» hasta leer el feed completo. Las tres ofertas anteriores están confirmadas contra fuentes externas y capturas, no es una muestra exhaustiva de todas las ofertas.
- Coordinar con el PR #104 antes de su único despliegue oficial, sin fusionar el PR ni alterar el LAB aislado.
