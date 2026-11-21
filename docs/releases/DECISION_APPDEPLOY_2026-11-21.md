# DECISIÓN TÉCNICA TC-ADR-2026-11-21 — AppDeploy no satisface DR autónoma

Estado: **ACEPTADA COMO RESTRICCIÓN DE PROVEEDOR / PUBLICACIÓN AUTOMÁTICA NO-GO**.
Origen: respuesta por correo de AppDeploy Support al hilo «AppDeploy Plus — API de backup/restauración verificada y despliegues autónomos para Trabajo Cerca», 21-11-2026 10:05 UTC. No introducir datos del titular ni copiar credenciales en este repositorio.

## 1. Evidencia confirmada por el proveedor

| Requisito de Trabajo Cerca | Capacidad confirmada por AppDeploy | Dictamen |
|---|---|---|
| Respaldo completo y consistente | Plus permite **Settings → Backups (Beta) → Create backup**; elegir **Pause the app for a consistent backup** para drenar solicitudes antes de capturar código, tablas/registros, archivos/imágenes, secretos cifrados y usuarios. El modo consistente **pausa la aplicación**. | Manual, con indisponibilidad durante la pausa. |
| Respaldo automático externo desde GitHub | No existe API pública documentada para iniciar, consultar o programar ese backup. Máximo 20 backups manuales + 1 de seguridad por app. | No disponible. |
| Restauración de ensayo aislada sin alterar oficial | Restore reemplaza datos, código, archivos, secretos y usuarios de **la misma aplicación**; no puede restaurar el backup de PROD en LAB ni importar el ZIP para crear app restaurada. | Requisito crítico **incumplido**. |
| Backups cifrados | Cifrados en reposo en la plataforma. El ZIP descargado **no** tiene cifrado de archivo completo; contiene secretos cifrados, pero exige cifrado externo y custodia separada. | Planificar almacenamiento seguro independiente. |
| Cuenta de servicio por aplicación | No existe `client_credentials` ni servicio limitado a una app. OAuth Authorization Code + PKCE puede renovar `refresh_token` con un cliente apropiado, pero permisos son de la **cuenta**, no de proyecto. API key pública crea otra identidad. | No exponer tokens OAuth en GitHub sin diseño formal de custodia/rotación. |
| Promoción atómica/blue-green con drenaje | El código ya cargado en ejecuciones backend sigue hasta finalizar; `READY` no garantiza vaciado de solicitudes antiguas ni escrituras. Sin control de drenaje de despliegue ni promesa de blue/green para el feed. | No hay continuidad garantizada. |
| Cuotas previsibles | `appdeploy_who_am_i` informa crédito mensual/top-ups, no disponibilidad diaria/semanal ni reserva créditos. | Barrera de disponibilidad independiente. |
| RPO/RTO / backups programados | No hay backups programados ni RPO/RTO garantizados. La retención después de perder Plus o borrar origen es limitada; mientras Plus continúe, no interpretar 30 días como caducidad ordinaria. | No es DR empresarial acreditada. |

## 2. Decisión operativa inmediata

**No habilitar publicación automática de producción bajo el contrato vigente.** El backend LAB y GitHub CI deben permanecer `fail-closed`: no falsificar evidencias Ed25519 ni marcas de respaldo; no copiar datos desde producción a LAB; no ejecutar restauración destructiva en la app oficial para simular DR. Nunca llamar a `deploy_app` en la app oficial como sustituto de una prueba de restauración.

**Se permiten:** continuar correcciones en LAB aislado, CI de código y simulaciones, publicar candidatos sin despliegue en GitHub, y explorar opciones con control de cambios. Las versiones de AppDeploy revierten *código*; no constituyen backup de base de datos.

## 3. Dos opciones técnicas viables para decidir más adelante

**A — Contención temporal en AppDeploy.** En una ventana de mantenimiento aprobada por el administrador: crear backup consistente manual con pausa desde panel propietario, verificar estado/listado y descargar ZIP a espacio externo cifrado, con controles de acceso y registro. Esto disminuye riesgo de pérdida, pero **no cumple** el ensayo independiente exigido. No se debe declarar GO ni habilitar el botón automático por haber hecho solo esa copia.

**B — Desacoplar estado y diseñar recuperación auditable.** Investigar migración controlada de tablas/objetos desde SDK AppDeploy hacia un almacenamiento donde existan snapshots consistentes, restauración a **un entorno independiente**, credenciales limitadas y controles de lanzamiento. Posibles arquitecturas a evaluar (no capacidades verificadas): base gestionada con PITR + almacenamiento de objetos versionado; o Cloudflare con componentes de datos separados, controles de identidad, CI y recuperación probada. Antes de seleccionar proveedor se necesita una prueba real de lectura, exportación, integridad, restauración y compatibilidad con motores/usuarios/servicios. Evitar una migración que deje datos nuevos en la base antigua.

## 4. Acciones trazables

1. Registrar esta limitación como decisión firme en issue #74; cerrar la investigación repetida de `backup/restore` por API AppDeploy mientras no cambie su producto.
2. Fortalecer el ejecutor GitHub ante respuestas perdidas y despliegues de identidad incierta; no revertir ciegamente una versión ajena.
3. Mantener PRs/candidatos de versión como **código preparado**, no como publicación.
4. Definir arquitectura y ensayo DR de la opción B antes de tocar datos. Documentar inventario de tablas, archivos, permisos, costes, operación fuera de línea y reconciliación de empleos.
5. Mantener vigilancia de créditos como disponibilidad **observada**, nunca prometer saldo diario a partir del mensual.

## 5. Condición de reapertura GO

Un reemplazo de infraestructura o nueva capacidad oficial debe acreditar: respaldo íntegro consistente, copia cifrada independiente, restauración en entorno aislado, coincidencia de registros y archivos, continuidad del catálogo, autenticación administrativa E2E, certificación firmada *emitida por resultados reales* y ejecutor renovable/revocable. Sólo entonces efectuar canario controlado, UI y PWA.

Referencia: issue #74 y `docs/releases/RESPALDO_RESTAURACION_RELEASE.md`.
