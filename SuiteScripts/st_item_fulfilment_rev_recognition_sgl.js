var CUSTOM_FIELDS = {
  SKIP_DEF_REV_REC: 'custbody_st_skip_deferred_rev_rec'
};

function customizeGlImpact(transactionRecord, standardLines, customLines, book) {
  log.debug('customizeGlImpact', '==START==');

  try {
    var record = {};

    var createdFrom = transactionRecord.getFieldValue('createdfrom');

    var salesOrderInfo = nlapiLookupField('transaction', createdFrom, ['trandate', 'type']);
    log.debug('salesOrderInfo', JSON.stringify(salesOrderInfo));

    if (salesOrderInfo.type != 'SalesOrd') return;

    // var transactionDate = transactionRecord.getFieldValue('trandate');
    var isValidDate = isValidDateOfTransaction(salesOrderInfo.trandate);
    log.debug('isValidDate', 'isValidDate ' + isValidDate);

    if (!isValidDate) return;

    record.isSkipDeferredRev = transactionRecord.getFieldValue(CUSTOM_FIELDS.SKIP_DEF_REV_REC);
    if (record.isSkipDeferredRev == 'T') return;

    record.createdFrom = transactionRecord.getFieldValue('createdfrom');

    if (isNullOrEmpty(record.createdFrom)) return;

    log.debug('record', JSON.stringify(record));

    var salesOrderInfo = getOrderDetails(record.createdFrom);

    if (isNullOrEmpty(salesOrderInfo)) return;

    log.debug('orderInfo', JSON.stringify(salesOrderInfo));

    // var itemFulfilmentLines = getItemFulfilmentInfo(transactionRecord.getFieldValue('id'));
    // log.debug('itemFulfilmentLines', JSON.stringify(itemFulfilmentLines));

    var count = transactionRecord.getLineItemCount('item');

    var keyedSoInfo = createArrayByKey(salesOrderInfo, 'soLineNo');
    log.debug('keyedSoInfo', JSON.stringify(keyedSoInfo));

    for (var i = 1; i <= count; i++) {
      var lineNo = transactionRecord.getLineItemValue('item', CUSTOM_COLUMNS.SALES_ORDER_LINE_NO, i);
      var isReceived = transactionRecord.getLineItemValue('item', 'itemreceive', i);

      log.debug('lineNo', lineNo + ' | isReceived ' + isReceived);

      if (isReceived == 'F') continue;

      var soLineInfo = keyedSoInfo[lineNo][0];
      log.debug('soLineInfo', JSON.stringify(soLineInfo));
      if (isNullOrEmpty(soLineInfo)) continue;

      var lineRate = parseFloat(soLineInfo.rate);
      var lineQty = transactionRecord.getLineItemValue('item', 'quantity', i);
      var itemAccount = soLineInfo.account;

      var amount = lineRate * lineQty;

      addNewCustomGLLine(customLines, amount, null, ACCOUNTS.DEFERRED_REV);
      addNewCustomGLLine(customLines, null, amount, itemAccount);
    }

  } catch (e) {
    var errorMessage = 'Error in customizeGlImpact';
    var err = '';
    if (e instanceof nlobjError) {
      err = e.getCode() + '\n' + e.getDetails();
    } else {
      err = e.toString();
    }
    log.error(errorMessage, err);
  }
  log.debug('customizeGlImpact', '==END==');
}

function getOrderDetails(orderId) {
  log.debug('getOrderDetails', 'START ' + orderId);

  var filters = [];
  filters.push(new nlobjSearchFilter('internalid', null, 'anyof', orderId));
  filters.push(new nlobjSearchFilter('mainline', null, 'is', 'F'));
  filters.push(new nlobjSearchFilter('taxline', null, 'is', 'F'));
  filters.push(new nlobjSearchFilter('shipping', null, 'is', 'F'));

  var columns = [];
  columns.push(new nlobjSearchColumn('tranid'));
  columns.push(new nlobjSearchColumn('item'));
  columns.push(new nlobjSearchColumn('quantity'));
  columns.push(new nlobjSearchColumn('rate'));
  columns.push(new nlobjSearchColumn('incomeaccount', 'item'));
  columns.push(new nlobjSearchColumn(CUSTOM_COLUMNS.SALES_ORDER_LINE_NO));

  var searchRec = nlapiSearchRecord('salesorder', null, filters, columns);

  // log.debug('salesorder searchRec', JSON.stringify(searchRec));

  if (searchRec == null) return;

  var result = searchRec.map(function(result) {
    return {
      id: result.id,
      soNo: result.getValue('tranid'),
      itemId: result.getValue('item'),
      itemName: result.getText('item'),
      quantity: result.getValue('quantity'),
      rate: nvl(result.getValue('rate'), 0),
      account: result.getValue('incomeaccount', 'item'),
      soLineNo: result.getValue(CUSTOM_COLUMNS.SALES_ORDER_LINE_NO)
    };
  });
  return result;

}

function getCreditLineAccount(standardLines) {
  log.debug('getCreditLineAccount', 'START');

  var creditLines = [];

  for (var i = 0; i < standardLines.getCount(); i++) {
    var currLine = standardLines.getLine(i);

    var amount = currLine.getCreditAmount();

    if (amount > 0) {

      var account = currLine.getAccountId();

      if (account != ACCOUNTS.GST_ACCOUNT) {
        creditLines.push({
          account: account,
          amount: Math.abs(currLine.getAmount()),
          subsidiary: currLine.getSubsidiaryId(),
          department: currLine.getDepartmentId(),
          class: currLine.getClassId(),
          memo: currLine.getMemo()
        });
      }

    }
  }
  return creditLines;
}

function addNewCustomGLLine(customLines, debitAmount, creditAmount, account, params) {

  log.audit('INFO addNewCustomGLLine ', 'account ' + account + ' | debitAmount ' + debitAmount + ' | creditAmount ' + creditAmount);

  var newLine = customLines.addNewLine();
  if (debitAmount > 0) {
    newLine.setDebitAmount(debitAmount);
  } else if (creditAmount > 0) {
    newLine.setCreditAmount(creditAmount);
  } else {
    return;
  }

  log.debug('set account', account);
  newLine.setAccountId(parseInt(account));
  if (!isNullOrEmpty(params)) {
    newLine.setClassId(params.class);
    newLine.setMemo(params.memo);
  }

  // newLine.setDepartmentId(params.department);
  // newLine.setLocationId(params.location);
  // newLine.setEntityId(parseInt(params.entity); // NEEDS T BE INT

}

function getItemFulfilmentInfo(itemFulfilmentId) {
  log.debug('getItemFulfilmentInfo', 'START ' + itemFulfilmentId);

  var filters = [];
  filters.push(new nlobjSearchFilter('internalid', null, 'anyof', itemFulfilmentId));
  filters.push(new nlobjSearchFilter('taxline', null, 'is', 'F'));
  filters.push(new nlobjSearchFilter('cogs', null, 'is', 'F'));
  filters.push(new nlobjSearchFilter('shipping', null, 'is', 'F'));

  var columns = [];
  columns.push(new nlobjSearchColumn('tranid'));
  columns.push(new nlobjSearchColumn('item'));
  columns.push(new nlobjSearchColumn('quantity'));
  columns.push(new nlobjSearchColumn(CUSTOM_COLUMNS.SALES_ORDER_LINE_NO));

  var searchRec = nlapiSearchRecord('itemfulfillment', null, filters, columns);

  // log.debug('itemfulfillment searchRec', JSON.stringify(searchRec));

  if (searchRec == null) return;

  var result = searchRec.map(function(result) {
    return {
      id: result.id,
      docNo: result.getValue('tranid'),
      itemId: result.getValue('item'),
      itemName: result.getText('item'),
      quantity: result.getValue('quantity'),
      soLineNo: result.getValue(CUSTOM_COLUMNS.SALES_ORDER_LINE_NO)
    };
  });
  return result;

}
