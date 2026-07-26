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
    legacy: [
      'id', 'name', 'phone', 'principal', 'profit_percent', 'installments',
      'paid_installments', 'start_date', 'notes', 'status', 'created_at'
    ],
    added: [
      'address', 'guarantor_name', 'guarantor_phone', 'profit_amount',
      'contract_total', 'installment_type', 'delivery_date', 'first_due_date',
      'expected_end_date', 'installment_value', 'paid_amount', 'remaining_amount',
      'current_installment_paid', 'current_installment_remaining', 'next_due_date',
      'archived', 'updated_at'
    ]
  },
  payments: {
    legacy: ['id', 'customer_id', 'amount', 'payment_date', 'notes', 'created_at'],
    added: [
      'request_id', 'receipt_number', 'status', 'cancellation_reason',
      'cancelled_at', 'updated_at'
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
    payments: listPayments_
  };
  if (reads[action]) return json_({ ok: true, data: reads[action](), status: 200 });

  var mutations = {
    add_customer: addCustomer_,
    update_customer: updateCustomer_,
    archive_customer: archiveCustomer_,
    restore_customer: restoreCustomer_,
    add_payment: addPayment_,
    cancel_payment: cancelPayment_,
    update_settings: updateSettings_,
    // توافق انتقالي: لا حذف نهائي.
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
  return {
    settings: getSettings_(),
    customers: listCustomers_(payments),
    payments: payments
  };
}

function listCustomers_(payments) {
  var table = readTable_('customers');
  payments = payments || listPayments_();
  return table.rows.filter(function (row) { return row.id !== ''; }).map(function (row) {
    return enrichCustomer_(row, payments);
  });
}

function listPayments_() {
  var table = readTable_('payments');
  return table.rows.filter(function (row) { return row.id !== ''; }).map(function (row) {
    row.id = number_(row.id, 0);
    row.customer_id = number_(row.customer_id, 0);
    row.amount = integer_(row.amount, 0);
    row.status = text_(row.status) || 'active';
    row.payment_date = dateText_(row.payment_date);
    row.created_at = dateTimeText_(row.created_at);
    row.cancelled_at = dateTimeText_(row.cancelled_at);
    return row;
  });
}

function addCustomer_(data) {
  requireText_(data.name, 'اسم العميل مطلوب');
  requireText_(data.phone, 'رقم الهاتف مطلوب');
  var principal = positiveInteger_(data.principal, 'أصل المبلغ');
  var profitPercent = nonNegativeNumber_(data.profit_percent, 'نسبة الربح');
  var installments = positiveInteger_(data.installments, 'عدد الأقساط');
  var firstDueDate = requireDate_(data.first_due_date || data.start_date, 'تاريخ أول استحقاق');
  var frequency = frequency_(data.installment_type || 'monthly');
  var contract = contract_(principal, profitPercent, installments);
  var id = nextNumericId_('customers', 'CUSTOMER_SEQUENCE');
  var now = now_();
  var row = {
    id: id,
    name: text_(data.name),
    phone: text_(data.phone),
    principal: principal,
    profit_percent: profitPercent,
    installments: installments,
    paid_installments: 0,
    start_date: dateText_(data.delivery_date || data.start_date || firstDueDate),
    notes: text_(data.notes),
    status: 'منتظم',
    created_at: now,
    address: text_(data.address),
    guarantor_name: text_(data.guarantor_name),
    guarantor_phone: text_(data.guarantor_phone),
    profit_amount: contract.profit,
    contract_total: contract.total,
    installment_type: frequency,
    delivery_date: dateText_(data.delivery_date || data.start_date || firstDueDate),
    first_due_date: firstDueDate,
    expected_end_date: dueDate_(firstDueDate, installments - 1, frequency),
    installment_value: contract.parts[0],
    paid_amount: 0,
    remaining_amount: contract.total,
    current_installment_paid: 0,
    current_installment_remaining: contract.parts[0],
    next_due_date: firstDueDate,
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

  ['name', 'phone', 'address', 'guarantor_name', 'guarantor_phone', 'notes'].forEach(function (key) {
    if (data[key] !== undefined) found.object[key] = text_(data[key]);
  });
  if (!found.object.name || !found.object.phone) throw new Error('الاسم والهاتف مطلوبان');
  if (data.principal !== undefined) found.object.principal = positiveInteger_(data.principal, 'أصل المبلغ');
  if (data.profit_percent !== undefined) {
    found.object.profit_percent = nonNegativeNumber_(data.profit_percent, 'نسبة الربح');
  }
  if (data.installments !== undefined) {
    found.object.installments = positiveInteger_(data.installments, 'عدد الأقساط');
  }
  if (data.installment_type !== undefined) found.object.installment_type = frequency_(data.installment_type);
  if (data.first_due_date !== undefined) {
    found.object.first_due_date = requireDate_(data.first_due_date, 'تاريخ أول استحقاق');
  }
  if (data.delivery_date !== undefined) found.object.delivery_date = requireDate_(data.delivery_date, 'تاريخ التسليم');
  var preview = contract_(
    positiveInteger_(found.object.principal, 'أصل المبلغ'),
    nonNegativeNumber_(found.object.profit_percent, 'نسبة الربح'),
    positiveInteger_(found.object.installments, 'عدد الأقساط')
  );
  var alreadyPaid = listPayments_().filter(function (payment) {
    return number_(payment.customer_id, 0) === customerId &&
      (text_(payment.status) || 'active') === 'active';
  }).reduce(function (sum, payment) { return sum + integer_(payment.amount, 0); }, 0);
  if (preview.total < alreadyPaid) throw new Error('إجمالي العقد الجديد أصغر من المبلغ المدفوع');
  found.object.updated_at = now_();
  writeObjectRow_(table, found.rowNumber, found.object);
  recalculateCustomer_(customerId);
  return findById_(readTable_('customers'), customerId).object;
}

function archiveCustomer_(data) {
  var customerId = positiveInteger_(data.customer_id || data.id, 'معرف العميل');
  return setArchived_(customerId, true);
}

function restoreCustomer_(data) {
  var customerId = positiveInteger_(data.customer_id || data.id, 'معرف العميل');
  return setArchived_(customerId, false);
}

function setArchived_(customerId, archived) {
  var table = readTable_('customers');
  var found = findById_(table, customerId);
  if (!found) throw new Error('العميل غير موجود');
  found.object.archived = archived;
  found.object.status = archived ? 'مؤرشف' : 'منتظم';
  found.object.updated_at = now_();
  writeObjectRow_(table, found.rowNumber, found.object);
  if (!archived) recalculateCustomer_(customerId);
  return findById_(readTable_('customers'), customerId).object;
}

function addPayment_(data) {
  var customerId = positiveInteger_(data.customer_id, 'معرف العميل');
  // توافق انتقالي: الواجهة الجديدة ترسل request_id دائماً؛ القديمة تحصل على معرف فريد.
  var requestId = text_(data.request_id) || 'legacy-' + Utilities.getUuid();
  var paymentTable = readTable_('payments');
  var duplicate = paymentTable.rows.filter(function (row) {
    return text_(row.request_id) === requestId;
  })[0];
  if (duplicate) return duplicate; // idempotent: أعد نفس النتيجة ولا تضف صفاً.

  var customerTable = readTable_('customers');
  var customer = findById_(customerTable, customerId);
  if (!customer) throw new Error('العميل غير موجود');
  if (truthy_(customer.object.archived)) throw new Error('لا يمكن الدفع لعميل مؤرشف');

  var amount = positiveInteger_(data.amount, 'مبلغ الدفعة');
  var current = enrichCustomer_(customer.object, listPayments_());
  if (amount > current.remaining_amount) throw new Error('الدفعة أكبر من المبلغ المتبقي');

  var id = nextNumericId_('payments', 'PAYMENT_SEQUENCE');
  var createdAt = now_();
  var receipt = nextReceiptNumber_();
  var row = {
    id: id,
    customer_id: customerId,
    amount: amount,
    payment_date: requireDate_(data.payment_date || today_(), 'تاريخ الدفع'),
    notes: text_(data.notes),
    created_at: createdAt,
    request_id: requestId,
    receipt_number: receipt,
    status: 'active',
    cancellation_reason: '',
    cancelled_at: '',
    updated_at: createdAt
  };
  appendObject_('payments', row);
  var recalculated = recalculateCustomer_(customerId);
  row.customer = recalculated;
  return row;
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
  recalculateCustomer_(number_(found.object.customer_id, 0));
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

function recalculateCustomer_(customerId) {
  var table = readTable_('customers');
  var found = findById_(table, customerId);
  if (!found) throw new Error('العميل غير موجود');
  var enriched = enrichCustomer_(found.object, listPayments_());
  enriched.updated_at = now_();
  writeObjectRow_(table, found.rowNumber, enriched);
  return enriched;
}

function enrichCustomer_(row, payments) {
  var principal = integer_(row.principal, 0);
  var profitPercent = number_(row.profit_percent, 0);
  var count = Math.max(1, integer_(row.installments, 1));
  var frequency = frequency_(row.installment_type || 'monthly');
  var firstDue = dateText_(row.first_due_date || row.start_date || row.delivery_date || today_());
  var contract = contract_(principal, profitPercent, count);
  var paid = payments.filter(function (payment) {
    return number_(payment.customer_id, 0) === number_(row.id, 0) &&
      (text_(payment.status) || 'active') === 'active';
  }).reduce(function (sum, payment) { return sum + integer_(payment.amount, 0); }, 0);
  paid = Math.min(paid, contract.total);
  var allocation = allocate_(contract.parts, paid);
  var currentIndex = allocation.paidByInstallment.findIndex(function (value, index) {
    return value < contract.parts[index];
  });
  var archived = truthy_(row.archived) || text_(row.status) === 'مؤرشف';
  var nextDue = currentIndex === -1 ? '' : dueDate_(firstDue, currentIndex, frequency);
  var status = archived ? 'مؤرشف' : currentIndex === -1 ? 'مكتمل' :
    nextDue < today_() ? 'متأخر' : nextDue === today_() ? 'مستحق اليوم' : 'منتظم';
  row.id = number_(row.id, 0);
  row.principal = principal;
  row.profit_percent = profitPercent;
  row.installments = count;
  row.profit_amount = contract.profit;
  row.contract_total = contract.total;
  row.installment_type = frequency;
  row.first_due_date = firstDue;
  row.expected_end_date = dueDate_(firstDue, count - 1, frequency);
  row.installment_value = contract.parts[0];
  row.paid_amount = paid;
  row.remaining_amount = contract.total - paid;
  row.paid_installments = allocation.completed;
  row.current_installment_paid = currentIndex === -1 ? 0 : allocation.paidByInstallment[currentIndex];
  row.current_installment_remaining = currentIndex === -1 ? 0 :
    contract.parts[currentIndex] - allocation.paidByInstallment[currentIndex];
  row.next_due_date = nextDue;
  row.status = status;
  row.archived = archived;
  return row;
}

function contract_(principal, percent, count) {
  var basisPoints = Math.round(percent * 100);
  var profit = Math.round(principal * basisPoints / 10000);
  var total = principal + profit;
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
function positiveInteger_(value, label) { var parsed = integer_(value, NaN); if (!isFinite(parsed) || parsed <= 0) throw new Error(label + ' غير صالح'); return parsed; }
function nonNegativeInteger_(value, label) { var parsed = integer_(value, NaN); if (!isFinite(parsed) || parsed < 0) throw new Error(label + ' غير صالح'); return parsed; }
function requireText_(value, message) { var parsed = text_(value); if (!parsed) throw new Error(message); return parsed; }
function frequency_(value) { var parsed = text_(value).toLowerCase(); if (parsed === 'weekly' || parsed === 'أسبوعي') return 'weekly'; if (parsed === 'monthly' || parsed === 'شهري' || !parsed) return 'monthly'; throw new Error('نوع الأقساط غير صالح'); }
function truthy_(value) { return value === true || String(value).toLowerCase() === 'true' || String(value) === '1'; }
function today_() { return Utilities.formatDate(new Date(), 'Asia/Baghdad', 'yyyy-MM-dd'); }
function now_() { return Utilities.formatDate(new Date(), 'Asia/Baghdad', "yyyy-MM-dd'T'HH:mm:ss"); }
function dateText_(value) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]') return Utilities.formatDate(value, 'Asia/Baghdad', 'yyyy-MM-dd');
  var text = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}
function dateTimeText_(value) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]') return Utilities.formatDate(value, 'Asia/Baghdad', "yyyy-MM-dd'T'HH:mm:ss");
  return String(value);
}
function requireDate_(value, label) { var parsed = dateText_(value); if (!parsed) throw new Error(label + ' غير صالح'); return parsed; }
function uniqueSheetName_(spreadsheet, base) { var name = base; var index = 1; while (spreadsheet.getSheetByName(name)) { name = base + '_' + index; index += 1; } return name; }
