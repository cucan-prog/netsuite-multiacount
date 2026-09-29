/**
 * Matriz de complejidad y horas estimadas para migrar a SuiteScript 2.1.
 * Ajusta los umbrales y las horas aquí; el resto del inventario no cambia.
 *
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 */
define([], () => {

    const REGLAS = {
        '1.0': {
            // Reescritura completa.
            simple: { maxLineas: 200, maxLlamadas1x: 30 },
            complejo: { minLineas: 800, minLlamadas1x: 150, minLineasConIntegracion: 400 },
            horas: { Simple: [4, 8], Medio: [8, 24], Complejo: [24, 60] }
        },
        '2.0': {
            // Cambio de anotación, ajustes puntuales y regresión.
            simple: { maxLineas: 300, maxRiesgos: 0 },
            complejo: { minLineas: 1000, minRiesgos: 3 },
            horas: { Simple: [0.5, 1], Medio: [1, 3], Complejo: [3, 8] }
        },
        // Porcentaje extra sobre el total para QA/UAT en sandbox y despliegue.
        factorQA: 0.25
    };

    function nivel1x(m) {
        const r = REGLAS['1.0'];
        if (m.lineas >= r.complejo.minLineas || m.llamadas1x >= r.complejo.minLlamadas1x ||
            (m.integraciones.length > 0 && m.lineas >= r.complejo.minLineasConIntegracion)) return 'Complejo';
        if (m.lineas <= r.simple.maxLineas && m.llamadas1x <= r.simple.maxLlamadas1x &&
            m.integraciones.length === 0) return 'Simple';
        return 'Medio';
    }

    function nivel2x(m) {
        const r = REGLAS['2.0'];
        const riesgos = m.riesgos21.length;
        if (m.lineas >= r.complejo.minLineas || riesgos >= r.complejo.minRiesgos) return 'Complejo';
        if (m.lineas <= r.simple.maxLineas && riesgos <= r.simple.maxRiesgos) return 'Simple';
        return 'Medio';
    }

    /**
     * @param {object|null} m resultado de analizador.analizar(), o null si no se pudo leer el archivo
     * @returns {{complejidad: string, horasMin: number|string, horasMax: number|string}}
     */
    function estimar(m) {
        if (!m) return { complejidad: 'Revisar', horasMin: '', horasMax: '' };
        if (m.api === '2.1') return { complejidad: 'No aplica', horasMin: 0, horasMax: 0 };

        let familia;
        let complejidad;
        if (m.api === '1.0') { familia = '1.0'; complejidad = nivel1x(m); }
        else if (m.api.indexOf('2.') === 0) { familia = '2.0'; complejidad = nivel2x(m); }
        else return { complejidad: 'Revisar', horasMin: '', horasMax: '' };

        const horas = REGLAS[familia].horas[complejidad];
        return { complejidad, horasMin: horas[0], horasMax: horas[1] };
    }

    return { estimar, REGLAS };
});
