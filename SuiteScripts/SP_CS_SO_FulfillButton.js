/**
 * @NApiVersion         2.1
 * @NScriptType         ClientScript
 */

define(
    [
        'N/currentRecord',
        'N/url'
    ],
    (
        nsCR,
        nsUrl
    ) => {
        const pageInit = (context) => {};

        const fulfillOrder = () => {
            let thisRecord = nsCR.get();
            console.log(`backendUrl = ${window.backendUrl}`);
            Ext.getBody().mask("Creating item fulfillment...");
            fetch(`${window.backendUrl}&action=fulfill&order=${thisRecord.id}`)
                .then(response => response.json())
                .then(response => {
                    if (response.status > 0) {
                        let urlFulfillment = nsUrl.resolveRecord({
                            recordType: 'itemfulfillment',
                            recordId: response.data,
                            isEditMode: true
                        });
                        window.location.replace(urlFulfillment);
                    }
                    else {
                        alert(response.status < 0 ? response.error : 'An error has occurred. Please consult your Administrator.');
                        Ext.getBody().unmask();
                    }
                });
        };

        return {
            pageInit,
            fulfillOrder
        };
    }
);