# Catálogo de bundles propios

`bundles_propios.csv` lista los Bundle IDs de IMR. Se usa para excluir del inventario de migración a SuiteScript 2.1 los scripts cuyo archivo está en `SuiteBundles/Bundle <ID>/` del File Cabinet.

Fuente: exportación de "Paquetes guardados" de la cuenta Desarrollo IMR.

| Columna | Descripción |
|---|---|
| `bundle_id` | ID que aparece en la carpeta `SuiteBundles/Bundle <ID>` |
| `tipo` | `publicado`: bundle de la cuenta Desarrollo IMR. `origen_copia`: ID original en otra cuenta (TSTDRV…) del que se copió; clientes antiguos pueden tenerlo instalado con ese ID |
| `bundle_id_publicado` | Para `origen_copia`, el ID actual equivalente |

Para actualizarlo, agrega filas nuevas; no cambies los IDs existentes.
