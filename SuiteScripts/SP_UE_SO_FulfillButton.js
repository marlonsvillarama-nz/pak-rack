/**
 * @NApiVersion         2.1
 * @NScriptType         UserEventScript
 */

define(
    [
        'N/log',
        'N/search',
        'N/url'
    ],
    (
        nsLog,
        nsSearch,
        nsUrl
    ) => {
        const MODULE_NAME = 'UE|Fulfill Button';

        const beforeLoad = (context) => {
            let title = 'Before Load';
            if (![context.UserEventType.VIEW].includes(context.type)) {
                nsLog.audit({ title: title, details: `Invalid type ${context.type}.` });
                return;
            }

            let lookupOrder = nsSearch.lookupFields({
                type: context.newRecord.type,
                id: context.newRecord.id,
                columns: [ 'status' ]
            });
            nsLog.debug({ title: `${title} lookupOrder`, details: JSON.stringify(lookupOrder) });

            if (lookupOrder.status[0].value != 'pendingFulfillment') {
                nsLog.audit({ title: title, details: `Invalid order status ${lookupOrder.status[0].value}.` });
                return;
            }

            let fldBackend = context.form.addField({
                id: 'custpage_fulfill_backend',
                type: 'inlinehtml',
                label: 'Backend'
            });
            fldBackend.defaultValue = `
            <script>
            require(["N/url"], (nsUrl) => {
                window.backendUrl = nsUrl.resolveScript({
                    scriptId: 'customscript_sl_so_fulfill_btn',
                    deploymentId: 'customdeploy_sl_so_fulfill_btn'
                });
            });
            </script>
            `;

            context.form.removeButton('process');
            context.form.addButton({
                id: 'custpage_btn_fulfill',
                label: 'Fulfill',
                functionName: 'fulfillOrder'
            });
            context.form.clientScriptModulePath = './SP_CS_SO_FulfillButton';
        };

        return {
            beforeLoad
        };
    }
);