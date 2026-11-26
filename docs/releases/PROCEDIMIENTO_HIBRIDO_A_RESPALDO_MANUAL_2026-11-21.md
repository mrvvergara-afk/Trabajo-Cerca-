# Trabajo Cerca — procedimiento híbrido A (respaldo manual + publicación controlada)

> Procedimiento histórico. Para destinos vigentes y estado de la promoción, consulta [Entornos de Trabajo Cerca](ENTORNOS_ACTIVOS.md).
**Estado: piloto instalado en LAB, todavía NO autorizado para publicar oficial.**
**Fecha: 21 de noviembre de 2026.**

## 1. Qué conseguimos y qué NO

El plan Plus de AppDeploy permite crear un **respaldo manual completo de plataforma** con pausa consistente. El administrador entra a la cuenta propietaria, abre la app **oficial** (`trabajo-cerca-laboratorio-3ojgro`), Settings → Backups (Beta) → Create backup, activa **Pause the app for a consistent backup** y espera confirmación de término. Esto puede causar indisponibilidad temporal; planificar ventana de baja afluencia.

Una vez terminado, el administrador descarga el ZIP, que **no está cifrado como archivo completo**; debe cifrarlo/almacenarlo externamente de forma segura y custodiar la contraseña por separado. El operador verifica visualmente que está en la lista de respaldos del panel y anota referencia, fecha y versión.

El panel LAB **Administración → Actualizaciones → Respaldo oficial manual** permite seleccionar ese ZIP desde el dispositivo (máximo 250 MiB) para calcular **SHA-256 en el navegador**, sin enviarlo al backend, almacenar solo los metadatos autorizados y después seleccionar el archivo de nuevo para comprobar coincidencia. Dos rutas `GET/POST /api/admin/release/manual-backup` usan `requireAuth` + `requireAdminEmailAllowlist`. Se guarda registro actual y entrada histórica por referencia/versión/fecha/hash.

**La huella certifica la identidad de bytes del archivo seleccionado, NO la completitud de su contenido ni su posibilidad de restauración.** No se puede preguntar a AppDeploy por API si el backup está terminado. La casilla del administrador no es una atestación de plataforma. Tampoco es prueba de restore aislado (el proveedor niega esa posibilidad). Los metadatos no deben marcar `platformVerified`, `restoreTested` ni `publicationUnlocked` como `true`.

La exportación paginada `.tcbackup` de **Configuración y respaldo** es un mecanismo adicional de contingencia, con cifrado e integridad propios, pero **NO** reemplaza al backup completo de AppDeploy: no incluye usuarios/secretos de plataforma ni snapshot atómico de tablas.

## 2. Prueba del piloto, antes de usar un respaldo real

1. Acceder a LAB con cuenta autorizada; abrir `/admin?seccion=actualizaciones`.
2. Confirmar que aparece la sección de backup manual y la revisión administrativa `R2026.11.21-F`.
3. Intentar GET/POST de los endpoints sin sesión y con usuario no administrador: **401/403**, sin filtración de referencias ni escritura.
4. Preparar un ZIP ficticio de más de 1 KB para ensayo; seleccionar y confirmar que la huella se calcula **localmente**; no aparece una petición que envíe ZIP al servidor.
5. Registrar referencia de ensayo marcada claramente como sintética en LAB, con versión no productiva; comprobar que el backend rechaza fecha futura, vencida, hash corto, ruta insegura, booleans falsos y ZIP vacío.
6. Consultar el registro desde una nueva sesión admin; seleccionar exactamente el mismo ZIP: debe decir **COINCIDE**. Cambiar un byte y repetir: debe indicar **NO COINCIDE**.
7. Comprobar que el sistema **NO** habilita `Publicar versión aprobada` por registrar un backup. El backend `/api/admin/release/execute` sigue fail-closed.
8. No ensayar restauración de PROD en laboratorio: AppDeploy no la soporta. Nunca usar RESTORE de la app oficial como experimento, pues sobreescribe sus datos.

La validación de compilación/QA superficial AppDeploy `READY` **no equivale a estas pruebas administrativas autenticadas**. Registrar sus resultados antes de declarar el piloto apto.

## 3. Condiciones adicionales para pasar de piloto a modalidad A operativa

**No basta con cargar un comprobante.** Es necesario aprobar explícitamente el riesgo residual, limitar las promociones a diffs seguros y sin migraciones de BD, comparar baseline exacta y contrato público antes/después, realizar una revisión de 12 comunas/ads/admin, y definir respuesta ante una divergencia de datos creada durante el cambio.

El flujo autónomo GitHub previo exige firma Ed25519 de **restauración aislada** y credencial de servicio owner-scoped; AppDeploy declaró que no proporciona ambas capacidades. Por eso **no está autorizado rebajar o falsificar esa firma** para destrabarlo. Si se decide operar bajo modo híbrido, debe existir un **procedimiento separado y explícitamente asistido**, con una sesión propietaria válida para desplegar, aprobación administrativa por versión y rollback **solo de código**, cuyos registros no den a entender DR integral.

El respaldo manual sirve como **contención de pérdidas**. La restauración sobre la app oficial sería manual y potencialmente destructiva: reemplaza registros posteriores al backup y puede requerir reconciliación. No debe activarse automáticamente sin evaluación.

## 4. Qué está implementado

- LAB `trabajo-cerca-lab-aislado-xirg9w`, snapshot `1795262588425`: frontend de gestión de comprobante, SHA-256 local y comparación posterior; endpoints admin y persistencia de metadatos sin ZIP ni contraseñas.
- `backend/release-control.ts` continúa con `provider.ok=false` para el despliegue automático.
- Aplicación oficial `trabajo-cerca-laboratorio-3ojgro` no ha recibido cambios ni datos de LAB.

**Pendiente para GO:** prueba real de credenciales/autoridad para un despliegue asistido en producción, ensayo E2E admin completo, política de riesgos y rollback, procedimiento de custodia del ZIP y confirmación del primer respaldo real. Hasta entonces el estado es PILOTO, no release listo.
