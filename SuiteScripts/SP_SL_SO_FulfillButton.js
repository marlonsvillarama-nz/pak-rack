/**
 * @NApiVersion         2.1
 * @NScriptType         Suitelet
 */

define(
    [
        'N/log',
        'N/record',
        'N/search'
    ],
    (
        nsLog,
        nsRecord,
        nsSearch
    ) => {
        const MODULE_NAME = 'SL|SO Fulfill Button';

        const onRequest = ({ request, response }) => {
            let title = `${MODULE_NAME}.Request`;

            if (request.method.toLowerCase() !== 'get') {
                response.write({ output: buildError(`Invalid HTTP method ${request.method}.`) });
                return;
            }

            let params = request.parameters;
            if (!params.action) {
                response.write({ output: buildError('Missing required value: action.') });
                return;
            }

            if (!params.order) {
                response.write({ output: buildError('Missing required value: order ID.') });
                return;
            }

            let responseObject = { status: 0 };
            switch(params.action.toLowerCase()) {
                case 'fulfill': {
                    responseObject = fulfillOrder(params.order);
                    break;
                }
            }

            response.write({ output: JSON.stringify(responseObject) });
        };

        const fulfillOrder = (order) => {
            let title = `${MODULE_NAME}.FulfillOrder`;

            try {
                let itemFulfillment = nsRecord.transform({
                    fromType: 'salesorder',
                    fromId: order,
                    toType: 'itemfulfillment'
                });
    
                let itemList = [];
                for (let i = 0, ilen = itemFulfillment.getLineCount({ sublistId: 'item' }); i < ilen; i++) {
                    itemList.push(itemFulfillment.getSublistValue({ sublistId: 'item', fieldId: 'item', line: i }));
                }
                nsLog.debug({ title: `${title} itemList`, details: JSON.stringify(itemList) });
    
                let itemBins = getItemBins({ items: itemList });
                setItemBins({ record: itemFulfillment, data: itemBins });
    
                let itemFulfillmentId = itemFulfillment.save({ ignoreMandatoryFields: true });
                nsLog.debug({ title: title, details: `Created IF ${itemFulfillmentId}.` });

                return { status: 1, data: itemFulfillmentId };
            }
            catch (ex) {
                return buildError(ex.toString());
            }
        };

        const setItemBins = (options) => {
            let title = `${MODULE_NAME}.SetItemBins`;
            let thisRecord = options.record;
            let binData = options.data;
            nsLog.debug({ title: `${title} binData`, details: JSON.stringify(binData) });

            let lineCount = thisRecord.getLineCount({ sublistId: 'item' });
            for (let i = 0; i < lineCount; i++) {
                
                let item = thisRecord.getSublistValue({ sublistId: 'item', fieldId: 'item', line: i });
                let itemName = thisRecord.getSublistValue({ sublistId: 'item', fieldId: 'itemtype', line: i });
                
                // .selectLine({ sublistId: 'item', line: i });
                let itemQuantity = thisRecord.getSublistValue({ sublistId: 'item', fieldId: 'quantity', line: i });
                let totalQuantityToSet = itemQuantity;
                nsLog.debug({ title: title, details: `item = ${item}, itemName = ${itemName}, itemQuantity = ${itemQuantity}, totalQuantityToSet = ${totalQuantityToSet}` });

                let itemBins = binData.filter(bin => bin.item === item);
                nsLog.debug({ title: `${title} itemBins`, details: itemBins });

                if (itemBins.length <= 0) {
                    continue;
                }

                let preferredBin = itemBins[0].bins.filter(bin => bin.preferred === true);
                nsLog.debug({ title: `${title} preferredBin`, details: JSON.stringify(preferredBin) });

                let remainingBins = preferredBin.length > 0 ? itemBins[0].bins.filter(bin => bin.number !== preferredBin[0].number) : itemBins[0].bins;
                nsLog.debug({ title: `${title} remainingBins`, details: JSON.stringify(remainingBins) });
                
                let quantityToSet = 0;
                let binToSet = null;
                let inventoryDetail = thisRecord.getSublistSubrecord({ sublistId: 'item', fieldId: 'inventorydetail', line: i });

                nsLog.debug({ title: title, details: `BEFORE preferredBin totalQuantityToSet = ${totalQuantityToSet}` });
                if (preferredBin.length) {
                    let availableQty = preferredBin[0].available;
                    nsLog.debug({ title: title, details: `>>> availableQty = ${availableQty}, itemQuantity = ${itemQuantity}` });
                    quantityToSet = availableQty > itemQuantity ? itemQuantity : availableQty;
                    binToSet = preferredBin[0].number;
                    nsLog.debug({ title: `${title} preferred bin`, details: `quantityToSet = ${quantityToSet}, binToSet = ${binToSet}` });

                    setInventoryDetailLine({ record: inventoryDetail, line: 0, bin: binToSet, quantity: quantityToSet });
                    totalQuantityToSet -= quantityToSet;
                }
                nsLog.debug({ title: title, details: `AFTER preferredBin totalQuantityToSet = ${totalQuantityToSet}` });

                for (let j = 0, binCount = remainingBins.length; j < binCount; j++) {
                    nsLog.debug({ title: `${title} remainingBins j=${j}`, details: JSON.stringify(remainingBins[j]) });
                    nsLog.debug({ title: title, details: `BEFORE bin totalQuantityToSet = ${totalQuantityToSet}` });
                    if (totalQuantityToSet <= 0) {
                        break;
                    }
                    let availableQty = parseInt(remainingBins[j].available);
                    nsLog.debug({ title: title, details: `>>> availableQty = ${availableQty}, itemQuantity = ${itemQuantity}` });
                    quantityToSet = availableQty > itemQuantity ? itemQuantity : availableQty;
                    binToSet = remainingBins[j].number;
                    nsLog.debug({ title: `${title} remainingBin j=${j}`, details: `quantityToSet = ${quantityToSet}, binToSet = ${binToSet}` });

                    let line = preferredBin.length > 0 ? (j + 1) : j;
                    setInventoryDetailLine({ record: inventoryDetail, line: line, bin: binToSet, quantity: quantityToSet });
                    totalQuantityToSet -= quantityToSet;
                    nsLog.debug({ title: title, details: `AFTER bin totalQuantityToSet = ${totalQuantityToSet}` });
                }
            }
        };

        const setInventoryDetailLine = (options) => {
            let title = `${MODULE_NAME}.SetInvDetailsLine`;
            nsLog.debug({ title: title, details: `==>> Setting bin = ${options.bin}, quantity = ${options.quantity} on inventory detail line ${options.line}...` });
            options.record.setSublistText({ sublistId: 'inventoryassignment', fieldId: 'binnumber', text: options.bin, line: options.line });
            options.record.setSublistValue({ sublistId: 'inventoryassignment', fieldId: 'quantity', value: options.quantity, line: options.line });
            // options.record.selectNewLine({ sublistId: 'inventoryassignment' });
            // options.record.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'binnumber', value: options.bin });
            // options.record.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'quantity', value: options.quantity });
            // options.record.commitLine({ sublistId: 'inventoryassignment' });
        };

        const getItemBins = (options) => {
            let title = `${MODULE_NAME}.GetItemBins`;

            let items = options.items;
            if (!items) {
                return buildError('Missing required value: items.');
            }

            let itemList = options.items; //.split(',');
            nsLog.debug({ title: `${title} itemList`, details: JSON.stringify(itemList) });

            let itemBins = [];
            let itemBinSearch = buildItemBinSearch({ items: itemList });
            nsLog.debug({ title: `${title} itemBinSearch`, details: itemBinSearch.filterExpression });

            let itemBinResults = getAllResults({ search: buildItemBinSearch({ items: itemList }) });
            for (let i = 0, itemLength = itemList.length; i < itemLength; i++) {
                let itemBinRows = itemBinResults
                    .filter(result => result.id == itemList[i])
                    .map(result => {
                        return {
                            id: result.id,
                            item: result.getValue({ name: 'itemid' }),
                            number: result.getValue({ name: 'binnumber' }),
                            available: result.getValue({ name: 'binonhandavail' }),
                            preferred: result.getValue({ name: 'preferredbin' })
                        };
                    });
                nsLog.debug({ title: `${title} item = ${itemList[i]}`, details: JSON.stringify(itemBinRows) });
                itemBins.push({
                    item: itemList[i],
                    bins: itemBinRows
                });
            }
            nsLog.debug({ title: `${MODULE_NAME} itemBins`, details: JSON.stringify(itemBins) });

            return itemBins;
        };

        const buildItemBinSearch = (options) => {
            return nsSearch.create({
                type: 'item',
                filters: [
                    [ 'internalid', 'anyof', options.items ],
                    'AND',
                    [ 'binnumber', 'isnotempty', null ]
                ],
                columns: [
                    'itemid',
                    'binnumber',
                    'binonhandavail',
                    'preferredbin'
                ]
            });
        };

        const getAllResults = (options) => {
            let allResults = [];
            let results = [];
            let start = 0;
            let size = 1000;
            let end = size;

            do {
                results = options.search.run().getRange({ start: start, end: end });
                allResults = allResults.concat(results);
                start += size;
                end += size;
            } while (results.length >= size);

            return allResults;
        };

        const buildError = (msg) => {
            nsLog.error({ title: title, details: msg });
            return JSON.stringify({ status: -1, error: msg });
        };

        return {
            onRequest
        };
    }
);