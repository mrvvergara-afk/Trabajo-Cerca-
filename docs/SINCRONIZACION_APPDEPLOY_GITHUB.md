# Sincronización AppDeploy → GitHub: estado y protocolo

- Origen inspeccionado: AppDeploy `trabajo-cerca-laboratorio-3ojgro`.
- Snapshot de origen: `1794322457714` (última instantánea guardada en AppDeploy al inspeccionar).
- Archivo copiado: `backend/public-feed.ts` → `appdeploy_staging/snapshot/backend/public-feed.ts`.
- El snapshot es una copia para revisión; **no** activa sincronización automática ni modifica la app desplegada.
- GitHub no incluye aún todos los módulos de AppDeploy. No asumir que compila ni desplegar el snapshot por separado.

## Protocolo para completar la reparación

1. Inventariar todos los archivos de texto de AppDeploy (paginando la lista) y excluir credenciales, archivos de autenticación, secretos y binarios.
2. Copiar los módulos necesarios a una rama de sincronización y conservar el identificador de versión de AppDeploy.
3. Comparar el contenido completo y verificar compilación de los módulos antes de considerar GitHub como fuente canónica.
4. Configurar un flujo de promoción controlado desde GitHub hacia AppDeploy. La API de actualización de AppDeploy realiza un despliegue; **no ejecutar sin autorización expresa**.
5. Antes de cada despliegue comprobar divergencias de versiones y ejecutar pruebas de regresión del catálogo.

## Advertencia

No se debe fusionar este PR ni declarar sincronización bidireccional completa: solo el módulo del feed está respaldado por ahora.
