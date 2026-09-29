/**
 * Generación de CSV compatible con Excel (UTF-8 con BOM).
 *
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 */
define([], () => {

    function celda(valor) {
        if (valor === null || valor === undefined) return '';
        const texto = Array.isArray(valor) ? valor.join('; ') : String(valor);
        return /[",\r\n]/.test(texto) ? '"' + texto.replace(/"/g, '""') + '"' : texto;
    }

    /**
     * @param {object[]} filas
     * @param {{clave: string, titulo: string}[]} columnas
     */
    function generar(filas, columnas) {
        const lineas = [columnas.map(c => celda(c.titulo)).join(',')];
        filas.forEach(f => lineas.push(columnas.map(c => celda(f[c.clave])).join(',')));
        return '﻿' + lineas.join('\r\n');
    }

    return { generar };
});
