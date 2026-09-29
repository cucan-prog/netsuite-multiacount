# IMR – Inventario de scripts para migración a SuiteScript 2.1

Herramienta que se instala en cada cuenta de cliente. Hace el inventario de los scripts 1.0 / 2.0 / 2.x, descarta los que pertenecen a bundles de IMR y estima las horas para migrar a 2.1 lo que es del cliente.

Solo **lee** información: no modifica scripts, deployments ni registros. Lo único que escribe son los archivos de resultados en el File Cabinet.

## Componentes

| Objeto | Script ID | Qué hace |
|---|---|---|
| Suitelet | `customscript_imr_inv21_sl` | Pantalla para lanzar el inventario, ver el avance y descargar resultados. Solo para el rol Administrador. |
| Map/Reduce | `customscript_imr_inv21_mr` | Hace el inventario. |

Código en `src/FileCabinet/SuiteScripts/IMR_Inventario_SS21/`:

- `imr_inv_mr.js`: extracción (SuiteQL), análisis por archivo y generación de reportes.
- `imr_inv_sl.js`: interfaz.
- `lib/imr_inv_catalogo.js`: catálogo de bundles propios, **generado** desde `config/bundles_propios.csv`.
- `lib/imr_inv_clasificador.js`: clasificación por ruta del File Cabinet.
- `lib/imr_inv_analizador.js`: análisis estático (versión de API, líneas, llamadas `nlapi`, módulos, integraciones y riesgos 2.1).
- `lib/imr_inv_reglas.js`: **matriz de complejidad y horas**. Aquí se ajustan los umbrales.

## Instalación en una cuenta

### Opción A: SuiteCloud CLI (recomendada)

Requisitos: Node.js y `npm install -g @oracle/suitecloud-cli`, y en la cuenta tener activas *SuiteCloud Development Framework* y *Server SuiteScript*.

```bash
suitecloud account:setup          # autentica la cuenta del cliente (una vez por cuenta)
suitecloud project:validate --server
suitecloud project:deploy
```

### Opción B: manual

1. Sube la carpeta `IMR_Inventario_SS21` (con su subcarpeta `lib`) a *File Cabinet > SuiteScripts*.
2. Crea el script Map/Reduce con `imr_inv_mr.js`, con ID `_imr_inv21_mr` y deployment `_imr_inv21_mr` en estado *Not Scheduled*.
3. Crea el script Suitelet con `imr_inv_sl.js`, con ID `_imr_inv21_sl` y deployment `_imr_inv21_sl`, liberado solo para Administrador.

## Uso

1. Abre el Suitelet (*Customization > Scripting > Script Deployments > IMR - Inventario SS2.1 - SL > URL*).
2. Pulsa **Ejecutar inventario**. Recarga la página para ver el avance.
3. Al terminar, descarga los archivos desde la tabla *Corridas anteriores*. Quedan en *File Cabinet > IMR Inventario SS2.1 > `<cuenta> <fecha> UTC`*.

| Archivo | Contenido |
|---|---|
| `0_resumen.txt` | Totales por origen, versión y complejidad, y estimación de horas con QA |
| `1_scripts_a_migrar.csv` | **Base de la cotización**: scripts del cliente que no están en 2.1 |
| `2_archivos_js_del_cliente.csv` | Archivos .js fuera de registros de script: librerías 1.0 y módulos 2.x, con qué scripts los usan |
| `3_bundles_por_clasificar.csv` | Bundles instalados que no están en el catálogo |
| `4_inventario_completo.csv` | Todos los scripts, incluidos los de bundles (sirve para el inventario interno de IMR) |
| `5_errores.csv` | Solo si hubo errores |

Los CSV están en UTF-8 con BOM y se abren directo en Excel.

## Cómo se clasifica

La clasificación depende de la ruta del archivo principal del script:

- `SuiteBundles/Bundle <ID>/…` con ID en el catálogo → `bundle_propio` (se descarta).
- `SuiteBundles/Bundle <ID>/…` con ID fuera del catálogo → `bundle_tercero_o_desconocido` (se descarta y se lista para clasificar).
- `SuiteApps/…` → `suiteapp` (se descarta).
- Cualquier otra ruta → `cliente` (**se cotiza**).

La versión de API sale de la anotación `@NApiVersion` del archivo. Un archivo principal sin anotación corre como 1.0.

Un script se marca **candidato a retiro** cuando está inactivo o no tiene deployments activos. Esos scripts salen en el CSV, pero no suman horas en el resumen.

## Mantenimiento del catálogo

1. Agrega filas nuevas a `config/bundles_propios.csv`, por ejemplo cuando se publica un bundle nuevo o cuando `3_bundles_por_clasificar.csv` muestra uno propio.
2. Ejecuta `npm run catalogo` para regenerar `lib/imr_inv_catalogo.js`.
3. Vuelve a desplegar en las cuentas.

## Pruebas

```bash
npm test
```

Prueban el analizador, el clasificador, las reglas y el CSV. El Map/Reduce y el Suitelet usan módulos `N/` y hay que probarlos en una cuenta, idealmente sandbox.

## Limitaciones conocidas

- **Heurístico:** el análisis usa expresiones regulares. Los riesgos 2.1 son indicios para estimar, no un diagnóstico.
- **Librerías 1.0:** las que se asocian en la subpestaña *Librerías* del registro de script no se pueden leer por SuiteQL. Aparecen en `2_archivos_js_del_cliente.csv` como "Posible librería 1.0", y hay que confirmar a mano cuáles se usan.
- **Consultas opcionales:** los deployments, los logs de ejecución (`scriptnote`) y el listado de archivos dependen de tablas SuiteQL que pueden variar por cuenta o por rol. Si alguna falla, se omite y queda registrada en el log del Map/Reduce. Los logs solo se conservan unos 30 días, así que "Último log" es un indicio de uso, no una prueba.
- **Archivos no legibles:** los archivos mayores a 5 MB y los archivos ocultos de bundles no se analizan. Sus filas salen con complejidad "Revisar".
