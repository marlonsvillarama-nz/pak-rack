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
            console.log(`binData ==>`, binData);

            let lineCount = thisRecord.getLineCount({ sublistId: 'item' });
            let cr = nsCR.get();
            for (let i = 0; i < lineCount; i++) {
                
                let item = thisRecord.getSublistValue({ sublistId: 'item', fieldId: 'item', line: i });
                let itemName = thisRecord.getSublistValue({ sublistId: 'item', fieldId: 'itemtype', line: i });
                
                cr.selectLine({ sublistId: 'item', line: i });
                let itemQuantity = cr.getSublistValue({ sublistId: 'item', fieldId: 'quantity', line: i });
                let totalQuantityToSet = itemQuantity;
                console.log(`item = ${item}, itemName = ${itemName}, itemQuantity = ${itemQuantity}, totalQuantityToSet = ${totalQuantityToSet}`);

                let itemBins = binData.filter(bin => bin.item === item);
                console.log(`${title} itemBins`, itemBins);

                if (itemBins.length <= 0) {
                    continue;
                }

                let preferredBin = itemBins[0].bins.filter(bin => bin.preferred === true);
                console.log(`${title} preferredBin`, preferredBin);

                let remainingBins = preferredBin.length > 0 ? itemBins[0].bins.filter(bin => bin.number !== preferredBin[0].number) : itemBins[0].bins;
                console.log(`${title} remainingBins`, remainingBins);
                
                let quantityToSet = 0;
                let binToSet = null;
                let inventoryDetail = thisRecord.getCurrentSublistSubrecord({ sublistId: 'item', fieldId: 'inventorydetail' });
                console.log(`inventoryDetail`, inventoryDetail);

                if (preferredBin.length) {
                    let availableQty = preferredBin[0].available;
                    console.log(`>>> availableQty = ${availableQty}, itemQuantity = ${itemQuantity}`);
                    quantityToSet = availableQty > itemQuantity ? itemQuantity : availableQty;
                    binToSet = preferredBin[0].number;
                    console.log(`${title} preferred bin`, `quantityToSet = ${quantityToSet}, binToSet = ${binToSet}`);

                    setInventoryDetailLine({ record: inventoryDetail, line: i, bin: binToSet, quantity: quantityToSet });
                    totalQuantityToSet -= quantityToSet;
                }

                for (let j = 0, binCount = remainingBins.length; j < binCount; j++) {
                    console.log(`remainingBins j=${j}`, remainingBins[j]);
                    if (totalQuantityToSet <= 0) {
                        break;
                    }
                    let availableQty = parseInt(remainingBins[j].available);
                    console.log(`>>> availableQty = ${availableQty}, itemQuantity = ${itemQuantity}`);
                    quantityToSet = availableQty > itemQuantity ? itemQuantity : availableQty;
                    binToSet = remainingBins[j].number;
                    console.log(`${title} remainingBin j=${j}`, `quantityToSet = ${quantityToSet}, binToSet = ${binToSet}`);

                    setInventoryDetailLine({ record: inventoryDetail, line: i, bin: binToSet, quantity: quantityToSet });
                    totalQuantityToSet -= quantityToSet;
                }
            }
        };

        const setInventoryDetailLine = (options) => {
            // options.record.setSublistValue({ sublistId: 'inventoryassignment', fieldId: 'binnumber', value: options.bin, line: options.line });
            // options.record.setSublistValue({ sublistId: 'inventoryassignment', fieldId: 'quantity', value: options.quantity, line: options.line });
            console.log(`==>> Setting bin = ${options.bin}, quantity = ${options.quantity} on inventory detail line ${options.line}...`);
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