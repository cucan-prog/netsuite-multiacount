/**
 * Clasifica un script por la ruta de su archivo en el File Cabinet:
 * bundle propio, bundle de terceros/desconocido, SuiteApp o desarrollo del cliente.
 *
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 */
define(['./imr_inv_catalogo'], (catalogo) => {

    const ORIGEN = {
        BUNDLE_PROPIO: 'bundle_propio',
        BUNDLE_DESCONOCIDO: 'bundle_tercero_o_desconocido',
        SUITEAPP: 'suiteapp',
        CLIENTE: 'cliente',
        SIN_ARCHIVO: 'sin_archivo'
    };

    function clasificar(ruta) {
        const r = (ruta || '').replace(/^\/+/, '');
        if (!r) return { origen: ORIGEN.SIN_ARCHIVO, bundleId: '', bundleNombre: '' };

        const bundle = /^SuiteBundles\/Bundle (\d+)\//i.exec(r);
        if (bundle) {
            const propio = catalogo.bundles[bundle[1]];
            return propio
                ? { origen: ORIGEN.BUNDLE_PROPIO, bundleId: bundle[1], bundleNombre: propio.nombre }
                : { origen: ORIGEN.BUNDLE_DESCONOCIDO, bundleId: bundle[1], bundleNombre: '' };
        }

        const suiteApp = /^SuiteApps\/([^/]+)\//i.exec(r);
        if (suiteApp) return { origen: ORIGEN.SUITEAPP, bundleId: suiteApp[1], bundleNombre: '' };

        return { origen: ORIGEN.CLIENTE, bundleId: '', bundleNombre: '' };
    }

    return { clasificar, ORIGEN };
});
