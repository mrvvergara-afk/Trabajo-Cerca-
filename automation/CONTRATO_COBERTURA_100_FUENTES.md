# Regla operativa permanente — fuentes de Trabajo Cerca

Vigente para las 12 comunas: Angol, Collipulli/Mininco, Ercilla, Lumaco, Los Sauces, Purén, Renaico, Traiguén, Victoria, Mulchén, Negrete/Coihue y Nacimiento. Quilaco excluido.

**No alcanza con pasar por 12 comunas. Hay que intentar TODAS las fuentes públicas activas registradas para esas comunas en cada ciclo de rastreo completo.**

## Inventarios conectados
- Motor D anterior: sus 56 consultas propias no son el universo completo.
- automation/trabajo_cerca/fuentes_diarias.json: 23 fuentes de descubrimiento, 26 perfiles sociales y 39 enlaces históricos a avisos individuales. Los 39 avisos son referencias, no 39 canales nuevos de búsqueda.
- automation/motor_d_audit_sources.json: pistas y páginas adicionales de auditorías anteriores.
- automation/motor_d_social_sources.py: perfiles oficiales adicionales de redes sociales.
- automation/motor_d_source_registry.py: consolida fuentes, normaliza URL, elimina duplicados y mantiene las comunas cubiertas por cada fuente.
- automation/motor_d_portal_families.json: copia controlada de las siete familias de búsqueda pública del Motor A (Indeed, Computrabajo, LinkedIn, Laborum, Opción Empleo, Chiletrabajos y Trabajando), con una consulta por cada una de las 12 comunas; incluye cinco índices locales/empresariales ausentes.
- Mipleo y Kitempleo se añadieron al inventario de descubrimiento como portales de alcance nacional. **La lectura de su portada no acredita cobertura territorial completa**: deben comprobarse sus filtros por comuna y la extracción de fichas individuales.
- El inventario es ampliable añadiendo nuevos índices de empleos/ATS/OMIL a discovery, nuevas cuentas a social_reference y otras fuentes de auditorías. En el informe se conservan también dominios presentes solo en ofertas históricas para priorizar su incorporación.

## Orden diario, sin excepción
1. Priorizar las fuentes que anteriormente entregaron más ofertas individuales aprovechables (no titulares genéricos).
2. Rastrear también TODAS las demás fuentes registradas, aunque tengan pocos resultados.
3. Si hay bloqueo o falta un conector para redes sociales, registrar la fuente como pendiente. No informar cero vacantes cuando no se pudo leer.
4. Registrar por comuna: fuentes totales, accesibles, bloqueadas, redes pendientes y sin intentar.
5. El archivo source_performance.json persiste intentos, resultados y bloqueos; el ranking se vuelve a calcular en la siguiente pasada.
6. El archivo territorial_daily.json registra source_inventory, ranking, pendientes y nuevos dominios sugeridos para alta.
7. Cualquier fuente nueva se suma al inventario, no reemplaza ni elimina las anteriores.

## Controles de cierre
- Meta de ejecución: 100 % de fuentes públicas registradas intentadas por ciclo; cualquier fuente sin intentar es incumplimiento.
- Meta de resultado: 100 % de fuentes con estado resuelto. Los bloqueos y redes sin lector autorizado se mantienen como deuda operativa; no se confunden con fuentes revisadas.
- Éxito real de negocio: anuncios vigentes de las 12 comunas descubiertos, verificados, deduplicados y visibles en la aplicación.
- Motor A rastrea y publica; D descubre en las 12 comunas y entrega lotes válidos; B y C tratan residuos/documentos.
- La lista es **dinámica**: cuando aparezca un portal nuevo, registrar su búsqueda territorial o API autorizada; nunca dar por cubierta toda la plataforma por haber visto un solo enlace individual.
- No usar credenciales impropias, proxies o técnicas para eludir bloqueos de plataformas.
- No desplegar AppDeploy sin aprobación. Un cambio en el rastreador de GitHub no implica modificar la app pública.

**Advertencia técnica:** el primer ciclo después de la corrección puede informar muchas fuentes pendientes por bloqueo. Eso es más correcto que declarar exitoso un rastreo incompleto.
