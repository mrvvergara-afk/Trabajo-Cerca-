# Revisión QA — 13 noviembre 2026

## Ejecutado
- Compilación aislada del módulo territorial modificado con TypeScript y Node 22: **correcta**.
- 10/10 pruebas unitarias de ubicación laboral, normalización territorial y deduplicación de totales: **correctas**.
- Las funciones de publicidad dependen de un *stub* únicamente para resolver imports. **La lógica comercial no se evaluó.**
- Repetir con `bash qa/run-territorial.sh` desde este paquete (requiere `tsc` y Node).

## Aún no ejecutado
- TypeScript/build de App.tsx con el SDK AppDeploy completo.
- Playwright: cuatro rutas, formularios, teclado/Escape/foco, cierre del directorio, 320/360/390/412/768/1440 px.
- Métricas de carga y estabilidad LCP/CLS en despliegue real.
- Comparar conteo de ofertas visible antes y después y descartar desapariciones por falta de workLocation.
- Comprobar edición administrativa, campañas múltiples, uso de `HOUSE_AD`, y PWA.

## Alcance y seguridad
Este QA **no** confirma lista para producción. El código está en `ux-staging`, sin fusión y sin despliegue; no afecta las ofertas visibles.
