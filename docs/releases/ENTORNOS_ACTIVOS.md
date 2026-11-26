# Entornos de Trabajo Cerca

| Rol | ID de AppDeploy | Estado |
| --- | --- | --- |
| Aplicación oficial | `trabajo-cerca-laboratorio-3ojgro` | Producción |
| Laboratorio operativo | Por identificar | Promoción suspendida hasta verificar un ID propio |
| Laboratorio congelado | `trabajo-cerca-lab-aislado-xirg9w` | Retirado del flujo de actualización |
| Prueba del SDK | `trabajo-cerca-qa-sdk-aislado-lykn7b` | Pruebas técnicas del SDK |

`scripts/trabajo-cerca-environments.mjs` es el registro que usan el monitor
de disponibilidad y los flujos de verificación y promoción. El laboratorio
operativo se registra únicamente tras verificar en AppDeploy su ID, cuenta y
aislamiento. La ausencia de ID detiene las conexiones de promoción. El
monitoreo del catálogo oficial sigue usando la aplicación oficial.

El resultado de un despliegue protegido se comunica sólo al laboratorio
registrado. Se conservan la comprobación de la versión de producción, la
validación del candidato en GitHub, las credenciales del propietario y la prueba
de respaldo y recuperación que exige el ejecutor existente. El gestor
publicitario prepara un paquete incremental para producción en su propia rama.
