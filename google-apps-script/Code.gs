/**
 * الحوت — Google Apps Script backend
 *
 * انشره كتطبيق ويب "Execute as me"، وضع SHEETS_API_SECRET في Script Properties.
 * لا تشغّل upgradeSheets() قبل أخذ نسخة مستقلة من الملف ومراجعة تقرير dry run.
 */

var SHEETS = {
  settings: {
    legacy: ['id', 'system_name', 'capital', 'default_profit_percent'],
    added: ['default_installment_type', 'receipt_footer', 'updated_at']
  },
  customers: {
    legacy: ['id', 'name', 'phone', 'notes', 'created_at'],
    added: ['address', 'archived', 'updated_at']
  },
  contracts: {
    legacy: [
      'id', 'customer_id', 'principal', 'profit_percent', 'profit_amount',
      'contract_total', 'installments', 'installment_value', 'delivery_date',
      'first_due_date', 'expected_end_date', 'guarantor_name', 'guarantor_phone',
      'notes'
    ],
    added: [
      'paid_amount', 'remaining_amount', 'current_installment_paid',
      'current_installment_remaining', 'next_due_date', 'status', 'archived',
      'created_at', 'updated_at', 'manual_reminder_date', 'reminder_mode'
    ]
  },
  payments: {
    legacy: ['id', 'customer_id', 'amount', 'payment_date', 'notes', 'created_at'],
    added: [
      'contract_id', 'request_id', 'receipt_number', 'status', 'cancellation_reason',
      'cancelled_at', 'paid_after', 'remaining_after', 'updated_at',
      'edited_at', 'edit_reason'
    ]
  }
};

function doGet() {
  return json_({
    ok: true,
    service: 'alhout-sheets',
    status: 'healthy',
    time: new Date().toISOString()
  });
}

function doPost(event) {
  var trackingId = Utilities.getUuid();
  try {
    var body = JSON.parse((event && event.postData && event.postData.contents) || '{}');
    if (!validSecret_(body.secret)) {
      return json_({
        ok: false,
        status: 401,
        code: 'UNAUTHORIZED',
        message: 'غير مصرح بتنفيذ العملية',
        tracking_id: trackingId
      });
    }
    return dispatch_(body.action, body.data || {}, trackingId);
  } catch (error) {
    console.error(JSON.stringify({
      tracking_id: trackingId,
      error_name: error && error.name ? error.name : 'Error'
    }));
    return json_({
      ok: false,
      status: 500,
      code: 'INTERNAL_ERROR',
      message: 'تعذر إكمال العملية',
      tracking_id: trackingId
    });
  }
}

function dispatch_(action, data, trackingId) {
  var reads = {
    dashboard: getDashboard_,
    settings: getSettings_,
    customers: listCustomers_,
    contracts: listContracts_,
    payments: listPayments_,
    reports_summary: function () { return reportsSummary_(data); }
  };
  if (reads[action]) return json_({ ok: true, data: reads[action](), status: 200 });

  var mutations = {
    add_customer: addCustomer_,
    update_customer: updateCustomer_,
    archive_customer: archiveCustomer_,
    restore_customer: restoreCustomer_,
    delete_customer_permanently: permanentlyDeleteCustomer_,
    add_contract: addContract_,
    update_contract: updateContract_,
    archive_contract: archiveContract_,
    restore_contract: restoreContract_,
    set_manual_reminder_date: setManualReminderDate_,
    clear_manual_reminder_date: clearManualReminderDate_,
    add_payment: addPayment_,
    update_payment: updatePayment_,
    cancel_payment: cancelPayment_,
    update_settings: updateSettings_,
    // توافق انتقالي: delete_customer القديم يبقى أرشفة، والحذف النهائي له Action صريح.
    delete_customer: archiveCustomer_,
    delete_payment: cancelPaymentLegacy_
  };
  if (!mutations[action]) {
    return json_({ ok: false, status: 400, code: 'UNKNOWN_ACTION', message: 'الإجراء غير معروف' });
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) {
    return json_({ ok: false, status: 409, code: 'BUSY', message: 'النظام مشغول، حاول مرة أخرى' });
  }
  try {
    return json_({ ok: true, status: 200, data: mutations[action](data) });
  } catch (error) {
    console.error(JSON.stringify({
      tracking_id: trackingId,
      action: action,
      error_name: error && error.name ? error.name : 'ValidationError'
    }));
    return json_({
      ok: false,
      status: 400,
      code: 'VALIDATION_ERROR',
      message: safeMessage_(error),
      tracking_id: trackingId
    });
  } finally {
    lock.releaseLock();
  }
}

function upgradeSheets(options) {
  options = options || {};
  var dryRun = options.dryRun !== false;
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var plan = [];

  Object.keys(SHEETS).forEach(function (name) {
    var sheet = spreadsheet.getSheetByName(name);
    var desired = SHEETS[name].legacy.concat(SHEETS[name].added);
    if (!sheet) {
      plan.push({ sheet: name, action: 'create', headers: desired });
      return;
    }
    var headers = readHeaders_(sheet);
    var missing = desired.filter(function (header) {
      return headers.indexOf(canonicalHeader_(header)) === -1;
    });
    plan.push({ sheet: name, action: missing.length ? 'append_headers' : 'none', headers: missing });
  });

  if (dryRun) {
    console.log(JSON.stringify(plan));
    return { ok: true, dry_run: true, plan: plan };
  }

  var material = plan.some(function (item) { return item.action !== 'none'; });
  var backupNames = [];
  if (material) {
    var stamp = Utilities.formatDate(new Date(), 'Asia/Baghdad', 'yyyyMMdd-HHmmss');
    Object.keys(SHEETS).forEach(function (name) {
      var original = spreadsheet.getSheetByName(name);
      if (original) {
        var backupName = uniqueSheetName_(spreadsheet, 'Backup_' + name + '_' + stamp);
        original.copyTo(spreadsheet).setName(backupName);
        backupNames.push(backupName);
      }
    });
  }

  plan.forEach(function (item) {
    if (item.action === 'create') {
      var created = spreadsheet.insertSheet(item.sheet);
      created.getRange(1, 1, 1, item.headers.length).setValues([item.headers]);
      created.setFrozenRows(1);
    } else if (item.action === 'append_headers') {
      var target = spreadsheet.getSheetByName(item.sheet);
      var start = Math.max(1, target.getLastColumn() + 1);
      target.getRange(1, start, 1, item.headers.length).setValues([item.headers]);
    }
  });

  var report = spreadsheet.getSheetByName('migration_report') || spreadsheet.insertSheet('migration_report');
  if (report.getLastRow() === 0) {
    report.appendRow(['run_at', 'timezone', 'backups', 'plan_json']);
  }
  report.appendRow([
    Utilities.formatDate(new Date(), 'Asia/Baghdad', "yyyy-MM-dd'T'HH:mm:ss"),
    'Asia/Baghdad',
    backupNames.join(', '),
    JSON.stringify(plan)
  ]);
  return { ok: true, dry_run: false, backups: backupNames, plan: plan };
}

function applySheetsUpgrade() {
  return upgradeSheets({ dryRun: false });
}

function getSettings_() {
  var table = readTable_('settings');
  var row = table.rows[0] || {};
  return {
    id: number_(row.id, 1),
    system_name: text_(row.system_name) || 'الحوت',
    capital: integer_(row.capital, 0),
    default_profit_percent: number_(row.default_profit_percent, 10),
    default_installment_type: frequency_(row.default_installment_type || 'monthly'),
    receipt_footer: text_(row.receipt_footer)
  };
}

function getDashboard_() {
  var payments = listPayments_();
  var paymentsByContract = indexPaymentsByContract_(payments);
  var customers = listCustomers_();
  var contracts = listContracts_(paymentsByContract);
  return {
    settings: getSettings_(),
    customers: customers,
    contracts: contracts,
    payments: payments,
    summary: dashboardSummary_(customers, contracts, payments)
  };
}

function dashboardSummary_(customers, contracts, payments) {
  var month = today_().slice(0, 7);
  var activePayments = payments.filter(function (payment) {
    return (text_(payment.status) || 'active') === 'active';
  });
  return {
    total_principal: contracts.reduce(function (sum, contract) { return sum + integer_(contract.principal, 0); }, 0),
    total_contract_value: contracts.reduce(function (sum, contract) { return sum + integer_(contract.contract_total, 0); }, 0),
    total_received: activePayments.reduce(function (sum, payment) { return sum + integer_(payment.amount, 0); }, 0),
    total_remaining: contracts.filter(function (contract) {
      return !truthy_(contract.archived) && text_(contract.status) !== 'مؤرشف' && text_(contract.status) !== 'مكتمل';
    }).reduce(function (sum, contract) { return sum + integer_(contract.remaining_amount, 0); }, 0),
    total_expected_profit: contracts.reduce(function (sum, contract) { return sum + integer_(contract.profit_amount, 0); }, 0),
    received_this_month: activePayments.filter(function (payment) {
      return dateText_(payment.payment_date).slice(0, 7) === month;
    }).reduce(function (sum, payment) { return sum + integer_(payment.amount, 0); }, 0),
    customers_count: customers.filter(function (customer) { return !truthy_(customer.archived); }).length,
    active_contracts_count: contracts.filter(function (contract) {
      return text_(contract.status) !== 'مكتمل' && text_(contract.status) !== 'مؤرشف';
    }).length,
    completed_contracts_count: contracts.filter(function (contract) { return text_(contract.status) === 'مكتمل'; }).length,
    overdue_contracts_count: contracts.filter(function (contract) { return text_(contract.status) === 'متأخر'; }).length
  };
}

function reportsSummary_(data) {
  var from = requireDate_(data.from, 'تاريخ بداية التقرير');
  var to = requireDate_(data.to, 'تاريخ نهاية التقرير');
  if (from > to) throw new Error('تاريخ بداية التقرير يجب ألا يتجاوز تاريخ النهاية');
  var payments = listPayments_();
  var paymentsByContract = indexPaymentsByContract_(payments);
  var contracts = listContracts_(paymentsByContract);
  var inRange = function (value) { var date = dateText_(value); return date >= from && date <= to; };
  var activePayments = payments.filter(function (payment) {
    return (text_(payment.status) || 'active') === 'active' && inRange(payment.payment_date);
  });
  var cancelledPayments = payments.filter(function (payment) {
    return text_(payment.status) === 'cancelled' && inRange(payment.payment_date);
  });
  var newContracts = contracts.filter(function (contract) { return inRange(contract.delivery_date); });
  var completed = contracts.filter(function (contract) {
    if (text_(contract.status) !== 'مكتمل') return false;
    var rows = paymentsByContract[number_(contract.id, 0)] || [];
    var completionDate = rows.filter(function (payment) {
      return (text_(payment.status) || 'active') === 'active';
    }).reduce(function (latest, payment) {
      var date = dateText_(payment.payment_date);
      return date > latest ? date : latest;
    }, '');
    return inRange(completionDate);
  });
  return {
    from: from,
    to: to,
    received_amount: activePayments.reduce(function (sum, payment) { return sum + integer_(payment.amount, 0); }, 0),
    payments_count: activePayments.length,
    cancelled_payments_amount: cancelledPayments.reduce(function (sum, payment) { return sum + integer_(payment.amount, 0); }, 0),
    cancelled_payments_count: cancelledPayments.length,
    new_contracts_count: newContracts.length,
    new_contracts_principal: newContracts.reduce(function (sum, contract) { return sum + integer_(contract.principal, 0); }, 0),
    new_contracts_total: newContracts.reduce(function (sum, contract) { return sum + integer_(contract.contract_total, 0); }, 0),
    new_contracts_profit: newContracts.reduce(function (sum, contract) { return sum + integer_(contract.profit_amount, 0); }, 0),
    completed_contracts_count: completed.length
  };
}

function listCustomers_() {
  var table = readTable_('customers');
  return table.rows.filter(function (row) { return row.id !== ''; }).map(function (row) {
    return normalizeCustomerRow_(row);
  });
}

function listContracts_(paymentsByContract) {
  var table = readTable_('contracts');
  paymentsByContract = paymentsByContract || indexPaymentsByContract_(listPayments_());
  return table.rows.filter(function (row) { return row.id !== ''; }).map(function (row) {
    return enrichContract_(row, paymentsByContract[number_(row.id, 0)] || []);
  });
}

function listPayments_() {
  var table = readTable_('payments');
  return table.rows.filter(function (row) { return row.id !== ''; }).map(function (row) {
    row.id = number_(row.id, 0);
    row.customer_id = number_(row.customer_id, 0);
    row.contract_id = number_(row.contract_id, 0);
    row.amount = integer_(row.amount, 0);
    row.paid_after = integer_(row.paid_after, 0);
    row.remaining_after = integer_(row.remaining_after, 0);
    row.status = text_(row.status) || 'active';
    row.payment_date = dateText_(row.payment_date);
    row.created_at = dateTimeText_(row.created_at);
    row.cancelled_at = dateTimeText_(row.cancelled_at);
    row.edited_at = dateTimeText_(row.edited_at);
    row.edit_reason = text_(row.edit_reason);
    return row;
  });
}

function indexPaymentsByContract_(payments) {
  return payments.reduce(function (index, payment) {
    var contractId = number_(payment.contract_id, 0);
    if (!contractId) return index;
    if (!index[contractId]) index[contractId] = [];
    index[contractId].push(payment);
    return index;
  }, Object.create(null));
}

function addCustomer_(data) {
  requireText_(data.name, 'اسم العميل مطلوب');
  var id = nextNumericId_('customers', 'CUSTOMER_SEQUENCE');
  var now = now_();
  var row = {
    id: id,
    name: text_(data.name),
    phone: text_(data.phone),
    notes: text_(data.notes),
    created_at: now,
    address: text_(data.address),
    archived: false,
    updated_at: now
  };
  appendObject_('customers', row);
  return row;
}

function updateCustomer_(data) {
  var customerId = positiveInteger_(data.customer_id || data.id, 'معرف العميل');
  var table = readTable_('customers');
  var found = findById_(table, customerId);
  if (!found) throw new Error('العميل غير موجود');
  if (truthy_(found.object.archived)) throw new Error('استرجع العميل من الأرشيف قبل تعديله');

  ['name', 'phone', 'address', 'notes'].forEach(function (key) {
    if (data[key] !== undefined) found.object[key] = text_(data[key]);
  });
  if (!found.object.name) throw new Error('اسم العميل مطلوب');
  found.object.updated_at = now_();
  writeObjectRow_(table, found.rowNumber, found.object);
  return normalizeCustomerRow_(found.object);
}

function archiveCustomer_(data) {
  var customerId = positiveInteger_(data.customer_id || data.id, 'معرف العميل');
  return setArchived_(customerId, true);
}

function restoreCustomer_(data) {
  var customerId = positiveInteger_(data.customer_id || data.id, 'معرف العميل');
  return setArchived_(customerId, false);
}

function permanentlyDeleteCustomer_(data) {
  var customerId = positiveInteger_(data.customer_id || data.id, 'معرف العميل');
  var customerTable = readTable_('customers');
  var customer = findById_(customerTable, customerId);
  if (!customer) throw new Error('العميل غير موجود');

  var contractTable = readTable_('contracts');
  var paymentTable = readTable_('payments');
  var contractIds = Object.create(null);
  var contractRows = [];
  contractTable.rows.forEach(function (contract, index) {
    if (number_(contract.customer_id, 0) !== customerId) return;
    contractIds[number_(contract.id, 0)] = true;
    contractRows.push(index + 2);
  });
  var paymentRows = [];
  paymentTable.rows.forEach(function (payment, index) {
    var directCustomerMatch = number_(payment.customer_id, 0) === customerId;
    var contractMatch = contractIds[number_(payment.contract_id, 0)] === true;
    if (directCustomerMatch || contractMatch) paymentRows.push(index + 2);
  });

  // حذف الأبناء أولاً يمنع ترك مراجع يتيمة حتى إذا تعثرت خطوة لاحقة.
  deleteRowsDescending_(paymentTable.sheet, paymentRows);
  deleteRowsDescending_(contractTable.sheet, contractRows);
  customerTable.sheet.deleteRow(customer.rowNumber);
  return {
    customer_id: customerId,
    deleted_customers: 1,
    deleted_contracts: contractRows.length,
    deleted_payments: paymentRows.length
  };
}

function deleteRowsDescending_(sheet, rowNumbers) {
  rowNumbers.slice().sort(function (a, b) { return b - a; }).forEach(function (rowNumber) {
    sheet.deleteRow(rowNumber);
  });
}

function setArchived_(customerId, archived) {
  var table = readTable_('customers');
  var found = findById_(table, customerId);
  if (!found) throw new Error('العميل غير موجود');
  found.object.archived = archived;
  found.object.updated_at = now_();
  writeObjectRow_(table, found.rowNumber, found.object);
  return normalizeCustomerRow_(found.object);
}

function normalizeCustomerRow_(row) {
  return {
    id: number_(row.id, 0),
    name: text_(row.name),
    phone: text_(row.phone),
    address: text_(row.address),
    notes: text_(row.notes),
    archived: truthy_(row.archived),
    created_at: dateTimeText_(row.created_at),
    updated_at: dateTimeText_(row.updated_at)
  };
}

function addContract_(data) {
  var customerId = positiveInteger_(data.customer_id, 'معرف العميل');
  var customer = findById_(readTable_('customers'), customerId);
  if (!customer) throw new Error('العميل غير موجود');
  if (truthy_(customer.object.archived)) throw new Error('لا يمكن إضافة عقد لعميل مؤرشف');

  var principal = positiveInteger_(data.principal, 'أصل المبلغ');
  var profitPercent = nonNegativeNumber_(data.profit_percent, 'نسبة الربح');
  var installments = positiveInteger_(data.installments, 'عدد الأقساط');
  var deliveryDate = requireDate_(data.delivery_date, 'تاريخ تسليم المبلغ');
  var firstDueDate = requireDate_(data.first_due_date, 'تاريخ أول استحقاق');
  var calculated = contract_(principal, profitPercent, installments);
  var now = now_();
  var row = {
    id: nextNumericId_('contracts', 'CONTRACT_SEQUENCE'),
    customer_id: customerId,
    principal: principal,
    profit_percent: profitPercent,
    profit_amount: calculated.profit,
    contract_total: calculated.total,
    installments: installments,
    installment_value: calculated.parts[0],
    delivery_date: deliveryDate,
    first_due_date: firstDueDate,
    expected_end_date: dueDate_(firstDueDate, installments - 1, 'monthly'),
    guarantor_name: text_(data.guarantor_name),
    guarantor_phone: text_(data.guarantor_phone),
    notes: text_(data.notes),
    paid_amount: 0,
    remaining_amount: calculated.total,
    current_installment_paid: 0,
    current_installment_remaining: calculated.parts[0],
    next_due_date: firstDueDate,
    status: 'منتظم',
    archived: false,
    created_at: now,
    updated_at: now,
    manual_reminder_date: '',
    reminder_mode: 'automatic'
  };
  row = enrichContract_(row, []);
  appendObject_('contracts', row);
  return row;
}

function updateContract_(data) {
  var contractId = positiveInteger_(data.contract_id || data.id, 'معرف العقد');
  var table = readTable_('contracts');
  var found = findById_(table, contractId);
  if (!found) throw new Error('العقد غير موجود');
  if (truthy_(found.object.archived)) throw new Error('استرجع العقد من الأرشيف قبل تعديله');

  ['guarantor_name', 'guarantor_phone', 'notes'].forEach(function (key) {
    if (data[key] !== undefined) found.object[key] = text_(data[key]);
  });
  if (data.principal !== undefined) found.object.principal = positiveInteger_(data.principal, 'أصل المبلغ');
  if (data.profit_percent !== undefined) found.object.profit_percent = nonNegativeNumber_(data.profit_percent, 'نسبة الربح');
  if (data.installments !== undefined) found.object.installments = positiveInteger_(data.installments, 'عدد الأقساط');
  if (hasDateValue_(data.delivery_date)) found.object.delivery_date = requireDate_(data.delivery_date, 'تاريخ تسليم المبلغ');
  if (hasDateValue_(data.first_due_date)) found.object.first_due_date = requireDate_(data.first_due_date, 'تاريخ أول استحقاق');

  var calculated = contract_(found.object.principal, found.object.profit_percent, found.object.installments);
  var payments = indexPaymentsByContract_(listPayments_())[contractId] || [];
  var alreadyPaid = activePaidTotal_(payments);
  if (calculated.total < alreadyPaid) throw new Error('إجمالي العقد الجديد أصغر من المبلغ المدفوع');
  found.object.updated_at = now_();
  var enriched = enrichContract_(found.object, payments);
  writeObjectRow_(table, found.rowNumber, enriched);
  return enriched;
}

function archiveContract_(data) {
  return setContractArchived_(positiveInteger_(data.contract_id || data.id, 'معرف العقد'), true);
}

function restoreContract_(data) {
  return setContractArchived_(positiveInteger_(data.contract_id || data.id, 'معرف العقد'), false);
}

function setManualReminderDate_(data) {
  return changeManualReminderDate_(data, requireDate_(data.manual_reminder_date, 'موعد التذكير'), 'manual');
}

function clearManualReminderDate_(data) {
  return changeManualReminderDate_(data, '', 'automatic');
}

function changeManualReminderDate_(data, reminderDate, reminderMode) {
  var contractId = positiveInteger_(data.contract_id || data.id, 'معرف العقد');
  var table = readTable_('contracts');
  var found = findById_(table, contractId);
  if (!found) throw new Error('العقد غير موجود');
  found.object.manual_reminder_date = reminderDate;
  found.object.reminder_mode = reminderMode;
  found.object.updated_at = now_();
  writeObjectRow_(table, found.rowNumber, found.object);
  var payments = indexPaymentsByContract_(listPayments_())[contractId] || [];
  return enrichContract_(found.object, payments);
}

function setContractArchived_(contractId, archived) {
  var table = readTable_('contracts');
  var found = findById_(table, contractId);
  if (!found) throw new Error('العقد غير موجود');
  found.object.archived = archived;
  found.object.updated_at = now_();
  var payments = indexPaymentsByContract_(listPayments_())[contractId] || [];
  var enriched = enrichContract_(found.object, payments);
  writeObjectRow_(table, found.rowNumber, enriched);
  return enriched;
}

function addPayment_(data) {
  var contractId = positiveInteger_(data.contract_id, 'معرف العقد');
  // توافق انتقالي: الواجهة الجديدة ترسل request_id دائماً؛ القديمة تحصل على معرف فريد.
  var requestId = text_(data.request_id) || 'legacy-' + Utilities.getUuid();
  var paymentTable = readTable_('payments');
  var duplicate = paymentTable.rows.filter(function (row) {
    return text_(row.request_id) === requestId;
  })[0];
  if (duplicate) return duplicate; // idempotent: أعد نفس النتيجة ولا تضف صفاً.

  var contractTable = readTable_('contracts');
  var contract = findById_(contractTable, contractId);
  if (!contract) throw new Error('العقد غير موجود');
  var customerId = positiveInteger_(contract.object.customer_id, 'معرف العميل');
  if (data.customer_id !== undefined && number_(data.customer_id, 0) !== customerId) {
    throw new Error('العقد لا يعود إلى العميل المحدد');
  }
  var customer = findById_(readTable_('customers'), customerId);
  if (!customer) throw new Error('العميل غير موجود');
  if (truthy_(customer.object.archived)) throw new Error('لا يمكن الدفع لعميل مؤرشف');
  if (truthy_(contract.object.archived)) throw new Error('لا يمكن الدفع لعقد مؤرشف');

  var amount = positiveInteger_(data.amount, 'مبلغ الدفعة');
  var contractPayments = indexPaymentsByContract_(listPayments_())[contractId] || [];
  var current = enrichContract_(contract.object, contractPayments);
  if (current.status === 'مكتمل') throw new Error('العقد مكتمل');
  if (amount > current.remaining_amount) throw new Error('الدفعة أكبر من المبلغ المتبقي');

  var id = nextNumericId_('payments', 'PAYMENT_SEQUENCE');
  var createdAt = now_();
  var receipt = nextReceiptNumber_();
  var row = {
    id: id,
    customer_id: customerId,
    contract_id: contractId,
    amount: amount,
    payment_date: requireDate_(data.payment_date || today_(), 'تاريخ الدفع'),
    notes: text_(data.notes),
    created_at: createdAt,
    request_id: requestId,
    receipt_number: receipt,
    status: 'active',
    cancellation_reason: '',
    cancelled_at: '',
    edited_at: '',
    edit_reason: '',
    paid_after: current.paid_amount + amount,
    remaining_after: current.remaining_amount - amount,
    updated_at: createdAt
  };
  appendObject_('payments', row);
  rebuildPaymentSnapshots_(contractId, current.contract_total);
  var contractAfter = recalculateContract_(contractId);
  var saved = findById_(readTable_('payments'), id).object;
  saved.contract_after = contractAfter;
  return saved;
}

function updatePayment_(data) {
  var paymentId = positiveInteger_(data.payment_id || data.id, 'معرف الدفعة');
  var editReason = requireText_(data.edit_reason, 'سبب تعديل الدفعة مطلوب');
  var paymentTable = readTable_('payments');
  var found = findById_(paymentTable, paymentId);
  if (!found) throw new Error('الدفعة غير موجودة');
  if ((text_(found.object.status) || 'active') === 'cancelled') {
    throw new Error('لا يمكن تعديل دفعة ملغاة');
  }
  var contractId = positiveInteger_(found.object.contract_id, 'معرف العقد');
  var contractTable = readTable_('contracts');
  var contractFound = findById_(contractTable, contractId);
  if (!contractFound) throw new Error('العقد غير موجود');
  var calculated = contract_(
    positiveInteger_(contractFound.object.principal, 'أصل المبلغ'),
    nonNegativeNumber_(contractFound.object.profit_percent, 'نسبة الربح'),
    positiveInteger_(contractFound.object.installments, 'عدد الأقساط')
  );
  var newAmount = data.amount === undefined
    ? positiveInteger_(found.object.amount, 'مبلغ الدفعة')
    : positiveInteger_(data.amount, 'مبلغ الدفعة');
  var otherActiveTotal = paymentTable.rows.reduce(function (sum, payment) {
    if (number_(payment.contract_id, 0) !== contractId) return sum;
    if (number_(payment.id, 0) === paymentId) return sum;
    return (text_(payment.status) || 'active') === 'active'
      ? sum + positiveInteger_(payment.amount, 'مبلغ الدفعة')
      : sum;
  }, 0);
  if (otherActiveTotal + newAmount > calculated.total) {
    throw new Error('إجمالي الدفعات بعد التعديل أكبر من إجمالي العقد');
  }

  found.object.amount = newAmount;
  if (data.payment_date !== undefined) {
    found.object.payment_date = requireDate_(data.payment_date, 'تاريخ الدفع');
  }
  if (data.notes !== undefined) found.object.notes = text_(data.notes);
  found.object.edited_at = now_();
  found.object.edit_reason = editReason;
  found.object.updated_at = found.object.edited_at;
  writeObjectRow_(paymentTable, found.rowNumber, found.object);
  rebuildPaymentSnapshots_(contractId, calculated.total, paymentTable);
  var contractAfter = recalculateContract_(contractId);
  var saved = findById_(readTable_('payments'), paymentId).object;
  saved.contract_after = contractAfter;
  return saved;
}

function rebuildPaymentSnapshots_(contractId, contractTotal, paymentTable) {
  var table = paymentTable || readTable_('payments');
  var active = [];
  table.rows.forEach(function (payment, index) {
    if (number_(payment.contract_id, 0) !== contractId) return;
    if ((text_(payment.status) || 'active') !== 'active') return;
    active.push({ object: payment, rowNumber: index + 2 });
  });
  active.sort(function (a, b) {
    var byDate = dateText_(a.object.payment_date).localeCompare(dateText_(b.object.payment_date));
    if (byDate) return byDate;
    var byCreated = dateTimeText_(a.object.created_at).localeCompare(dateTimeText_(b.object.created_at));
    if (byCreated) return byCreated;
    return number_(a.object.id, 0) - number_(b.object.id, 0);
  });
  var runningPaid = 0;
  active.forEach(function (item) {
    runningPaid += positiveInteger_(item.object.amount, 'مبلغ الدفعة');
    item.object.paid_after = runningPaid;
    item.object.remaining_after = contractTotal - runningPaid;
    writeObjectRow_(table, item.rowNumber, item.object);
  });
}

function cancelPayment_(data) {
  var paymentId = positiveInteger_(data.payment_id || data.id, 'معرف الدفعة');
  var reason = requireText_(data.cancellation_reason, 'سبب الإلغاء مطلوب');
  var table = readTable_('payments');
  var found = findById_(table, paymentId);
  if (!found) throw new Error('الدفعة غير موجودة');
  if ((text_(found.object.status) || 'active') === 'cancelled') return found.object;
  found.object.status = 'cancelled';
  found.object.cancellation_reason = reason;
  found.object.cancelled_at = now_();
  found.object.updated_at = now_();
  writeObjectRow_(table, found.rowNumber, found.object);
  var contractId = positiveInteger_(found.object.contract_id, 'معرف العقد');
  var contractTable = readTable_('contracts');
  var contractFound = findById_(contractTable, contractId);
  if (!contractFound) throw new Error('العقد غير موجود');
  var calculated = contract_(
    positiveInteger_(contractFound.object.principal, 'أصل المبلغ'),
    nonNegativeNumber_(contractFound.object.profit_percent, 'نسبة الربح'),
    positiveInteger_(contractFound.object.installments, 'عدد الأقساط')
  );
  rebuildPaymentSnapshots_(contractId, calculated.total);
  recalculateContract_(contractId);
  return found.object;
}

function cancelPaymentLegacy_(data) {
  data = data || {};
  if (!data.cancellation_reason) data.cancellation_reason = 'إلغاء من واجهة قديمة';
  return cancelPayment_(data);
}

function updateSettings_(data) {
  var table = readTable_('settings');
  var row = table.rows[0] || { id: 1 };
  if (data.system_name !== undefined) row.system_name = requireText_(data.system_name, 'اسم النظام مطلوب');
  if (data.capital !== undefined) row.capital = nonNegativeInteger_(data.capital, 'رأس المال');
  if (data.default_profit_percent !== undefined) {
    row.default_profit_percent = nonNegativeNumber_(data.default_profit_percent, 'نسبة الربح');
  }
  if (data.default_installment_type !== undefined) {
    row.default_installment_type = frequency_(data.default_installment_type);
  }
  if (data.receipt_footer !== undefined) row.receipt_footer = text_(data.receipt_footer);
  row.updated_at = now_();
  if (table.rows.length) writeObjectRow_(table, 2, row);
  else appendObject_('settings', row);
  return getSettings_();
}

function recalculateContract_(contractId) {
  var table = readTable_('contracts');
  var found = findById_(table, contractId);
  if (!found) throw new Error('العقد غير موجود');
  var payments = indexPaymentsByContract_(listPayments_())[contractId] || [];
  var enriched = enrichContract_(found.object, payments);
  enriched.updated_at = now_();
  writeObjectRow_(table, found.rowNumber, enriched);
  return enriched;
}

function activePaidTotal_(payments) {
  return payments.reduce(function (sum, payment) {
    return (text_(payment.status) || 'active') === 'active'
      ? sum + positiveInteger_(payment.amount, 'مبلغ الدفعة')
      : sum;
  }, 0);
}

function enrichContract_(row, payments) {
  row.delivery_date = dateText_(row.delivery_date);
  row.first_due_date = dateText_(row.first_due_date);
  row.created_at = dateTimeText_(row.created_at);
  row.updated_at = dateTimeText_(row.updated_at);
  var principal = integer_(row.principal, 0);
  var profitPercent = number_(row.profit_percent, 0);
  var count = Math.max(1, integer_(row.installments, 1));
  var firstDue = dateText_(row.first_due_date);
  var scheduleFirstDue = firstDue || today_();
  var contract = contract_(principal, profitPercent, count);
  var paid = activePaidTotal_(payments);
  if (paid > contract.total) throw new Error('المبلغ المدفوع أكبر من إجمالي العقد');
  paid = Math.min(paid, contract.total);
  var allocation = allocate_(contract.parts, paid);
  var currentIndex = allocation.paidByInstallment.findIndex(function (value, index) {
    return value < contract.parts[index];
  });
  var archived = truthy_(row.archived) || text_(row.status) === 'مؤرشف';
  var nextDue = currentIndex === -1 ? '' : dueDate_(scheduleFirstDue, currentIndex, 'monthly');
  var status = archived ? 'مؤرشف' : currentIndex === -1 ? 'مكتمل' :
    nextDue < today_() ? 'متأخر' : nextDue === today_() ? 'مستحق اليوم' : 'منتظم';
  row.id = number_(row.id, 0);
  row.customer_id = number_(row.customer_id, 0);
  row.principal = principal;
  row.profit_percent = profitPercent;
  row.installments = count;
  row.profit_amount = contract.profit;
  row.contract_total = contract.total;
  row.first_due_date = firstDue;
  row.expected_end_date = dueDate_(scheduleFirstDue, count - 1, 'monthly');
  row.installment_value = contract.parts[0];
  row.paid_amount = paid;
  row.remaining_amount = contract.total - paid;
  row.current_installment_paid = currentIndex === -1 ? 0 : allocation.paidByInstallment[currentIndex];
  row.current_installment_remaining = currentIndex === -1 ? 0 :
    contract.parts[currentIndex] - allocation.paidByInstallment[currentIndex];
  row.next_due_date = nextDue;
  row.manual_reminder_date = dateText_(row.manual_reminder_date);
  var reminderMode = text_(row.reminder_mode).toLowerCase();
  row.reminder_mode = reminderMode === 'manual' || reminderMode === 'automatic'
    ? reminderMode
    : row.manual_reminder_date ? 'manual' : 'automatic';
  row.status = status;
  row.archived = archived;
  return row;
}

function contract_(principal, percent, count) {
  var basisPoints = Math.round(percent * 100);
  var profit = Math.round(principal * basisPoints / 10000);
  var total = principal + profit;
  if (!Number.isSafeInteger(profit) || !Number.isSafeInteger(total)) {
    throw new Error('القيم المالية غير صالحة');
  }
  var regular = Math.floor(total / count);
  var parts = [];
  for (var i = 0; i < count; i += 1) parts.push(i === count - 1 ? total - regular * (count - 1) : regular);
  return { profit: profit, total: total, parts: parts };
}

function allocate_(parts, paid) {
  var credit = paid;
  var values = parts.map(function (part) {
    var applied = Math.min(part, credit);
    credit -= applied;
    return applied;
  });
  return {
    paidByInstallment: values,
    completed: values.filter(function (value, index) { return value === parts[index]; }).length
  };
}

function dueDate_(firstDue, index, frequency) {
  var parts = firstDue.split('-').map(Number);
  var first = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  if (frequency === 'weekly') {
    first.setUTCDate(first.getUTCDate() + index * 7);
    return Utilities.formatDate(first, 'UTC', 'yyyy-MM-dd');
  }
  var absoluteMonth = first.getUTCFullYear() * 12 + first.getUTCMonth() + index;
  var year = Math.floor(absoluteMonth / 12);
  var month = absoluteMonth % 12;
  var lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return Utilities.formatDate(new Date(Date.UTC(year, month, Math.min(first.getUTCDate(), lastDay))), 'UTC', 'yyyy-MM-dd');
}

/**
 * يحول العنوان إلى مفتاح داخلي ثابت دون تعديل الخلية الأصلية.
 * يتعامل مع BOM وNBSP والمحارف صفرية العرض وعلامات الاتجاه وحالة الأحرف.
 */
function canonicalHeader_(header) {
  var value = header === null || header === undefined ? '' : String(header);
  if (value.normalize) value = value.normalize('NFKC');
  return value
    .replace(/[\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g, '')
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function inspectHeaders_(rawHeaders, sheetName) {
  var canonical = rawHeaders.map(canonicalHeader_);
  var firstPosition = Object.create(null);
  var duplicates = [];

  canonical.forEach(function (header, index) {
    if (!header) return;
    if (firstPosition[header] !== undefined) {
      duplicates.push({
        header: header,
        first: firstPosition[header] + 1,
        duplicate: index + 1
      });
      return;
    }
    firstPosition[header] = index;
  });

  if (duplicates.length) {
    var details = duplicates.map(function (item) {
      return '"' + item.header + '" في العمودين ' + item.first + ' و' + item.duplicate;
    }).join('؛ ');
    throw new Error(
      'عناوين مكررة بعد التطبيع في ورقة "' + sheetName + '": ' + details +
      '. أوقف الترقية وصحح العناوين المكررة يدوياً قبل المحاولة.'
    );
  }

  return { raw: rawHeaders, canonical: canonical };
}

function canonicalObject_(object) {
  var result = Object.create(null);
  Object.keys(object || {}).forEach(function (key) {
    var canonical = canonicalHeader_(key);
    if (canonical) result[canonical] = object[key];
  });
  return result;
}

function readTable_(name) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) throw new Error('الجدول ' + name + ' غير موجود. شغّل upgradeSheets أولاً');
  var values = sheet.getDataRange().getValues();
  var inspected = inspectHeaders_((values[0] || []).map(String), name);
  var headers = inspected.canonical;
  var rows = values.slice(1).map(function (valuesRow) {
    var object = {};
    headers.forEach(function (header, index) {
      if (header) object[header] = valuesRow[index];
    });
    return object;
  });
  return {
    sheet: sheet,
    headers: headers,
    rawHeaders: inspected.raw,
    rows: rows
  };
}

function readHeaders_(sheet) {
  if (sheet.getLastColumn() === 0) return [];
  var raw = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  return inspectHeaders_(raw, sheet.getName ? sheet.getName() : 'غير معروفة').canonical;
}

function appendObject_(name, object) {
  var table = readTable_(name);
  var canonicalObject = canonicalObject_(object);
  table.sheet.appendRow(table.headers.map(function (header) {
    return !header || canonicalObject[header] === undefined ? '' : canonicalObject[header];
  }));
}

function writeObjectRow_(table, rowNumber, object) {
  var canonicalObject = canonicalObject_(object);
  table.sheet.getRange(rowNumber, 1, 1, table.headers.length).setValues([
    table.headers.map(function (header) {
      return !header || canonicalObject[header] === undefined ? '' : canonicalObject[header];
    })
  ]);
}

function findById_(table, id) {
  for (var index = 0; index < table.rows.length; index += 1) {
    if (number_(table.rows[index].id, 0) === number_(id, -1)) {
      return { object: table.rows[index], rowNumber: index + 2 };
    }
  }
  return null;
}

function nextNumericId_(sheetName, propertyName) {
  var properties = PropertiesService.getScriptProperties();
  var stored = number_(properties.getProperty(propertyName), 0);
  var table = readTable_(sheetName);
  var maximum = table.rows.reduce(function (max, row) {
    return Math.max(max, number_(row.id, 0));
  }, 0);
  var next = Math.max(stored, maximum) + 1;
  properties.setProperty(propertyName, String(next));
  return next;
}

function nextReceiptNumber_() {
  var date = Utilities.formatDate(new Date(), 'Asia/Baghdad', 'yyyyMMdd');
  var key = 'RECEIPT_SEQUENCE_' + date;
  var properties = PropertiesService.getScriptProperties();
  var next = number_(properties.getProperty(key), 0) + 1;
  properties.setProperty(key, String(next));
  return 'R-' + date + '-' + String(next).padStart(4, '0');
}

function validSecret_(secret) {
  var expected = PropertiesService.getScriptProperties().getProperty('SHEETS_API_SECRET');
  if (!expected || !secret) return false;
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(secret))
    .join(',') === Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(expected)).join(',');
}

function safeMessage_(error) {
  var allowed = [
    'مطلوب', 'غير موجود', 'غير صالح', 'أكبر من', 'مؤرشف', 'استرجع العميل',
    'شغّل upgradeSheets'
  ];
  var message = error && error.message ? String(error.message) : '';
  return allowed.some(function (word) { return message.indexOf(word) !== -1; })
    ? message
    : 'تعذر التحقق من البيانات';
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

function text_(value) { return value === null || value === undefined ? '' : String(value).trim(); }
function number_(value, fallback) { var parsed = Number(value); return isFinite(parsed) ? parsed : fallback; }
function integer_(value, fallback) { var parsed = Math.round(number_(value, fallback)); return isFinite(parsed) ? parsed : fallback; }
function nonNegativeNumber_(value, label) { var parsed = number_(value, NaN); if (!isFinite(parsed) || parsed < 0) throw new Error(label + ' غير صالح'); return parsed; }
function positiveInteger_(value, label) { var parsed = number_(value, NaN); if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(label + ' غير صالح'); return parsed; }
function nonNegativeInteger_(value, label) { var parsed = number_(value, NaN); if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(label + ' غير صالح'); return parsed; }
function requireText_(value, message) { var parsed = text_(value); if (!parsed) throw new Error(message); return parsed; }
function frequency_(value) { var parsed = text_(value).toLowerCase(); if (parsed === 'weekly' || parsed === 'أسبوعي') return 'weekly'; if (parsed === 'monthly' || parsed === 'شهري' || !parsed) return 'monthly'; throw new Error('نوع الأقساط غير صالح'); }
function truthy_(value) { return value === true || String(value).toLowerCase() === 'true' || String(value) === '1'; }
function hasDateValue_(value) { return value !== undefined && value !== null && text_(value) !== ''; }
function today_() { return Utilities.formatDate(new Date(), 'Asia/Baghdad', 'yyyy-MM-dd'); }
function now_() { return Utilities.formatDate(new Date(), 'Asia/Baghdad', "yyyy-MM-dd'T'HH:mm:ss"); }
function validCalendarDate_(value) {
  var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  var year = Number(match[1]);
  var month = Number(match[2]);
  var day = Number(match[3]);
  var date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
}
function googleSerialDate_(value) {
  if (!isFinite(value) || value < 0 || value > 2958465) return '';
  var date = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000);
  return Utilities.formatDate(date, 'UTC', 'yyyy-MM-dd');
}
function dateText_(value) {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number') return googleSerialDate_(value);
  if (Object.prototype.toString.call(value) === '[object Date]') return Utilities.formatDate(value, 'Asia/Baghdad', 'yyyy-MM-dd');
  var text = String(value).trim();
  if (validCalendarDate_(text)) return text;
  var prefix = text.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(prefix) && !validCalendarDate_(prefix)) return '';
  var local = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?$/.exec(text);
  if (local) {
    return Number(local[2]) <= 23 && Number(local[3]) <= 59 && Number(local[4] || 0) <= 59
      ? local[1]
      : '';
  }
  var parsed = new Date(text);
  return isNaN(parsed.getTime()) ? '' : Utilities.formatDate(parsed, 'Asia/Baghdad', 'yyyy-MM-dd');
}
function dateTimeText_(value) {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number') return googleSerialDate_(value);
  if (Object.prototype.toString.call(value) === '[object Date]') return Utilities.formatDate(value, 'Asia/Baghdad', "yyyy-MM-dd'T'HH:mm:ss");
  var text = String(value).trim();
  if (validCalendarDate_(text)) return text;
  var prefix = text.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(prefix) && !validCalendarDate_(prefix)) return '';
  var local = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?$/.exec(text);
  if (local) {
    return Number(local[2]) <= 23 && Number(local[3]) <= 59 && Number(local[4] || 0) <= 59
      ? text.replace(' ', 'T')
      : '';
  }
  var parsed = new Date(text);
  return isNaN(parsed.getTime()) ? '' : Utilities.formatDate(parsed, 'Asia/Baghdad', "yyyy-MM-dd'T'HH:mm:ss");
}
function requireDate_(value, label) { var parsed = dateText_(value); if (!parsed) throw new Error(label + ' غير صالح'); return parsed; }
function uniqueSheetName_(spreadsheet, base) { var name = base; var index = 1; while (spreadsheet.getSheetByName(name)) { name = base + '_' + index; index += 1; } return name; }
