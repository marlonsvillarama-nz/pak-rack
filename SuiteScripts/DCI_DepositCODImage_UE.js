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
        let bShowDepositImage = true;

        if (sContextType == scriptContext.UserEventType.VIEW || sContextType == scriptContext.UserEventType.EDIT) {
            try {
                search.create({
                    type: search.Type.CUSTOMER_DEPOSIT,
                    filters: [
                        ['salesorder', search.Operator.ANYOF, idSO], 'AND',
                        ['mainline', search.Operator.IS, 'T']
                    ],
                }).run().each((oResult) => {
                    log.debug({title: 'oResult', details: oResult});
                    bShowDepositImage = false;
                });

                let sHtml = '<span id="custbody_deposit_cod_image_fs_lbl_uir_label" class="smallgraytextnolink uir-label ">';
                sHtml += '    <span id="custbody_deposit_cod_image_fs_lbl" class="labelSpanEdit smallgraytextnolink" style="">';
                sHtml += '        <a tabindex="-1" title="What\'s this?" href="javascript:void(&quot;help&quot;)"'; 
                sHtml += '              style="cursor:help" onclick="return nlFieldHelp(\'Field Help\', \'custbody_deposit_cod_image\', this)"';
                sHtml += '              class="smallgraytextnolink" onmouseover="this.className=\'smallgraytext\'; return true;"'; 
                sHtml += '              onmouseout="this.className=\'smallgraytextnolink\'; ">Deposit/COD image</a>';
                sHtml += '</span>';
                sHtml += '</span>';
                

                log.debug({title: 'bShowDepositImage', details: bShowDepositImage});
                if (bShowDepositImage) {
                    sHtml += '<img src="/core/media/media.nl?id=982264&c=3862661_SB2&h=tevEyL01FPWn4qpRkPbiSsKE1-cdlcmttbScw9oKcG84sDy_&expurl=T" width="100">';
                }

                frmSO.getField({
                    id: FLD_DEPOSIT_IMAGE
                }).defaultValue = sHtml;
            } catch (ex) { 
                log.error({ title: 'Error in setting image', details: ex });
            }
        }
    }

    return {
        beforeLoad: beforeLoad
    };
    
});