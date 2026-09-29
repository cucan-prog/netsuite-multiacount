/**
 * Análisis estático del código de un script: versión de API, tamaño,
 * uso de APIs 1.0, módulos, integraciones y riesgos al pasar a 2.1.
 * Es heurístico (expresiones regulares), no un parser de JavaScript.
 *
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 */
define([], () => {

    // Diferencias conocidas entre el motor de 2.0 (Rhino) y el de 2.1 (Graal).
    const RIESGOS_21 = [
        { id: 'for_each', etiqueta: 'for each...in (no existe en 2.1)', re: /\bfor\s+each\s*\(/g },
        { id: 'const', etiqueta: 'const (en 2.1 es de bloque y no se puede reasignar)', re: /\bconst\s+[A-Za-z_$]/g },
        { id: 'reservada', etiqueta: 'Palabra reservada ES2015+ como identificador', re: /\b(?:var|let)\s+(?:let|yield|await|static|enum|implements|package|protected|interface|private|public)\b/g },
        { id: 'e4x', etiqueta: 'E4X / objetos XML de Rhino', re: /\bnew\s+XML(?:List)?\s*\(/g },
        { id: 'java', etiqueta: 'Interoperabilidad Java de Rhino', re: /\bPackages\.|\bjava\.(?:lang|util|io|net)\./g },
        { id: 'locale', etiqueta: 'toLocale*String (el formato puede cambiar)', re: /\.toLocale(?:Date|Time)?String\s*\(/g },
        { id: 'getter', etiqueta: '__defineGetter__ / __defineSetter__', re: /__define[GS]etter__/g }
    ];

    const INTEGRACIONES = [
        { etiqueta: 'HTTP externo', re: /\bnlapiRequestURL(?:WithCredentials)?\s*\(|['"]N\/https?['"]/ },
        { etiqueta: 'SFTP', re: /['"]N\/sftp['"]/ },
        { etiqueta: 'Criptografía', re: /\bnlapiEncrypt\s*\(|['"]N\/crypto['"]/ },
        { etiqueta: 'PDF / plantillas', re: /\bnlapiXMLToPDF\s*\(|\bnlapiCreateTemplateRenderer\s*\(|['"]N\/render['"]/ },
        { etiqueta: 'XML', re: /\bnlapiStringToXML\s*\(|\bnlapiSelectNodes?\s*\(|['"]N\/xml['"]/ }
    ];

    const DEPS_IGNORADAS = ['require', 'exports', 'module'];

    function quitarComentarios(fuente) {
        return fuente
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .split(/\r?\n/)
            .filter(l => !l.trim().startsWith('//'))
            .join('\n');
    }

    function contarLineas(codigo) {
        return codigo.split('\n').filter(l => l.trim() !== '').length;
    }

    function contar(codigo, re) {
        const m = codigo.match(re);
        return m ? m.length : 0;
    }

    function dependencias(codigo) {
        const m = /\bdefine\s*\(\s*(?:['"][^'"]*['"]\s*,\s*)?\[([\s\S]*?)\]/.exec(codigo);
        if (!m) return [];
        const deps = [];
        const re = /['"]([^'"]+)['"]/g;
        let d;
        while ((d = re.exec(m[1])) !== null) {
            if (DEPS_IGNORADAS.indexOf(d[1]) === -1) deps.push(d[1]);
        }
        return deps;
    }

    /**
     * @param {string} fuente contenido del archivo
     * @param {{principal?: boolean}} [opciones] principal = es el archivo del registro de script
     */
    function analizar(fuente, opciones) {
        const principal = !!(opciones && opciones.principal);
        const anotada = /@NApiVersion\s+(2\.[01x])\b/i.exec(fuente);
        const tipoAnotado = /@NScriptType\s+(\w+)/i.exec(fuente);
        const codigo = quitarComentarios(fuente);

        const llamadas = codigo.match(/\bnlapi[A-Z]\w*(?=\s*\()/g) || [];
        const usa1x = llamadas.length > 0 || /\bnlobj[A-Z]\w*/.test(codigo);
        const deps = dependencias(codigo);

        let api;
        if (anotada) api = anotada[1].toLowerCase();
        else if (usa1x || principal) api = '1.0'; // un archivo principal sin anotación corre como 1.0
        else if (deps.length || /\bdefine\s*\(/.test(codigo)) api = '2.x sin anotación';
        else api = 'desconocida';

        const riesgos = api === '1.0' || api === '2.1' ? [] : RIESGOS_21
            .map(r => ({ etiqueta: r.etiqueta, veces: contar(codigo, r.re) }))
            .filter(r => r.veces > 0);

        return {
            apiAnotada: anotada ? anotada[1].toLowerCase() : '',
            api: api,
            tipoAnotado: tipoAnotado ? tipoAnotado[1] : '',
            lineas: contarLineas(codigo),
            llamadas1x: llamadas.length,
            apis1xDistintas: new Set(llamadas).size,
            modulosN: deps.filter(d => d.indexOf('N/') === 0),
            depsPropias: deps.filter(d => d.indexOf('N/') !== 0),
            integraciones: INTEGRACIONES.filter(i => i.re.test(codigo)).map(i => i.etiqueta),
            riesgos21: riesgos
        };
    }

    /**
     * Ruta del File Cabinet de una dependencia de define(), o null si es un módulo N/.
     * @param {string} rutaScript p. ej. 'SuiteScripts/app/ue.js'
     * @param {string} dep p. ej. './lib/util' o '/SuiteScripts/lib/util.js'
     */
    function resolverDependencia(rutaScript, dep) {
        if (!dep || dep.indexOf('N/') === 0) return null;
        let partes;
        if (dep.indexOf('./') === 0 || dep.indexOf('../') === 0) {
            partes = rutaScript.split('/').slice(0, -1).concat(dep.split('/'));
        } else {
            partes = dep.replace(/^\/+/, '').split('/');
        }
        const salida = [];
        partes.forEach(p => {
            if (p === '..') salida.pop();
            else if (p && p !== '.') salida.push(p);
        });
        let ruta = salida.join('/');
        if (!/\.[A-Za-z0-9]+$/.test(ruta)) ruta += '.js';
        return ruta;
    }

    return { analizar, resolverDependencia, RIESGOS_21 };
});
