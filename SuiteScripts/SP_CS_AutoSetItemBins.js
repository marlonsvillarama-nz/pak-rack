/**
 * @NApiVersion         2.1
 * @NScriptType         ClientScript
 */

define(
    [
        'N/url'
    ],
    (
        nsUrl
    ) => {
        const pageInit = (context) => {
            let thisRecord = context.currentRecord;
            autoSetItemBins({ record: thisRecord, mode: context.mode });
        };

        const autoSetItemBins = (options) => {
            console.log(`autoSetItemBins`, `mode = ${options.mode}`);
            if (!['copy', 'create'].includes(options.mode)) {
                return;
            }

            Ext.getBody().mask('Retrieving bin data...');

            let thisRecord = options.record;
            let urlBackend = nsUrl.resolveScript({
                scriptId: 'customscript_sl_auto_set_item_bins',
                deploymentId: 'customdeploy_sl_auto_set_item_bins'
            });
            console.log(`urlBackend`, urlBackend);

            let allPromises = [];
            let lineCount = thisRecord.getLineCount({ sublistId: 'item' });
            let itemList = [];
            for (let i = 0; i < lineCount; i++) {
                itemList.push(thisRecord.getSublistValue({ sublistId: 'item', fieldId: 'item', line: i }));
            }
            console.log(`itemList`, itemList);

            fetch(`${urlBackend}&action=getitembins&items=${itemList.join(',')}`)
                .then(response => response.json())
                .then(response => {
                    console.log('>>> fetch data', response);
                    if (response.status > 0) {
                        setItemBins({ record: thisRecord, data: response.data });
                    }
                    else {
                        alert(response.error);
                    }
                    Ext.getBody().unmask();
                });
        };

        const setItemBins = (options) => {
            let thisRecord = options.record;
            let binData = options.data;

            let lineCount = thisRecord.getLineCount({ sublistId: 'item' });
            for (let i = 0; i < lineCount; i++) {
                thisRecord.selectLine({ sublistId: 'item', line: i });
                let item = thisRecord.getCurrentSublistValue({ sublistId: 'item', fieldId: 'item' });
                let itemQuantity = thisRecord.getCurrentSublistValue({ sublistId: 'item', fieldId: 'quantity' });
                console.log(`item = ${item}, itemQuantity = ${itemQuantity}`);
                
                // let totalQuantityToSet = itemQuantity;
                let itemBins = binData.filter(bin => bin.item === item);
                console.log(`${title} itemBins`, itemBins);

                if (itemBins.length <= 0) {
                    continue;
                }

                let preferredBin = itemBins.filter(bin => bin.preferred === true);
                console.log(`${title} preferredBin`, preferredBin);

                let remainingBins = preferredBin.length > 0 ? itemBins.filter(bin => bin.number !== preferredBin[0].number) : itemBins;
                console.log(`${title} remainingBins`, remainingBins);
                
                let quantityToSet = 0;
                let binToSet = null;
                let inventoryDetail = thisRecord.getCurrentSublistSubrecord({ sublistId: 'item', fieldId: 'inventorydetail' });
                console.log(`inventoryDetail`, inventoryDetail);

                if (preferredBin.length) {
                    let availableQty = preferredBin[0].available;
                    quantityToSet = availableQty > itemQuantity ? itemQuantity : availableQty;
                    binToSet = preferredBin[0].number;
                    console.log(`${title} preferred bin`, `quantityToSet = ${quantityToSet}, binToSet = ${binToSet}`);

                    setInventoryDetailLine({ record: inventoryDetail, line: i, bin: binToSet, quantity: quantityToSet });
                }

                for (let j = 0, binCount = remainingBins.length; i < binCount; i++) {
                    let availableQty = remainingBins[i].available;
                    quantityToSet = availableQty > itemQuantity ? itemQuantity : availableQty;
                    binToSet = remainingBins[i].number;
                    console.log(`${title} remainingBin i=${i}`, `quantityToSet = ${quantityToSet}, binToSet = ${binToSet}`);

                    setInventoryDetailLine({ record: inventoryDetail, line: i, bin: binToSet, quantity: quantityToSet });
                }
            }
        };

        const setInventoryDetailLine = (options) => {
            options.record.selectNewLine({ sublistId: 'inventoryassignment' });
            options.record.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'binnumber', value: options.bin });
            options.record.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'quantity', value: options.quantity });
            options.record.commitLine({ sublistId: 'inventoryassignment' });
        };

        return {
            pageInit
        };
    }
);