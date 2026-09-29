'use strict';
// Carga módulos AMD de SuiteScript en Node para probar los que no dependen de N/.
const fs = require('fs');
const path = require('path');

const LIB = path.join(__dirname, '..', 'src', 'FileCabinet', 'SuiteScripts', 'IMR_Inventario_SS21', 'lib');
const cache = {};

function cargar(nombre) {
    if (cache[nombre]) return cache[nombre];
    let deps;
    let fabrica;
    const define = (d, f) => { deps = d; fabrica = f; };
    new Function('define', fs.readFileSync(path.join(LIB, nombre + '.js'), 'utf8'))(define);
    cache[nombre] = fabrica.apply(null, deps.map(d => cargar(path.basename(d))));
    return cache[nombre];
}

module.exports = { cargar };
