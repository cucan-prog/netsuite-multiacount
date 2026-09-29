'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { cargar } = require('./amd');

const analizador = cargar('imr_inv_analizador');
const clasificador = cargar('imr_inv_clasificador');
const reglas = cargar('imr_inv_reglas');
const csv = cargar('imr_inv_csv');

test('detecta 1.0 y cuenta llamadas nlapi fuera de comentarios', () => {
    const src = [
        'function beforeSubmit(type) {',
        '  // nlapiLogExecution("DEBUG", "comentado");',
        '  var rec = nlapiGetNewRecord();',
        '  var r = nlapiRequestURL("https://x");',
        '  nlapiLogExecution("DEBUG", "t", rec.getId());',
        '}'
    ].join('\n');
    const a = analizador.analizar(src, { principal: true });
    assert.strictEqual(a.api, '1.0');
    assert.strictEqual(a.llamadas1x, 3);
    assert.strictEqual(a.apis1xDistintas, 3);
    assert.deepStrictEqual(a.integraciones, ['HTTP externo']);
    assert.strictEqual(a.lineas, 5);
});

test('lee la anotación de versión y los riesgos de 2.x', () => {
    const src = [
        '/**', ' * @NApiVersion 2.x', ' * @NScriptType UserEventScript', ' */',
        "define(['N/record', 'N/https', './lib/util', '/SuiteScripts/comun/fechas'], function (record, https, util) {",
        '  const IVA = 0.16;',
        '  for each (var x in lista) {}',
        '  var d = new Date().toLocaleDateString();',
        '});'
    ].join('\n');
    const a = analizador.analizar(src, { principal: true });
    assert.strictEqual(a.api, '2.x');
    assert.strictEqual(a.tipoAnotado, 'UserEventScript');
    assert.deepStrictEqual(a.modulosN, ['N/record', 'N/https']);
    assert.deepStrictEqual(a.depsPropias, ['./lib/util', '/SuiteScripts/comun/fechas']);
    assert.strictEqual(a.riesgos21.length, 3);
});

test('2.1 no reporta riesgos; módulo sin anotación se marca aparte', () => {
    assert.strictEqual(analizador.analizar('/** @NApiVersion 2.1 */ define([], () => { const a = 1; });').riesgos21.length, 0);
    assert.strictEqual(analizador.analizar("define(['N/log'], function (log) {});").api, '2.x sin anotación');
    assert.strictEqual(analizador.analizar('var x = 1;').api, 'desconocida');
    assert.strictEqual(analizador.analizar('var x = 1;', { principal: true }).api, '1.0');
});

test('resuelve dependencias relativas y absolutas', () => {
    const base = 'SuiteScripts/app/ue.js';
    assert.strictEqual(analizador.resolverDependencia(base, './lib/util'), 'SuiteScripts/app/lib/util.js');
    assert.strictEqual(analizador.resolverDependencia(base, '../comun/x.js'), 'SuiteScripts/comun/x.js');
    assert.strictEqual(analizador.resolverDependencia(base, '/SuiteScripts/comun/fechas'), 'SuiteScripts/comun/fechas.js');
    assert.strictEqual(analizador.resolverDependencia(base, 'N/record'), null);
});

test('clasifica por ruta contra el catálogo', () => {
    const O = clasificador.ORIGEN;
    assert.deepStrictEqual(clasificador.clasificar('SuiteBundles/Bundle 38964/pol.js'),
        { origen: O.BUNDLE_PROPIO, bundleId: '38964', bundleNombre: 'IMR - Impresión de Pólizas' });
    // ID de origen de un bundle copiado
    assert.strictEqual(clasificador.clasificar('SuiteBundles/Bundle 27137/pol.js').origen, O.BUNDLE_PROPIO);
    assert.strictEqual(clasificador.clasificar('SuiteBundles/Bundle 1/x.js').origen, O.BUNDLE_DESCONOCIDO);
    assert.strictEqual(clasificador.clasificar('SuiteApps/com.netsuite.x/a.js').origen, O.SUITEAPP);
    assert.strictEqual(clasificador.clasificar('/SuiteScripts/cliente/a.js').origen, O.CLIENTE);
    assert.strictEqual(clasificador.clasificar('').origen, O.SIN_ARCHIVO);
});

test('estima complejidad y horas', () => {
    const base = { lineas: 100, llamadas1x: 10, integraciones: [], riesgos21: [] };
    assert.deepStrictEqual(reglas.estimar(Object.assign({}, base, { api: '1.0' })), { complejidad: 'Simple', horasMin: 4, horasMax: 8 });
    assert.strictEqual(reglas.estimar(Object.assign({}, base, { api: '1.0', integraciones: ['HTTP externo'] })).complejidad, 'Medio');
    assert.strictEqual(reglas.estimar(Object.assign({}, base, { api: '1.0', lineas: 900 })).complejidad, 'Complejo');
    assert.strictEqual(reglas.estimar(Object.assign({}, base, { api: '2.0' })).complejidad, 'Simple');
    assert.strictEqual(reglas.estimar(Object.assign({}, base, { api: '2.x', riesgos21: ['a', 'b', 'c'] })).complejidad, 'Complejo');
    assert.strictEqual(reglas.estimar(Object.assign({}, base, { api: '2.1' })).complejidad, 'No aplica');
    assert.strictEqual(reglas.estimar(null).complejidad, 'Revisar');
});

test('genera CSV con BOM y escapa comas, comillas y listas', () => {
    const salida = csv.generar([{ a: 'x, "y"', b: ['1', '2'] }], [{ clave: 'a', titulo: 'A' }, { clave: 'b', titulo: 'B' }]);
    assert.strictEqual(salida, '﻿A,B\r\n"x, ""y""",1; 2');
});
