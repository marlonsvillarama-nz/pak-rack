/**
 * @NApiVersion         2.1
 * @NScriptType         UserEventScript
 */

define(
    [
        'N/log',
        'N/runtime',
        'N/search'
    ],
    (
        nsLog,
        nsRuntime,
        nsSearch
    ) => {
        const MODULE_NAME = 'UE|Auto Set Item Bins';

        const beforeLoad = (context) => {
            let title = `${MODULE_NAME}.BeforeLoad`;

            autoSetItemBins(context);
        };

        const autoSetItemBins = (context) => {
            let title = `${MODULE_NAME}.AutoSetItemBins`;

            if (![context.UserEventType.CREATE].includes(context.type)) {
                nsLog.error({ title: title, details: `Invalid context ${context.type}.` });
                return;
            }

            let thisRecord = context.newRecord;
            let itemList = [];
            let lineCount = thisRecord.getLineCount({ sublistId: 'item' });

            for (let i = 0; i < lineCount; i++) {
                itemList.push(thisRecord.getSublistValue({
                    sublistId: 'item',
                    fieldId: 'item',
                    line: i
                }));
            }
            nsLog.debug({ title: `${title} itemList`, details: JSON.stringify(itemList) });

            let itemBins = getItemBins({ items: itemList });
            // if (!itemBins.length) {
            //     nsLog.error({ title: title, details: `No bins found for all items.` });
            //     return;
            // }

            setItemBins({
                record: thisRecord,
                bins: itemBins
            });
        };

        const setItemBins = (options) => {
            let title = `${MODULE_NAME}.SetItemBins`;

            let lineCount = options.record.getLineCount({ sublistId: 'item' });
            for (let i = 0; i < lineCount; i++) {
                let item = options.record.getSublistValue({ sublistId: 'item', fieldId: 'item', line: i });
                let itemQuantity = options.record.getSublistValue({ sublistId: 'item', fieldId: 'quantity', line: i });
                nsLog.debug({ title: title, details: `item = ${item}, itemQuantity = ${itemQuantity}` });
                
                // let totalQuantityToSet = itemQuantity;
                let itemBins = options.bins.filter(bin => bin.item === item);
                nsLog.debug({ title: `${title} itemBins`, details: JSON.stringify(itemBins) });

                let preferredBin = itemBins.filter(bin => bin.preferred === true);
                nsLog.debug({ title: `${title} preferredBin`, details: JSON.stringify(preferredBin) });

                let remainingBins = preferredBin.length > 0 ? itemBins.filter(bin => bin.number !== preferredBin[0].number) : itemBins;
                nsLog.debug({ title: `${title} remainingBins`, details: JSON.stringify(remainingBins) });
                
                let quantityToSet = 0;
                let binToSet = null;
                let inventoryDetail = options.record.getSublistSubrecord({ sublistId: 'item', fieldId: 'inventorydetail', line: i });
                if (preferredBin.length) {
                    let availableQty = preferredBin[0].available;
                    quantityToSet = availableQty > itemQuantity ? itemQuantity : availableQty;
                    // totalQuantityToSet -= quantityToSet;
                    binToSet = preferredBin[0].number;
                    nsLog.debug({ title: `${title} preferred bin`, details: `quantityToSet = ${quantityToSet}, binToSet = ${binToSet}` });

                    setInventoryDetailLine({ record: inventoryDetail, bin: binToSet, quantity: quantityToSet });
                }

                for (let j = 0, binCount = remainingBins.length; i < binCount; i++) {
                    let availableQty = remainingBins[i].available;
                    quantityToSet = availableQty > itemQuantity ? itemQuantity : availableQty;
                    // totalQuantityToSet -= quantityToSet;
                    binToSet = remainingBins[i].number;
                    nsLog.debug({ title: `${title} remainingBin i=${i}`, details: `quantityToSet = ${quantityToSet}, binToSet = ${binToSet}` });

                    setInventoryDetailLine({ record: inventoryDetail, bin: binToSet, quantity: quantityToSet });
                }
            }
        };

        const setInventoryDetailLine = (options) => {
            let title = `${MODULE_NAME}.SetInventoryDetailLine`;

            // let availableQty = options.bin.available;
            // let quantityToSet = availableQty > itemQuantity ? itemQuantity : availableQty;
            // totalQuantityToSet -= quantityToSet;
            // binToSet = preferredBin[0].number;

            options.record.selectLine({ sublistId: 'inventoryassignment' });
            options.record.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'binnumber', value: options.bin });
            options.record.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'quantity', value: options.quantity });
            options.record.commitLine({ sublistId: 'inventoryassignment' });
        };

        const getItemBins = (options) => {
            let title = `${MODULE_NAME}.GetItemBins`;
            let itemBins = [];
            if (!options.items?.length) {
                return itemBins;
            }

            let itemBinSearch = buildItemBinSearch({ items: options.items });
            nsLog.debug({ title: `${title} itemBinSearch`, details: itemBinSearch.filterExpression });

            let itemBinResults = getAllResults({ search: buildItemBinSearch({ items: options.items }) });
            for (let i = 0, itemLength = options.items.length; i < itemLength; i++) {
                let itemBinRows = itemBinResults
                    .filter(result => result.id == options.items[i])
                    .map(result => {
                        return {
                            number: result.getValue({ name: 'binnumber' }),
                            available: result.getValue({ name: 'binonhandavail' }),
                            preferred: result.getValue({ name: 'preferredbin' })
                        };
                    });
                nsLog.debug({ title: `${title} item = ${options.items[i]}`, details: JSON.stringify(itemBinRows) });
                itemBins.push({
                    item: options.items[i],
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

        return {
            beforeLoad
        };
    }
);