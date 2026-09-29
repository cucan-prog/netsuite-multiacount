/**
 * Carpetas de salida del inventario en el File Cabinet.
 *
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 */
define(['N/search', 'N/record'], (search, record) => {

    const RAIZ = 'IMR Inventario SS2.1';

    function buscar(nombre, padreId) {
        let id = null;
        search.create({
            type: search.Type.FOLDER,
            filters: [['name', 'is', nombre], 'AND', ['parent', 'anyof', padreId || '@NONE@']],
            columns: ['internalid']
        }).run().each(r => { id = Number(r.id); return false; });
        return id;
    }

    function obtenerOCrear(nombre, padreId) {
        const existente = buscar(nombre, padreId);
        if (existente) return existente;
        const carpeta = record.create({ type: record.Type.FOLDER });
        carpeta.setValue({ fieldId: 'name', value: nombre });
        if (padreId) carpeta.setValue({ fieldId: 'parent', value: padreId });
        return carpeta.save();
    }

    /** Corridas anteriores (subcarpetas de la raíz) con sus archivos, de la más reciente a la más antigua. */
    function listarCorridas(limite) {
        const raiz = buscar(RAIZ, null);
        if (!raiz) return [];

        const corridas = [];
        search.create({
            type: search.Type.FOLDER,
            filters: [['parent', 'anyof', raiz]],
            columns: [search.createColumn({ name: 'internalid', sort: search.Sort.DESC }), 'name']
        }).run().getRange({ start: 0, end: limite || 20 }).forEach(r => {
            corridas.push({ id: Number(r.id), nombre: r.getValue('name'), archivos: [] });
        });
        if (!corridas.length) return corridas;

        const porId = {};
        corridas.forEach(c => { porId[c.id] = c; });
        search.create({
            type: 'file',
            filters: [['folder', 'anyof', corridas.map(c => c.id)]],
            columns: ['name', 'url', 'folder']
        }).run().each(r => {
            const c = porId[Number(r.getValue('folder'))];
            if (c) c.archivos.push({ nombre: r.getValue('name'), url: r.getValue('url') });
            return true;
        });
        return corridas;
    }

    return { RAIZ, obtenerOCrear, listarCorridas };
});
