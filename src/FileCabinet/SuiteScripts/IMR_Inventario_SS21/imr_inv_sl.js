/**
 * IMR - Inventario SS2.1: pantalla para lanzar el inventario y descargar resultados.
 *
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 */
define(['N/ui/serverWidget', 'N/task', 'N/redirect', 'N/runtime', './lib/imr_inv_carpetas'],
(serverWidget, task, redirect, runtime, carpetas) => {

    const MR = { scriptId: 'customscript_imr_inv21_mr', deploymentId: 'customdeploy_imr_inv21_mr' };

    function html(texto) {
        return String(texto === null || texto === undefined ? '' : texto)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function estadoTarea(taskId) {
        try {
            const st = task.checkStatus({ taskId: taskId });
            const avance = st.status === task.TaskStatus.COMPLETE ? 100 : st.getPercentageCompleted();
            return 'Estado: <b>' + html(st.status) + '</b>' + (st.stage ? ' — etapa ' + html(st.stage) : '') +
                ' — ' + html(avance) + '%. Recarga la página para actualizar.';
        } catch (e) {
            return 'No se pudo consultar la tarea: ' + html(e.message);
        }
    }

    function tablaCorridas() {
        const corridas = carpetas.listarCorridas(20);
        if (!corridas.length) return '<p>Todavía no hay corridas.</p>';
        const filas = corridas.map(c => '<tr><td style="padding:4px 12px 4px 0;vertical-align:top">' + html(c.nombre) + '</td><td style="padding:4px 0">' +
            (c.archivos.length
                ? c.archivos.sort((a, b) => a.nombre < b.nombre ? -1 : 1)
                    .map(a => '<a href="' + html(a.url) + '" target="_blank">' + html(a.nombre) + '</a>').join('<br>')
                : '<i>en proceso…</i>') + '</td></tr>');
        return '<table><tr><th align="left">Corrida</th><th align="left">Archivos</th></tr>' + filas.join('') + '</table>';
    }

    function get(context) {
        const form = serverWidget.createForm({ title: 'IMR - Inventario SuiteScript 2.1' });
        const params = context.request.parameters;

        let mensaje = '<p>Recorre los scripts y archivos .js de la cuenta, descarta los que pertenecen a bundles de IMR ' +
            'y estima las horas para migrar a 2.1 lo que es del cliente. Solo lee información. ' +
            'Los resultados se guardan en File Cabinet &gt; ' + html(carpetas.RAIZ) + '.</p>';
        if (params.taskid) mensaje += '<p>' + estadoTarea(params.taskid) + '</p>';
        if (params.error) mensaje += '<p style="color:#b00">' + html(params.error) + '</p>';

        form.addField({ id: 'custpage_info', type: serverWidget.FieldType.INLINEHTML, label: ' ' }).defaultValue = mensaje;
        form.addField({ id: 'custpage_corridas', type: serverWidget.FieldType.INLINEHTML, label: ' ' }).defaultValue =
            '<h3 style="margin-top:16px">Corridas anteriores</h3>' + tablaCorridas();
        form.addSubmitButton({ label: 'Ejecutar inventario' });
        context.response.writePage(form);
    }

    function post() {
        const script = runtime.getCurrentScript();
        const destino = { scriptId: script.id, deploymentId: script.deploymentId };
        try {
            const taskId = task.create(Object.assign({ taskType: task.TaskType.MAP_REDUCE }, MR)).submit();
            redirect.toSuitelet(Object.assign(destino, { parameters: { taskid: taskId } }));
        } catch (e) {
            redirect.toSuitelet(Object.assign(destino, { parameters: { error: 'No se pudo iniciar el inventario (¿ya hay uno en curso?): ' + e.message } }));
        }
    }

    function onRequest(context) {
        if (context.request.method === 'POST') post();
        else get(context);
    }

    return { onRequest };
});
