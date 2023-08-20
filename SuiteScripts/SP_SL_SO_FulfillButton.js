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
                let itemLocations = {};
                let salesOrder = nsRecord.load({
                    type: 'salesorder',
                    id: order
                });
                let itemCount = salesOrder.getLineCount({ sublistId: 'item' });
                for (let i = 0; i < itemCount; i++) {
                    let location = salesOrder.getSublistValue({ sublistId: 'item', fieldId: 'location', line: i });
                    if (itemLocations[location]) {
                        itemLocations[location]++;
                    }
                    else {
                        itemLocations[location] = 1;
                    }
                }
                nsLog.debug({ title: `${title} itemLocations`, details: JSON.stringify(itemLocations) });
                
                let maxLocation = '';
                let maxCount = 0;
                for (const [key, value] of Object.entries(itemLocations)) {
                    if (value > maxCount) {
                        maxLocation = key;
                        maxCount = value;
                    }
                }

                let itemFulfillments = [];
                for (const location of Object.keys(itemLocations)) {
                    let idFulfillment = createLocationFulfillment({
                        order: order,
                        location: location,
                        defaultLocation: maxLocation
                    });
                    if (idFulfillment) {
                        itemFulfillments.push(idFulfillment);
                    }
                }

                return { status: 1, data: itemFulfillments };
            }
            catch (ex) {
                return buildError(ex.toString());
            }
        };

        const createLocationFulfillment = (options) => {
            let title = `${MODULE_NAME}.CreateLocationFulfillment`;
            nsLog.debug({ title: `${title} options`, details: JSON.stringify(options) });
            if (!options.location) {
                nsLog.debug({ title: title, details: `No location specified.` });
                return null;
            }
            
            let itemFulfillment = nsRecord.transform({
                fromType: 'salesorder',
                fromId: options.order,
                toType: 'itemfulfillment'
            });

            let lineCount = itemFulfillment.getLineCount({ sublistId: 'item' });
            nsLog.debug({ title: `${title} lineCount BEFORE`, details: lineCount });

            for (let i = lineCount - 1; i >= 0; i--) {
                let lineLocation = itemFulfillment.getSublistValue({ sublistId: 'item', fieldId: 'location', line: i });
                if (!lineLocation && options.location === options.defaultLocation) {
                    nsLog.debug({ title: title, details: `Setting location = ${options.defaultLocation} for line ${i}...` });
                    itemFulfillment.setSublistValue({ sublistId: 'item', fieldId: 'location', line: i, value: options.defaultLocation });
                }
                else if (options.location !== lineLocation) {
                    nsLog.debug({ title: title, details: `Unchecking line ${i}...` });
                    itemFulfillment.setSublistValue({ sublistId: 'item', fieldId: 'itemreceive', value: false, line: i });
                }
                else {
                    nsLog.debug({ title: title, details: `Line ${i} has location ${lineLocation}.` });
                }
            }
            
            lineCount = itemFulfillment.getLineCount({ sublistId: 'item' });
            nsLog.debug({ title: `${title} lineCount AFTER`, details: lineCount });
            if (lineCount <= 0) {
                return null;
            }

            let itemList = [];
            for (let i = 0, ilen = itemFulfillment.getLineCount({ sublistId: 'item' }); i < ilen; i++) {
            // for (let i = 0, ilen = 1; i < ilen; i++) {
                itemList.push(itemFulfillment.getSublistValue({ sublistId: 'item', fieldId: 'item', line: i }));
            }
            nsLog.debug({ title: `${title} itemList`, details: JSON.stringify(itemList) });

            let itemBins = getItemBins({ items: itemList });
            setItemBins({ record: itemFulfillment, data: itemBins, location: options.location });

            let itemFulfillmentId = itemFulfillment.save({ ignoreMandatoryFields: true });
            nsLog.debug({ title: title, details: `Created IF ${itemFulfillmentId}.` });
        };

        const setItemBins = (options) => {
            let title = `${MODULE_NAME}.SetItemBins`;
            let thisRecord = options.record;
            let binData = options.data;
            nsLog.debug({ title: `${title} binData`, details: JSON.stringify(binData) });

            let itemBinData = {};
            let lineCount = thisRecord.getLineCount({ sublistId: 'item' });
            for (let i = 0; i < lineCount; i++) {
                title = `${MODULE_NAME}.SetItemBins line = ${i}`;
                
                let item = thisRecord.getSublistValue({ sublistId: 'item', fieldId: 'item', line: i });
                let itemName = thisRecord.getSublistValue({ sublistId: 'item', fieldId: 'itemtype', line: i });

                let lineLocation = thisRecord.getSublistValue({ sublistId: 'item', fieldId: 'location', line: i });
                if (lineLocation != options.location) {
                    nsLog.debug({ title: `${title} line = ${i}`, details: `lineLocation (${lineLocation}) != options.location (${options.location})` });
                    continue;
                }
                
                let itemType = thisRecord.getSublistValue({ sublistId: 'item', fieldId: 'itemtype', line: i });
                if (itemType.toLowerCase() != 'invtpart') {
                    nsLog.debug({ title: title, details: `Item ID ${item} on line ${i} is not an inventory part.` });
                    continue;
                }

                let itemReceive = thisRecord.getSublistValue({ sublistId: 'item', fieldId: 'itemreceive', line: i });
                if (!itemReceive) {
                    nsLog.debug({ title: title, details: `Item ID ${item} on line ${i} is not marked for fulfillment.` });
                    continue;
                }

                let totalLineQuantitySet = 0;
                itemBinData[item] = itemBinData[item] || {};
                
                // .selectLine({ sublistId: 'item', line: i });
                let itemQuantity = thisRecord.getSublistValue({ sublistId: 'item', fieldId: 'quantity', line: i });
                let totalQuantityToSet = itemQuantity;
                nsLog.debug({ title: title, details: `item = ${item}, itemName = ${itemName}, itemQuantity = ${itemQuantity}, totalQuantityToSet = ${totalQuantityToSet}` });

                let itemBins = binData.find(bin => bin.item === item);
                nsLog.debug({ title: `${title} itemBins`, details: itemBins });
                if (!itemBins.length) {
                    nsLog.error({ title: title, details: `Item ID ${item} on line ${i} has no configured bins.` });
                    continue;
                }

                for (let j = 0, binCount = itemBins.bins.length; j < binCount; j++) {
                    let b = itemBins.bins[j];
                    itemBinData[item][b.number] = itemBinData[item][b.number] || { available: b.available };
                }
                nsLog.audit({ title: `${title} itemBinData`, details: JSON.stringify(itemBinData) });

                let preferredBin = itemBins.bins.filter(bin => bin.preferred === true);
                nsLog.debug({ title: `${title} preferredBin`, details: JSON.stringify(preferredBin) });

                let remainingBins = preferredBin.length > 0 ? itemBins.bins.filter(bin => bin.number !== preferredBin[0].number) : itemBins.bins;
                nsLog.debug({ title: `${title} remainingBins`, details: JSON.stringify(remainingBins) });
                
                let quantityToSet = 0;
                let binToSet = null;
                let inventoryDetail = thisRecord.getSublistSubrecord({ sublistId: 'item', fieldId: 'inventorydetail', line: i });

                for (let j = inventoryDetail.getLineCount({ sublistId: 'inventoryassignment' }) - 1; j >= 0; j--) {
                    inventoryDetail.removeLine({ sublistId: 'inventoryassignment' , line: j });
                }

                nsLog.debug({ title: title, details: `BEFORE preferredBin totalQuantityToSet = ${totalQuantityToSet}` });
                let invDetailIndex = 0;
                if (preferredBin.length) {
                    // let availableQty = preferredBin[0].available;
                    binToSet = preferredBin[0].number;

                    let availableQty = parseInt(itemBinData[item][binToSet].available);
                    nsLog.debug({ title: title, details: `>>> availableQty = ${availableQty}, itemQuantity = ${itemQuantity}` });

                    quantityToSet = availableQty > totalQuantityToSet ? totalQuantityToSet : availableQty;
                    nsLog.debug({ title: `${title} preferred bin`, details: `quantityToSet = ${quantityToSet}, binToSet = ${binToSet}` });

                    if (quantityToSet > 0) {
                        setInventoryDetailLine({ record: inventoryDetail, line: invDetailIndex, bin: binToSet, quantity: quantityToSet });
                        totalQuantityToSet -= quantityToSet;
                        itemBinData[item][binToSet].available -= quantityToSet;
                        nsLog.audit({ title: `${title} preferred bin itemBinData`, details: JSON.stringify(itemBinData) });

                        totalLineQuantitySet += quantityToSet;
                        invDetailIndex++;
                    }
                }
                nsLog.debug({ title: title, details: `AFTER preferredBin totalQuantityToSet = ${totalQuantityToSet}` });
                if (totalQuantityToSet <= 0) {
                    continue;
                }

                binLoop: for (let j = 0, binCount = remainingBins.length; j < binCount; j++) {
                    nsLog.debug({ title: `${title} remainingBins j=${j}`, details: JSON.stringify(remainingBins[j]) });
                    nsLog.debug({ title: title, details: `BEFORE bin totalQuantityToSet = ${totalQuantityToSet}` });
                    if (totalQuantityToSet <= 0) {
                        break binLoop;
                    }

                    binToSet = remainingBins[j].number;

                    // let availableQty = parseInt(remainingBins[j].available);
                    let availableQty = parseInt(itemBinData[item][binToSet].available);
                    nsLog.debug({ title: title, details: `>>> availableQty = ${availableQty}, itemQuantity = ${itemQuantity}` });

                    quantityToSet = availableQty > totalQuantityToSet ? totalQuantityToSet : availableQty;
                    nsLog.debug({ title: `${title} remainingBin j=${j}`, details: `quantityToSet = ${quantityToSet}, binToSet = ${binToSet}` });

                    if (quantityToSet > 0) {
                        // let line = preferredBin.length > 0 ? (invDetailIndex + 1) : invDetailIndex;
                        setInventoryDetailLine({ record: inventoryDetail, line: invDetailIndex, bin: binToSet, quantity: quantityToSet });
                        totalQuantityToSet -= quantityToSet;
                        nsLog.debug({ title: title, details: `AFTER bin totalQuantityToSet = ${totalQuantityToSet}` });

                        itemBinData[item][binToSet].available -= quantityToSet;
                        nsLog.audit({ title: `${title} remainingBin invDetailIndex=${invDetailIndex} itemBinData`, details: JSON.stringify(itemBinData) });

                        totalLineQuantitySet += quantityToSet;
                        invDetailIndex++;
                    }
                }

                nsLog.audit({ title: `${title} item = ${item} totalLineQuantitySet`, details: totalLineQuantitySet });
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
                            item: result.getValue({ name: 'itemid' }),
                            number: result.getValue({ name: 'binnumber' }),
                            available: result.getValue({ name: 'binonhandavail' }),
                            preferred: result.getValue({ name: 'preferredbin' })
                        };
                    }).sort((a, b) => {
                        if (a.number > b.number) {
                            return 1;
                        }
                        else if (a.number < b.number) {
                            return -1;
                        }
                        else { return 0; }
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
            let title = `${MODULE_NAME}.BuildError`;
            nsLog.error({ title: title, details: msg });
            return JSON.stringify({ status: -1, error: msg });
        };

        return {
            onRequest
        };
    }
);