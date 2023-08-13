/**
 * @NApiVersion         2.1
 * @NScriptType         Suitelet
 */

define(
    [
        'N/log',
        'N/search'
    ],
    (
        nsLog,
        nsSearch
    ) => {
        const MODULE_NAME = 'SL|Auto Set Item Bins';

        const onRequest = ({ request, response }) => {
            let title = `${MODULE_NAME}.onRequest`;

            if (request.method.toLowerCase() !== 'get') {
                sendError(`Invalid method ${request.method}.`);
                return;
            }

            let params = request.parameters;
            if (!params.action) {
                sendError(`Missing required value: action.`);
                return;
            }

            let responseObject = { status: 0, message: 'No data.' };
            switch(params.action.toLowerCase()) {
                case 'getitembins': {
                    responseObject = getItemBins(params);
                    break;
                }
            }

            response.write({ output: JSON.stringify(responseObject) });
        };

        const getItemBins = (options) => {
            let title = `${MODULE_NAME}.GetItemBins`;

            let items = options.items;
            if (!items) {
                return buildError('Missing required value: items.');
            }

            let itemList = items.split(',');
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

            return { status: 1, data: itemBins };
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

        const buildError = (error) => {
            nsLog.error({ title: MODULE_NAME, details: error });
            return { status: -1, error: error };
        };

        const sendError = ({ response, error }) => {
            response.write({ output: JSON.stringify(buildError(error)) });
        };

        return {
            onRequest
        };
    }
);