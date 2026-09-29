'use strict';
// Genera el módulo del catálogo de bundles a partir de config/bundles_propios.csv.
// Uso: node tools/generar_catalogo.js
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const ORIGEN = path.join(RAIZ, 'config', 'bundles_propios.csv');
const DESTINO = path.join(RAIZ, 'src', 'FileCabinet', 'SuiteScripts', 'IMR_Inventario_SS21', 'lib', 'imr_inv_catalogo.js');

function parsearCsv(texto) {
    const filas = [];
    let fila = [];
    let campo = '';
    let enComillas = false;
    for (let i = 0; i < texto.length; i++) {
        const c = texto[i];
        if (enComillas) {
            if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
            else if (c === '"') { enComillas = false; }
            else { campo += c; }
        } else if (c === '"') {
            enComillas = true;
        } else if (c === ',') {
            fila.push(campo); campo = '';
        } else if (c === '\n' || c === '\r') {
            if (c === '\r' && texto[i + 1] === '\n') i++;
            fila.push(campo); campo = '';
            if (fila.some(v => v !== '')) filas.push(fila);
            fila = [];
        } else {
            campo += c;
        }
    }
    fila.push(campo);
    if (fila.some(v => v !== '')) filas.push(fila);
    return filas;
}

const [encabezado, ...filas] = parsearCsv(fs.readFileSync(ORIGEN, 'utf8').replace(/^﻿/, ''));
const bundles = {};
for (const valores of filas) {
    const r = Object.fromEntries(encabezado.map((h, i) => [h, (valores[i] || '').trim()]));
    if (!r.bundle_id) continue;
    bundles[r.bundle_id] = { nombre: r.nombre, tipo: r.tipo, publicado: r.bundle_id_publicado || r.bundle_id };
}

const contenido = `/**
 * Catálogo de bundles propios. ARCHIVO GENERADO: no editar a mano.
 * Fuente: config/bundles_propios.csv -> node tools/generar_catalogo.js
 *
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 */
define([], () => ({
    bundles: ${JSON.stringify(bundles, null, 4).replace(/\n/g, '\n    ')}
}));
`;
fs.writeFileSync(DESTINO, contenido);
console.log(`${Object.keys(bundles).length} bundles escritos en ${path.relative(RAIZ, DESTINO)}`);
