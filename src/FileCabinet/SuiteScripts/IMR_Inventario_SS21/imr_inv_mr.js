/**
 * IMR - Inventario de scripts para migración a SuiteScript 2.1.
 *
 * getInputData: lee los registros de script, sus deployments y los archivos .js de la cuenta.
 * map:          carga cada archivo, lo clasifica (bundle propio / terceros / cliente) y lo analiza.
 * summarize:    genera los CSV y el resumen en File Cabinet > "IMR Inventario SS2.1".
 *
 * Solo lee información; no modifica scripts ni deployments.
 *
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 * @NModuleScope SameAccount
 */
define(['N/query', 'N/file', 'N/runtime', 'N/log',
    './lib/imr_inv_analizador', './lib/imr_inv_clasificador', './lib/imr_inv_reglas',
    './lib/imr_inv_csv', './lib/imr_inv_carpetas'],
(query, file, runtime, log, analizador, clasificador, reglas, csv, carpetas) => {

    const TIPOS_SCRIPT = {
        USEREVENT: 'User Event', CLIENT: 'Client', SCHEDULED: 'Scheduled', MAPREDUCE: 'Map/Reduce',
        SCRIPTLET: 'Suitelet', RESTLET: 'RESTlet', ACTION: 'Workflow Action', MASSUPDATE: 'Mass Update',
        PORTLET: 'Portlet', BUNDLEINSTALLATION: 'Bundle Installation', SDFINSTALLATION: 'SDF Installation',
        PLUGINTYPE: 'Plugin Type', PLUGINTYPEIMPL: 'Plugin', CUSTOMGLLINES: 'Custom GL Lines',
        EMAILCAPTURE: 'Email Capture'
    };

    const COLUMNAS_INVENTARIO = [
        { clave: 'id', titulo: 'ID interno' },
        { clave: 'scriptId', titulo: 'ID de script' },
        { clave: 'nombre', titulo: 'Nombre' },
        { clave: 'tipo', titulo: 'Tipo' },
        { clave: 'api', titulo: 'API detectada' },
        { clave: 'apiRegistro', titulo: 'API en registro' },
        { clave: 'inactivo', titulo: 'Inactivo' },
        { clave: 'deployments', titulo: 'Deployments' },
        { clave: 'deploymentsActivos', titulo: 'Deployments activos' },
        { clave: 'registros', titulo: 'Registros donde corre' },
        { clave: 'ultimoLog', titulo: 'Último log de ejecución' },
        { clave: 'ruta', titulo: 'Ruta del archivo' },
        { clave: 'origen', titulo: 'Origen' },
        { clave: 'bundleId', titulo: 'Bundle / SuiteApp' },
        { clave: 'bundleNombre', titulo: 'Nombre del bundle' },
        { clave: 'lineas', titulo: 'Líneas de código' },
        { clave: 'llamadas1x', titulo: 'Llamadas nlapi' },
        { clave: 'apis1xDistintas', titulo: 'APIs nlapi distintas' },
        { clave: 'modulosN', titulo: 'Módulos N/' },
        { clave: 'depsPropias', titulo: 'Dependencias propias' },
        { clave: 'integraciones', titulo: 'Integraciones' },
        { clave: 'riesgos21', titulo: 'Riesgos 2.1' },
        { clave: 'complejidad', titulo: 'Complejidad' },
        { clave: 'horasMin', titulo: 'Horas mín' },
        { clave: 'horasMax', titulo: 'Horas máx' },
        { clave: 'candidatoRetiro', titulo: 'Candidato a retiro' },
        { clave: 'notas', titulo: 'Notas' }
    ];

    const COLUMNAS_ARCHIVOS = [
        { clave: 'id', titulo: 'ID de archivo' },
        { clave: 'ruta', titulo: 'Ruta' },
        { clave: 'api', titulo: 'API detectada' },
        { clave: 'lineas', titulo: 'Líneas de código' },
        { clave: 'llamadas1x', titulo: 'Llamadas nlapi' },
        { clave: 'referenciadoPor', titulo: 'Usado por (define)' },
        { clave: 'complejidad', titulo: 'Complejidad' },
        { clave: 'horasMin', titulo: 'Horas mín' },
        { clave: 'horasMax', titulo: 'Horas máx' },
        { clave: 'notas', titulo: 'Notas' }
    ];

    const COLUMNAS_BUNDLES = [
        { clave: 'bundleId', titulo: 'Bundle ID' },
        { clave: 'scripts', titulo: 'Scripts' },
        { clave: 'ejemplos', titulo: 'Ejemplos de scripts' },
        { clave: 'ruta', titulo: 'Ruta de ejemplo' },
        { clave: 'clasificacion', titulo: 'Clasificación (propio / tercero)' }
    ];

    const MAX_BYTES_ANALISIS = 5 * 1024 * 1024;

    // ---------- utilidades ----------

    function consultar(sql) {
        const filas = [];
        const paginado = query.runSuiteQLPaged({ query: sql, pageSize: 1000 });
        paginado.pageRanges.forEach(rango => {
            paginado.fetch({ index: rango.index }).data.asMappedResults().forEach(f => filas.push(f));
        });
        return filas;
    }

    function consultarOpcional(sql, descripcion) {
        try {
            return consultar(sql);
        } catch (e) {
            log.audit({ title: 'Consulta omitida: ' + descripcion, details: e.message });
            return null;
        }
    }

    function texto(v) {
        return v === null || v === undefined ? '' : String(v);
    }

    function esVerdadero(v) {
        return v === true || v === 'T' || v === 't';
    }

    function leerArchivo(id) {
        const f = file.load({ id: id });
        const resultado = { ruta: f.path, contenido: null, nota: '' };
        if (f.size > MAX_BYTES_ANALISIS) resultado.nota = 'Archivo mayor a 5 MB, no analizado';
        else resultado.contenido = f.getContents();
        return resultado;
    }

    function metricas(analisis) {
        if (!analisis) return {};
        return {
            api: analisis.api,
            lineas: analisis.lineas,
            llamadas1x: analisis.llamadas1x,
            apis1xDistintas: analisis.apis1xDistintas,
            modulosN: analisis.modulosN,
            depsPropias: analisis.depsPropias,
            integraciones: analisis.integraciones,
            riesgos21: analisis.riesgos21.map(r => r.etiqueta + ' (' + r.veces + ')')
        };
    }

    // ---------- etapas ----------

    function getInputData() {
        const scripts = consultar('SELECT * FROM script');

        const deploymentsPorScript = {};
        (consultarOpcional('SELECT * FROM scriptdeployment', 'deployments') || []).forEach(d => {
            const id = texto(d.script);
            const actual = deploymentsPorScript[id] || (deploymentsPorScript[id] = { total: 0, activos: 0, registros: [] });
            actual.total++;
            if (esVerdadero(d.isdeployed)) actual.activos++;
            const registro = texto(d.recordtype);
            if (registro && actual.registros.indexOf(registro) === -1) actual.registros.push(registro);
        });

        // Los logs de ejecución solo se conservan unos 30 días; sirve como indicio de uso, no como prueba.
        const ultimoLog = {};
        (consultarOpcional('SELECT scripttype AS script, MAX(date) AS ultimo FROM scriptnote GROUP BY scripttype',
            'logs de ejecución') || []).forEach(l => { ultimoLog[texto(l.script)] = texto(l.ultimo); });

        const archivosDeScripts = {};
        const entradas = scripts.map(s => {
            const id = texto(s.id);
            const dep = deploymentsPorScript[id] || { total: 0, activos: 0, registros: [] };
            if (s.scriptfile) archivosDeScripts[texto(s.scriptfile)] = true;
            return {
                clase: 'script',
                id: id,
                scriptId: texto(s.scriptid),
                nombre: texto(s.name),
                tipo: TIPOS_SCRIPT[texto(s.scripttype).toUpperCase()] || texto(s.scripttype),
                apiRegistro: texto(s.apiversion),
                inactivo: esVerdadero(s.isinactive),
                archivo: texto(s.scriptfile),
                deployments: dep.total,
                deploymentsActivos: dep.activos,
                registros: dep.registros,
                ultimoLog: ultimoLog[id] || ''
            };
        });

        // Archivos .js sin registro de script propio: librerías 1.0, módulos 2.x y SSP.
        (consultarOpcional("SELECT id FROM file WHERE filetype = 'JAVASCRIPT' OR LOWER(name) LIKE '%.ss' OR LOWER(name) LIKE '%.ssp'",
            'archivos JavaScript') || []).forEach(f => {
            const id = texto(f.id);
            if (!archivosDeScripts[id]) entradas.push({ clase: 'archivo', id: id });
        });

        log.audit({ title: 'Entradas', details: scripts.length + ' scripts, ' + (entradas.length - scripts.length) + ' archivos adicionales' });
        return entradas;
    }

    function map(context) {
        const e = JSON.parse(context.value);
        return e.clase === 'script' ? mapScript(context, e) : mapArchivo(context, e);
    }

    function mapScript(context, s) {
        const fila = Object.assign({}, s, { ruta: '', notas: '' });
        let analisis = null;

        if (s.archivo) {
            try {
                const a = leerArchivo(s.archivo);
                fila.ruta = a.ruta;
                fila.notas = a.nota;
                if (a.contenido !== null) analisis = analizador.analizar(a.contenido, { principal: true });
            } catch (err) {
                fila.notas = 'No se pudo leer el archivo: ' + err.message;
            }
        }

        const c = clasificador.clasificar(fila.ruta);
        Object.assign(fila, c, metricas(analisis), reglas.estimar(analisis));
        if (!analisis) fila.api = fila.apiRegistro || 'desconocida';
        fila.candidatoRetiro = fila.inactivo || fila.deploymentsActivos === 0 ? 'Sí' : '';
        fila.inactivo = fila.inactivo ? 'Sí' : '';

        context.write({ key: 'script:' + s.id, value: JSON.stringify(fila) });
    }

    function mapArchivo(context, f) {
        let a;
        try {
            a = leerArchivo(f.id);
        } catch (err) {
            return; // archivos ocultos o sin permiso (normalmente de bundles)
        }
        if (clasificador.clasificar(a.ruta).origen !== clasificador.ORIGEN.CLIENTE) return;

        const analisis = a.contenido === null ? null : analizador.analizar(a.contenido, { principal: false });
        if (analisis && analisis.api === '2.1') return;

        const fila = Object.assign({ id: f.id, ruta: a.ruta, notas: a.nota }, metricas(analisis), reglas.estimar(analisis));
        context.write({ key: 'archivo:' + f.id, value: JSON.stringify(fila) });
    }

    function summarize(summary) {
        const scripts = [];
        const archivos = [];
        const errores = [];

        summary.output.iterator().each((clave, valor) => {
            (clave.indexOf('script:') === 0 ? scripts : archivos).push(JSON.parse(valor));
            return true;
        });
        if (summary.inputSummary.error) errores.push({ etapa: 'getInputData', clave: '', error: summary.inputSummary.error });
        summary.mapSummary.errors.iterator().each((clave, error) => {
            errores.push({ etapa: 'map', clave: clave, error: error });
            return true;
        });

        // Qué scripts del cliente usan cada archivo vía define().
        const usadoPor = {};
        scripts.forEach(s => (s.depsPropias || []).forEach(dep => {
            const ruta = analizador.resolverDependencia(s.ruta, dep);
            if (ruta) (usadoPor[ruta] = usadoPor[ruta] || []).push(s.scriptId);
        }));
        archivos.forEach(a => {
            a.referenciadoPor = usadoPor[a.ruta] || [];
            if (!a.referenciadoPor.length && a.api === '1.0') a.notas = [a.notas, 'Posible librería 1.0: revisar en qué scripts está en Librerías'].filter(Boolean).join('. ');
        });

        const ORIGEN = clasificador.ORIGEN;
        const aMigrar = scripts.filter(s => s.origen === ORIGEN.CLIENTE && s.api !== '2.1');
        const bundles = agruparBundles(scripts.filter(s => s.origen === ORIGEN.BUNDLE_DESCONOCIDO));

        const cuenta = runtime.accountId;
        const fecha = new Date().toISOString().replace('T', ' ').slice(0, 16).replace(':', '.');
        const carpeta = carpetas.obtenerOCrear(cuenta + ' ' + fecha + ' UTC', carpetas.obtenerOCrear(carpetas.RAIZ, null));

        guardar(carpeta, '1_scripts_a_migrar.csv', csv.generar(aMigrar, COLUMNAS_INVENTARIO), file.Type.CSV);
        guardar(carpeta, '2_archivos_js_del_cliente.csv', csv.generar(archivos, COLUMNAS_ARCHIVOS), file.Type.CSV);
        guardar(carpeta, '3_bundles_por_clasificar.csv', csv.generar(bundles, COLUMNAS_BUNDLES), file.Type.CSV);
        guardar(carpeta, '4_inventario_completo.csv', csv.generar(scripts, COLUMNAS_INVENTARIO), file.Type.CSV);
        if (errores.length) {
            guardar(carpeta, '5_errores.csv', csv.generar(errores,
                [{ clave: 'etapa', titulo: 'Etapa' }, { clave: 'clave', titulo: 'Clave' }, { clave: 'error', titulo: 'Error' }]), file.Type.CSV);
        }
        guardar(carpeta, '0_resumen.txt', resumen(cuenta, scripts, aMigrar, archivos, bundles, errores), file.Type.PLAINTEXT);

        log.audit({ title: 'Inventario terminado', details: 'Carpeta ' + carpeta + ': ' + aMigrar.length + ' scripts a migrar' });
    }

    // ---------- salida ----------

    function guardar(carpeta, nombre, contenido, tipo) {
        file.create({ name: nombre, fileType: tipo, contents: contenido, folder: carpeta, encoding: file.Encoding.UTF_8 }).save();
    }

    function agruparBundles(scripts) {
        const porId = {};
        scripts.forEach(s => {
            const b = porId[s.bundleId] || (porId[s.bundleId] = { bundleId: s.bundleId, scripts: 0, ejemplos: [], ruta: s.ruta, clasificacion: '' });
            b.scripts++;
            if (b.ejemplos.length < 5) b.ejemplos.push(s.nombre);
        });
        return Object.keys(porId).map(k => porId[k]).sort((a, b) => b.scripts - a.scripts);
    }

    function sumar(filas, campo) {
        return filas.reduce((t, f) => t + (typeof f[campo] === 'number' ? f[campo] : 0), 0);
    }

    function contarPor(filas, campo) {
        const r = {};
        filas.forEach(f => { r[f[campo]] = (r[f[campo]] || 0) + 1; });
        return Object.keys(r).sort().map(k => '  ' + k + ': ' + r[k]).join('\n') || '  (ninguno)';
    }

    function resumen(cuenta, scripts, aMigrar, archivos, bundles, errores) {
        const qa = reglas.REGLAS.factorQA;
        const activos = aMigrar.filter(s => !s.candidatoRetiro);
        const enUso = {};
        scripts.filter(s => !s.candidatoRetiro).forEach(s => { enUso[s.scriptId] = true; });
        const archivosUsados = archivos.filter(a => a.api === '1.0' || a.referenciadoPor.some(id => enUso[id]));
        const min = sumar(activos, 'horasMin') + sumar(archivosUsados, 'horasMin');
        const max = sumar(activos, 'horasMax') + sumar(archivosUsados, 'horasMax');
        const redondear = n => Math.round(n * 10) / 10;

        return [
            'Inventario de scripts para migración a SuiteScript 2.1',
            'Cuenta: ' + cuenta,
            'Fecha: ' + new Date().toISOString(),
            '',
            'Scripts en la cuenta: ' + scripts.length,
            'Por origen:',
            contarPor(scripts, 'origen'),
            '',
            'Scripts del cliente por versión de API:',
            contarPor(scripts.filter(s => s.origen === clasificador.ORIGEN.CLIENTE), 'api'),
            '',
            'Scripts a migrar: ' + aMigrar.length + ' (' + (aMigrar.length - activos.length) + ' candidatos a retiro)',
            'Por complejidad:',
            contarPor(aMigrar, 'complejidad'),
            '',
            'Archivos .js del cliente (librerías 1.0 y módulos usados por scripts activos): ' + archivosUsados.length,
            'Bundles no reconocidos por clasificar: ' + bundles.length,
            'Errores: ' + errores.length,
            '',
            'Estimación (sin candidatos a retiro, con librerías usadas o 1.0):',
            '  Desarrollo: ' + redondear(min) + ' - ' + redondear(max) + ' h',
            '  QA/UAT y despliegue (' + Math.round(qa * 100) + '%): ' + redondear(min * qa) + ' - ' + redondear(max * qa) + ' h',
            '  Total: ' + redondear(min * (1 + qa)) + ' - ' + redondear(max * (1 + qa)) + ' h',
            '',
            'Filas con complejidad "Revisar" no suman horas: estímalas a mano.',
            'Si 3_bundles_por_clasificar.csv trae bundles propios, agrégalos a config/bundles_propios.csv y vuelve a correr.'
        ].join('\r\n');
    }

    return { getInputData, map, summarize };
});
