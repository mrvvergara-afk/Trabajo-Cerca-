# Reparación y prueba documental real — 17 de octubre de 2026

## Resultado comprobado

Se recuperó una convocatoria primaria de la Municipalidad de Traiguén, publicada el **14 de septiembre de 2026**, con un PDF escaneado de **11 páginas**. La ejecución final descargó los originales, aplicó OCR en español e inglés a las once páginas y produjo dos fichas separadas para revisión:

| Cargo | Empleador explícito | Remuneración indicada | Plazo original | Estado de la ficha |
|---|---|---|---|---|
| Kinesiólogo | Municipalidad de Traiguén | $1.100.000 mensuales, a honorarios | Recepción del 14 al 22 de septiembre de 2026 | Histórico reciente, pendiente de revisión; no activo |
| Terapeuta Ocupacional | Municipalidad de Traiguén | $1.100.000 mensuales, a honorarios | Recepción del 14 al 22 de septiembre de 2026 | Histórico reciente, pendiente de revisión; no activo |

Son **dos cargos de una convocatoria**, no once avisos por once páginas ni quince avisos por quince tareas. La publicación original entra en la ventana de 45 días. Su plazo ya venció: **cero ofertas vigentes aprobadas y cero publicaciones realizadas**.

Fuentes primarias:

- [Publicación municipal](https://mtraiguen.cl/municipalidad/bases-de-segundo-llamado-a-concurso-publico-programa-red-local-de-apoyos-y-cuidados-prlac-traiguen/).
- [PDF original completo](https://mtraiguen.cl/wp-content/uploads/2026/09/decreto-y-bases-2do-llamado.pdf).

La tabla de cargos está en la página física 3 del PDF; el cronograma, en la 10; la postulación presencial, en la 11. Se inspeccionaron visualmente esas páginas y coincidieron con los datos recuperados. Las bases indican presentar antecedentes en la Oficina de Partes, calle Basilio Urrutia 914, de 09:00 a 14:00. El programa se describe como comunal; la extracción automática mantiene la comuna de trabajo pendiente de revisión y no la asigna por el domicilio del publicador.

## Errores encontrados y cambios

1. **Documento incrustado ignorado.** Las bases se cargan mediante un `iframe` de EmbedPress/PDF.js, sin enlace convencional de descarga. El parser no seguía `data-emsrc` ni el parámetro `file` del visor. Ahora reconoce PDF en `iframe`, `embed` y `object`, conserva su fecha de la página primaria y deduplica las referencias. Los archivos de otros publicadores y las URL de scripts no pasan a la cola de descarga.
2. **Entrada de Traiguén demasiado estática.** El catálogo apuntaba a la página institucional de Fomento Productivo. Se cambió a la portada municipal que enlaza las convocatorias recientes. Una respuesta 401 de su API no impide la lectura del HTML público: ambos accesos se comprobaron por separado.
3. **OCR vacío por formato no producido.** En la configuración local que contiene los modelos de idiomas pero no el archivo de configuración `tsv`, Tesseract devolvía texto normal con código de salida cero. El lector lo interpretaba como TSV y obtenía texto vacío. Ahora solicita TSV con un parámetro explícito, valida su cabecera y utiliza solo idiomas instalados. La falla se reprodujo en ese entorno local; no se atribuye sin evidencia al despliegue de producción.
4. **Documento largo con varios cargos.** Las once páginas producen 30.593 caracteres. Se conserva el límite de 18.000 caracteres para la verificación/publicación, y se extraen propuestas para revisión desde cada página archivada, con evidencia por campo. El extractor actual reconoce filas de tablas municipales a honorarios; no se presenta como un lector universal de afiches. La ficha no se vuelve verificada o activa por aparecer en esa tabla.
5. **Estado cerrado perdido al seguir una ficha.** Se conserva una referencia al HTML original del listado. La evaluación y la preparación del lote vuelven a comprobar que el enlace no esté marcado como cerrado. Un cuerpo con lenguaje de apertura, o una marca `verified` alterada, no prevalecen sobre esa evidencia.
6. **Prueba difícil de repetir.** Se agregó `scripts/document_reference_proof.py`: una ejecución acotada, con comprobación de robots, originales con hash, cola SQLite aislada, OCR por página y lote local de verificación. No firma lotes, no sube estado y no llama al escritor de la app.

Continúan incluidos los ajustes del commit anterior `eeb3015`: entrada dedicada de Mulchén y selección configurable de hasta doce candidatos, para no perder la séptima ficha del listado observado.

## Pruebas ejecutadas

- **153 pruebas Python aprobadas**, incluyendo recuperación del PDF incrustado, persistencia, límites por ejecución, estados cerrados, revalidación del lote, conflicto de fechas y tablas con varios cargos.
- **16 archivos de pruebas Node aprobados**. El número corresponde a los archivos que informa el ejecutor, sin sumar aserciones internas como si fueran avisos recuperados.
- Regresión con el fragmento real del HTML de Traiguén y fragmentos del OCR real.
- OCR real con modelos de idioma sin configuración `tsv`, que reproduce y corrige el problema de formato.
- Ejecución final con descarga real: **11/11 páginas con texto**, entre 77,3 y 93,3 de confianza media informada por el OCR según página. Esta medida no sustituye la validación de cada dato.
- Separación de dos propuestas con evidencia de empleador y cargo en página 3, plazo en 10 y postulación en 11; ambas permanecen `verified: false`, `active: false`, `published: false`.
- `git diff --check`: aprobado.

El PDF original mide 1.519.267 bytes y su SHA-256 es `d316f49c88e5488f2c14f38114e77514bb5800d4e886715933bf4eb56bba72f2`. Los intentos anteriores con OCR vacío se conservaron fuera del repositorio, separados de la ejecución final. No se borró histórico para repetir la prueba.

## Otros accesos comprobados y límites pendientes

- **Negrete:** su API respondió y devolvió ocho publicaciones de la ventana consultada. No se obtuvo una oferta laboral individual de esas publicaciones; una competencia de cueca no se contó como empleo.
- **Nacimiento:** la página municipal examinada es de 2021. La copia secundaria de una OMIL contiene textos de septiembre, pero sus tres imágenes respondieron 404. Ninguno de esos resultados se aprobó como aviso vigente o histórico verificado.
- **Collipulli:** en esta sesión se pudieron leer robots y el listado público. Su convocatoria más reciente observada empezó el 31 de agosto, fuera de los 45 días. Esto no confirma el mismo acceso para todas las herramientas o futuras consultas.
- **Otra convocatoria de Traiguén, del 1 de octubre:** el servidor informa que su PDF de Salud Municipal mide **13.988.452 bytes**, superior a los 8 MiB admitidos por objeto del piloto. No se elevó ese límite ni el archivo total de 32 MiB. Sigue pendiente una estrategia de almacenamiento y lectura para originales mayores que conserve sus hashes e histórico.
- **Facebook e Instagram:** no quedó demostrada una captura directa de publicaciones de esas redes. La descarga de un PDF municipal no acredita ese acceso. Sigue pendiente una vía permitida y estable, o recepción directa de archivos con origen comprobable.
- **Publicación:** las propuestas históricas requieren revisar los campos pendientes y un flujo que las mantenga cerradas. La publicación automática de ofertas vigentes debe probarse con un aviso vigente real y su comprobante de persistencia; esta prueba no lo sustituye.

## Repetición de la prueba

Desde la raíz del repositorio, con Tesseract, Poppler y los idiomas adecuados instalados:

```bash
OMP_THREAD_LIMIT=1 python -m scripts.document_reference_proof \
  'https://mtraiguen.cl/municipalidad/bases-de-segundo-llamado-a-concurso-publico-programa-red-local-de-apoyos-y-cuidados-prlac-traiguen/' \
  --output output/prueba-documental-traiguen
```

La carpeta de salida debe ser nueva: el comando rechaza sustituir una existente. Si los modelos están en una carpeta propia, se puede definir `TESSDATA_PREFIX` para ese comando. En esta prueba el modelo español se descargó del repositorio público oficial `tesseract-ocr/tessdata_fast`; su procedencia y hash están en la evidencia externa. No se cambiaron credenciales ni la instalación global.

## Estado de entrega

Cambios en `repair/mulchen-captura-2026-10-17`. No se integró `main`, no se desplegó la app, no se activaron tareas programadas, no se contactó a publicadores y no se utilizaron proveedores de pago. El resultado verificable es la captura y lectura de una convocatoria municipal escaneada y dos propuestas históricas para revisión; la cobertura social y las publicaciones automáticas vigentes continúan pendientes.
