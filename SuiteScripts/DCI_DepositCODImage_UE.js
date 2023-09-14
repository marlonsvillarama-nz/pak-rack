/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope SameAccount
 */
define(['N/search', 'N/ui/serverWidget','N/log'],
/**
 * @param {search} search
 * @param {serverWidget} serverWidget
 */
function(search, serverWidget, log) {
    const FLD_DEPOSIT_IMAGE = 'custbody_deposit_cod_image_inline';
    const DEPOSIT_TERMS_ITEM = '11398';
    /**
     * Function definition to be triggered before record is loaded.
     *
     * @param {Object} scriptContext
     * @param {Record} scriptContext.newRecord - New record
     * @param {string} scriptContext.type - Trigger type
     * @param {Form} scriptContext.form - Current form
     * @Since 2015.2
     */
    function beforeLoad(scriptContext) {
        let sContextType = scriptContext.type;
        let frmSO = scriptContext.form;
        let recSO = scriptContext.newRecord;
        let idSO = recSO.id;
        let hideDepositImage = false;

        if (sContextType !== scriptContext.UserEventType.VIEW && sContextType !== scriptContext.UserEventType.EDIT) {
            return;
        }

        let lookupOrder = search.lookupFields({
            type: recSO.type,
            id: recSO.id,
            columns: [ 'status' ]
        });
        log.debug({ title: 'lookupOrder', details: JSON.stringify(lookupOrder) });
        /* if (lookupOrder.status[0].text.toLowerCase() == 'billed') {
            return;
        } */

        try {
            hideDepositImage = getOrderDeposits(idSO) || getTaxInvoiceDeposit(idSO);
            log.debug({title: 'hideDepositImage', details: hideDepositImage});
            
            let sHtml = '';
            if (!hideDepositImage) {
                sHtml += '<span id="custbody_deposit_cod_image_fs_lbl_uir_label" class="smallgraytextnolink uir-label ">';
                sHtml += '    <span id="custbody_deposit_cod_image_fs_lbl" class="labelSpanEdit smallgraytextnolink" style="">';
                sHtml += '        <a tabindex="-1" title="What\'s this?" href="javascript:void(&quot;help&quot;)"'; 
                sHtml += '              style="cursor:help" onclick="return nlFieldHelp(\'Field Help\', \'custbody_deposit_cod_image\', this)"';
                sHtml += '              class="smallgraytextnolink" onmouseover="this.className=\'smallgraytext\'; return true;"'; 
                sHtml += '              onmouseout="this.className=\'smallgraytextnolink\'; ">Deposit/COD image</a>';
                sHtml += '</span>';
                sHtml += '</span>';
                sHtml += '<img src="/core/media/media.nl?id=982264&c=3862661_SB2&h=tevEyL01FPWn4qpRkPbiSsKE1-cdlcmttbScw9oKcG84sDy_&expurl=T" width="100">';
            }

            frmSO.getField({
                id: FLD_DEPOSIT_IMAGE
            }).defaultValue = sHtml;
        } catch (ex) { 
            log.error({ title: 'Error in setting image', details: ex });
        }
    }

    function getOrderDeposits(orderId) {
        let searchDeposits = search.create({
            type: search.Type.CUSTOMER_DEPOSIT,
            filters: [
                [ 'salesorder', search.Operator.ANYOF, orderId ], 'AND',
                [ 'mainline', search.Operator.IS, 'T' ]
            ],
        }).run().getRange({ start: 0, end: 1000 });
        return searchDeposits.length > 0;
    }

    function getTaxInvoiceDeposit(orderId) {
        let searchInvoices = search.create({
            type: search.Type.INVOICE,
            filters: [
                [ 'mainline', search.Operator.IS, 'F' ],
                'AND',
                [ 'item', search.Operator.ANYOF, DEPOSIT_TERMS_ITEM ],
                'AND',
                [ 'createdfrom', search.Operator.ANYOF, orderId ],
                'AND',
                [ 'status', search.Operator.ANYOF, 'CustInvc:B' ]
            ]
        }).run().getRange({ start: 0, end: 1000 });

        log.debug({ title: 'getTaxInvoiceDeposit', details: JSON.stringify(searchInvoices) });

        return searchInvoices.length > 0;
    }

    return {
        beforeLoad: beforeLoad
    };
    
});