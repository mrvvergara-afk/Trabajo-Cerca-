# Trabajo Cerca — cierre QA aislado UX (13-11-2026)

## Evidencia automática verificada
- **GitHub Actions run:** https://github.com/mrvvergara-afk/Trabajo-Cerca-/actions/runs/43518254541
- **Estado:** success, 36 de 36 verificaciones (10 territorial, 10 publicidad, 16 TSX/sintaxis/contratos estructurales).
- **Fuente fijada:** AppDeploy laboratorio snapshot `1794590590707`.
- **Rama:** `feature/ux-polish-2026-11`; PR #60, en borrador, sin fusión.
- **Despliegue:** NO. No se alteraron archivos de frontend vivo, backend, catálogo, tablas, motores o anuncios actuales.

## Cambios del paquete
1. Navegación de cuatro destinos publicitarios y comunitarios en escritorio y móvil, con acceso Publicar y selección de cuatro flujos existentes.
2. Localización laboral por comuna real de ejecución (y normalización territorial), evitando que un municipio de reclutamiento transforme un anuncio externo en oferta local. Se conserva respaldo de `workLocation` cuando `workCommunes` no está disponible.
3. CSS acotado: portada de escritorio más compacta; cabecera móvil con selector de comuna; publicidad institucional de búsqueda menos invasiva, sin suprimir slots.
4. Modal con bloqueo de scroll, foco dentro y cierre con Escape.
5. Fecha pública original preferente a fecha de incorporación.
6. Directorio local cargado de forma diferida mediante `React.lazy`; sin consulta administrativa de visitantes anónimos. **NO se cambia el backend:** autenticación/allowlist de moderación permanece activa.
7. Asignador de campañas de snapshot intacto y protegido: cuatro slots admitidos, ubicaciones múltiples, expiración y autopublicidad como fallback.

## Comprobaciones terminadas
- 10 pruebas de territorialidad/alias/sitio laboral/solapamientos.
- 10 pruebas de slots comerciales, vigencia, exclusividad de comuna, comercial vs autopublicidad, fallback y prioridad de campañas pagadas.
- 16 verificaciones de TSX/sintaxis y contratos de navegación, formulario, fecha, carga diferida y autenticación previa.
- Comprobación de que la rama no contiene `src/App.tsx` ni `package.json` en la raíz: no se activa accidentalmente un frontend productivo.
- Se inspeccionaron las rutas del directorio en AppDeploy; `GET /api/admin/local-directory` requiere `requireAuth()` y `requireAdminEmailAllowlist(ADMIN_EMAILS)`.

## No comprobado; bloquea cierre productivo
- TypeScript de todo el proyecto y build React/Vite enlazado con el SDK y módulos completos del frontend activo.
- Playwright real: rutas, formularios, teclado/tabulado, navegación, comercios, edición de campañas y PWA.
- Capturas y desbordes a 320/360/390/412/768/1440 px; no se tuvo navegador sobre despliegue remapeado.
- Métricas de velocidad, recursos descargados, LCP/CLS, errores de red reales.
- Reconciliación de inventario de ofertas visibles antes/después tras integración y comprobación de campañas persistentes.

## Instrucciones de integración segura
1. Confirmar que el snapshot activo de AppDeploy siga siendo `1794590590707`. Si cambia, volver a comparar diferencias antes de aplicar.
2. Integrar **solamente**: `src/App.tsx`, `src/local-directory.tsx`, `src/territorial-exploration.ts`, nuevo `src/ux-polish-2026-11.css`. `shared/house-ads.ts` y `shared/ad-images.ts` son COPIAS DE PRUEBA, no reemplazos.
3. No fusionar directamente PR #60 en `main`: esa rama es el motor/radar, y estos archivos están en `ux-staging`, no en el árbol activo.
4. Generar compilación y QA funcional sin tocar información pública; comparar muestra de IDs de ofertas y campañas antes/después.
5. Solo después solicitar un **único** despliegue autorizado.

## Reproducción
El workflow `.github/workflows/ux-polish-staging-qa.yml` ejecuta `bash ux-staging/appdeploy-1794590590707/qa/run-all.sh` sobre push de la rama. No utiliza secretos, publica ni modifica AppDeploy.
