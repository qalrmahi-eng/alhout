import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

type SheetLike = {
  getName: () => string;
  getLastColumn: () => number;
  getRange: (row: number, column: number, rows: number, columns: number) => {
    getValues: () => unknown[][];
    setValues: (values: unknown[][]) => void;
  };
  getDataRange: () => { getValues: () => unknown[][] };
  appendRow: (values: unknown[]) => void;
  deleteRow: (row: number) => void;
};

type GasRuntime = {
  __properties: Map<string, string>;
  ScriptApp: Record<string, unknown>;
  today_: () => string;
  canonicalHeader_: (header: unknown) => string;
  dateText_: (value: unknown) => string;
  dueDate_: (firstDue: string, index: number, frequency: string) => string;
  readTable_: (name: string) => { sheet: SheetLike; headers: string[]; rows: Record<string, unknown>[] };
  upgradeSheets: () => { plan: { sheet: string; action: string; headers: string[] }[] };
  getDashboard_: () => { customers: unknown[]; contracts: Record<string, unknown>[]; payments: unknown[]; summary: Record<string, number> };
  reportsSummary_: (data: Record<string, unknown>) => Record<string, number | string>;
  integrityAudit_: () => { CRITICAL: Array<{ code: string; ids: Array<number | string> }>; WARNING: Array<{ code: string }>; INFO: Array<{ code: string }>; summary: Record<string, number>; reconciliation: Array<Record<string, unknown>> };
  financialReconciliation_: () => { dry_run: boolean; contracts: Array<Record<string, unknown>> };
  setupDailyBackupTrigger: () => { created: boolean; handler: string; trigger_id: string };
  addContract_: (data: Record<string, unknown>) => Record<string, unknown>;
  updateContract_: (data: Record<string, unknown>) => Record<string, unknown>;
  archiveContract_: (data: Record<string, unknown>) => Record<string, unknown>;
  restoreContract_: (data: Record<string, unknown>) => Record<string, unknown>;
  permanentlyDeleteContract_: (data: Record<string, unknown>) => Record<string, unknown>;
  addPayment_: (data: Record<string, unknown>) => Record<string, unknown>;
  cancelPayment_: (data: Record<string, unknown>) => Record<string, unknown>;
  updatePayment_: (data: Record<string, unknown>) => Record<string, unknown>;
  setManualReminderDate_: (data: Record<string, unknown>) => Record<string, unknown>;
  clearManualReminderDate_: (data: Record<string, unknown>) => Record<string, unknown>;
  dismissReminder_: (data: Record<string, unknown>) => Record<string, unknown>;
  restoreReminder_: (data: Record<string, unknown>) => Record<string, unknown>;
  archiveCustomer_: (data: Record<string, unknown>) => Record<string, unknown>;
  restoreCustomer_: (data: Record<string, unknown>) => Record<string, unknown>;
  permanentlyDeleteCustomer_: (data: Record<string, unknown>) => Record<string, unknown>;
  rebuildPaymentSnapshots_: (contractId: number, contractTotal: number, paymentTable?: unknown) => void;
  listContracts_: () => Record<string, unknown>[];
  listPayments_: () => Record<string, unknown>[];
};

function fakeSheet(name: string, headers: string[], rows: unknown[][] = []) {
  const data = [headers.slice(), ...rows.map((row) => row.slice())];
  const sheet: SheetLike = {
    getName: () => name,
    getLastColumn: () => data[0]?.length || 0,
    getRange: (row, column, rowCount, columnCount) => ({
      getValues: () => data.slice(row - 1, row - 1 + rowCount).map((values) => values.slice(column - 1, column - 1 + columnCount)),
      setValues: (values) => values.forEach((valuesRow, rowOffset) => {
        const target = row - 1 + rowOffset;
        if (!data[target]) data[target] = [];
        valuesRow.forEach((value, columnOffset) => { data[target][column - 1 + columnOffset] = value; });
      }),
    }),
    getDataRange: () => ({ getValues: () => data.map((row) => row.slice()) }),
    appendRow: (values) => { data.push(values.slice()); },
    deleteRow: (row) => { data.splice(row - 1, 1); },
  };
  return { sheet, data };
}

function formatDate(value: Date, timeZone: string, pattern: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(value);
  const fields = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const date = `${fields.year}-${fields.month}-${fields.day}`;
  if (pattern === 'yyyyMMdd') return `${fields.year}${fields.month}${fields.day}`;
  return pattern === 'yyyy-MM-dd' ? date : `${date}T${fields.hour}:${fields.minute}:${fields.second}`;
}

function loadAppsScript(sheets: Record<string, SheetLike> = {}) {
  const source = readFileSync('google-apps-script/Code.gs', 'utf8');
  const properties = new Map<string, string>();
  const context = createContext({
    console,
    __properties: properties,
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: (name: string) => sheets[name] || null }) },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: (key: string) => properties.get(key) || null,
      setProperty: (key: string, value: string) => { properties.set(key, value); },
    }) },
    Utilities: { formatDate, getUuid: () => '00000000-0000-4000-8000-000000000001' },
  });
  runInContext(source, context, { filename: 'Code.gs' });
  return context as unknown as GasRuntime;
}

const customerHeaders = ['id', 'name', 'phone', 'notes', 'created_at', 'address', 'archived', 'updated_at'];
const contractHeaders = [
  'id', 'customer_id', 'principal', 'profit_percent', 'profit_amount', 'contract_total',
  'installments', 'installment_value', 'delivery_date', 'first_due_date', 'expected_end_date',
  'guarantor_name', 'guarantor_phone', 'notes', 'paid_amount', 'remaining_amount',
  'current_installment_paid', 'current_installment_remaining', 'next_due_date', 'status',
  'archived', 'created_at', 'updated_at', 'manual_reminder_date', 'reminder_mode',
  'manual_due_amount', 'dismissed_reminder_date', 'manual_reminder_anchor_day',
];
const paymentHeaders = [
  'id', 'customer_id', 'amount', 'payment_date', 'notes', 'created_at', 'contract_id',
  'request_id', 'receipt_number', 'status', 'cancellation_reason', 'cancelled_at',
  'paid_after', 'remaining_after', 'updated_at', 'edited_at', 'edit_reason',
];

function createPaymentScenario() {
  const customerRow = customerHeaders.map((header) => ({
    id: 71, name: 'عميل أمان الدفعات', phone: '07700000071', archived: false,
  } as Record<string, unknown>)[header] ?? '');
  const customers = fakeSheet('customers', customerHeaders, [customerRow]);
  const contracts = fakeSheet('contracts', contractHeaders);
  const payments = fakeSheet('payments', paymentHeaders);
  const gas = loadAppsScript({ customers: customers.sheet, contracts: contracts.sheet, payments: payments.sheet });
  gas.today_ = () => '2026-01-01';
  const contract = gas.addContract_({
    customer_id: 71,
    principal: 1_000,
    profit_percent: 0,
    installments: 10,
    delivery_date: '2026-01-01',
    first_due_date: '2026-01-31',
  });
  return { gas, contract };
}

function rowFrom(headers: string[], value: Record<string, unknown>) {
  return headers.map((header) => value[header] ?? '');
}

describe('ترقية Sheets وسلامة العناوين', () => {
  it('يطبع التواريخ الملتبسة صراحة ويحافظ على نهاية الشهر', () => {
    const gas = loadAppsScript();
    expect(gas.dateText_('06/10/2026')).toBe('2026-10-06');
    expect(gas.dateText_('10/06/2026')).toBe('2026-06-10');
    expect(gas.dateText_('2026-10-06T23:30:00-10:00')).toBe('2026-10-06');
    expect(gas.dueDate_('2026-01-31', 1, 'monthly')).toBe('2026-02-28');
    expect(gas.dueDate_('2026-01-31', 2, 'monthly')).toBe('2026-03-31');
  });

  it('يطبع BOM والمسافات وعلامات الاتجاه', () => {
    const gas = loadAppsScript();
    expect(gas.canonicalHeader_('\uFEFF\u200FCUSTOMER_ID\u00A0')).toBe('customer_id');
    expect(gas.canonicalHeader_('payment_\u200Bdate')).toBe('payment_date');
  });

  it('يخطط لإنشاء contracts وإضافة ربط العقد ولقطات الرصيد إلى payments', () => {
    const payments = fakeSheet('payments', paymentHeaders.slice(0, 6));
    const gas = loadAppsScript({ payments: payments.sheet });
    const plan = gas.upgradeSheets().plan;
    expect(plan.find((item) => item.sheet === 'contracts')?.action).toBe('create');
    expect(plan.find((item) => item.sheet === 'payments')?.headers).toEqual([
      'contract_id', 'request_id', 'receipt_number', 'status', 'cancellation_reason',
      'cancelled_at', 'paid_after', 'remaining_after', 'updated_at', 'edited_at', 'edit_reason',
    ]);
    expect(plan.find((item) => item.sheet === 'contracts')?.headers).toContain('manual_reminder_anchor_day');
  });

  it('يقرأ payments مرة واحدة عند تحميل dashboard', () => {
    const fixtures = {
      settings: fakeSheet('settings', ['id'], [[1]]),
      customers: fakeSheet('customers', customerHeaders),
      contracts: fakeSheet('contracts', contractHeaders),
      payments: fakeSheet('payments', paymentHeaders),
    };
    const gas = loadAppsScript(Object.fromEntries(Object.entries(fixtures).map(([name, fixture]) => [name, fixture.sheet])));
    const original = gas.readTable_;
    let reads = 0;
    gas.readTable_ = (name: string) => { if (name === 'payments') reads += 1; return original(name); };
    expect(gas.getDashboard_()).toMatchObject({ customers: [], contracts: [], payments: [] });
    expect(reads).toBe(1);
  });

  it('يكشف التكرارات والأيتام والخلل المالي ولقطات الدفع دون تعديل الصفوف', () => {
    const customers = fakeSheet('customers', customerHeaders, [
      rowFrom(customerHeaders, { id: 1, name: 'الأول' }),
      rowFrom(customerHeaders, { id: 1, name: 'مكرر' }),
      rowFrom(customerHeaders, { name: 'بلا معرف' }),
    ]);
    const baseContract = {
      id: 10, customer_id: 1, principal: 1_000, profit_percent: 0, profit_amount: 0,
      contract_total: 1_000, installments: 10, installment_value: 100,
      delivery_date: '2026-01-01', first_due_date: '2026-01-31', expected_end_date: '2026-10-31',
      paid_amount: 200, remaining_amount: 800, current_installment_paid: 0,
      current_installment_remaining: 100, next_due_date: '2026-03-31', status: 'منتظم', archived: false,
    };
    const contracts = fakeSheet('contracts', contractHeaders, [
      rowFrom(contractHeaders, baseContract),
      rowFrom(contractHeaders, { ...baseContract, notes: 'duplicate contract id' }),
      rowFrom(contractHeaders, {
        ...baseContract, id: 11, customer_id: 99, principal: 500, contract_total: 999,
        paid_amount: 0, remaining_amount: 999, status: 'مكتمل',
      }),
    ]);
    const payments = fakeSheet('payments', paymentHeaders, [
      rowFrom(paymentHeaders, {
        id: 100, customer_id: 1, contract_id: 10, amount: 100, payment_date: '2026-02-10',
        created_at: '2026-02-10T10:00:00', request_id: 'duplicate-request',
        receipt_number: 'R-20260110-0001', status: 'active', paid_after: 100, remaining_after: 900,
      }),
      rowFrom(paymentHeaders, {
        id: 100, customer_id: 2, contract_id: 10, amount: 100, payment_date: '2026-01-10',
        created_at: '2026-01-10T10:00:00', request_id: 'duplicate-request',
        receipt_number: 'R-20260110-0001', status: 'active', paid_after: 200, remaining_after: 800,
      }),
      rowFrom(paymentHeaders, {
        id: 102, customer_id: 1, contract_id: 999, amount: 0, payment_date: '2026-99-99',
        request_id: 'orphan', receipt_number: 'BAD', status: 'active',
      }),
    ]);
    const before = JSON.stringify({ customers: customers.data, contracts: contracts.data, payments: payments.data });
    const gas = loadAppsScript({ customers: customers.sheet, contracts: contracts.sheet, payments: payments.sheet });
    gas.today_ = () => '2026-01-01';

    const audit = gas.integrityAudit_();
    const criticalCodes = audit.CRITICAL.map((issue) => issue.code);
    const warningCodes = audit.WARNING.map((issue) => issue.code);
    const reconciliation = gas.financialReconciliation_();

    expect(criticalCodes).toEqual(expect.arrayContaining([
      'duplicate_customer_id', 'missing_customer_id', 'duplicate_contract_id', 'duplicate_payment_id',
      'duplicate_request_id', 'duplicate_receipt_number', 'orphan_contract', 'orphan_payment',
      'payment_customer_mismatch', 'invalid_payment_amount', 'invalid_payment_date', 'contract_total_mismatch',
    ]));
    expect(warningCodes).toContain('payment_snapshot_mismatch');
    expect(warningCodes).toContain('malformed_receipt_number');
    expect(audit.summary.critical).toBeGreaterThan(0);
    expect(audit.reconciliation.find((row) => row.contract_id === 10)?.snapshot_errors).not.toEqual([]);
    expect(reconciliation.dry_run).toBe(true);
    expect(reconciliation.contracts.find((row) => row.contract_id === 10)).toMatchObject({
      stored_paid: 200,
      calculated_paid: 200,
      stored_remaining: 800,
      calculated_remaining: 800,
    });
    expect(JSON.stringify({ customers: customers.data, contracts: contracts.data, payments: payments.data })).toBe(before);
  });

  it('لا ينشئ أكثر من trigger يومي واحد للنسخ الاحتياطي', () => {
    const gas = loadAppsScript();
    const triggers: Array<{ getHandlerFunction: () => string; getEventType: () => string; getUniqueId: () => string }> = [];
    let created = 0;
    const builder: Record<string, () => unknown> = {};
    builder.timeBased = () => builder;
    builder.everyDays = () => builder;
    builder.atHour = () => builder;
    builder.create = () => {
      created += 1;
      const trigger = {
        getHandlerFunction: () => 'createSpreadsheetBackup',
        getEventType: () => 'CLOCK',
        getUniqueId: () => `trigger-${created}`,
      };
      triggers.push(trigger);
      return trigger;
    };
    gas.ScriptApp = {
      EventType: { CLOCK: 'CLOCK' },
      getProjectTriggers: () => triggers,
      newTrigger: () => builder,
    };

    expect(gas.setupDailyBackupTrigger()).toMatchObject({ created: true, trigger_id: 'trigger-1' });
    expect(gas.setupDailyBackupTrigger()).toMatchObject({ created: false, trigger_id: 'trigger-1' });
    expect(created).toBe(1);
  });
});

describe('سيناريو Phase 1 في Apps Script', () => {
  it('يبقي القسط الجزئي متأخراً وينقل القسط المكتمل للموعد التالي', () => {
    const customerRow = customerHeaders.map((header) => ({ id: 9, name: 'عميل اختبار' } as Record<string, unknown>)[header] ?? '');
    const customers = fakeSheet('customers', customerHeaders, [customerRow]);
    const contracts = fakeSheet('contracts', contractHeaders);
    const payments = fakeSheet('payments', paymentHeaders);
    const gas = loadAppsScript({ customers: customers.sheet, contracts: contracts.sheet, payments: payments.sheet });
    gas.today_ = () => '2026-10-13';
    const row = gas.addContract_({
      customer_id: 9, principal: 3_900_000, profit_percent: 0, installments: 10,
      delivery_date: '2026-10-01', first_due_date: '2026-10-12',
    });
    const partial = gas.addPayment_({ contract_id: row.id, amount: 300_000, payment_date: '2026-10-13', request_id: 'partial-390' });
    expect(partial.contract_after).toMatchObject({ current_installment_remaining: 90_000, next_due_date: '2026-10-12', status: 'متأخر' });
    const completed = gas.addPayment_({ contract_id: row.id, amount: 90_000, payment_date: '2026-10-13', request_id: 'full-390' });
    expect(completed.contract_after).toMatchObject({ current_installment_remaining: 390_000, next_due_date: '2026-11-12', status: 'منتظم' });
  });

  it('يفصل عقدين ويلغي الدفعة دون حذفها أو التأثير في العقد الآخر', () => {
    const customerRow = customerHeaders.map((header) => ({
      id: 15, name: 'أحمد محمد', phone: '07700000000', archived: false,
    } as Record<string, unknown>)[header] ?? '');
    const customers = fakeSheet('customers', customerHeaders, [customerRow]);
    const contracts = fakeSheet('contracts', contractHeaders);
    const payments = fakeSheet('payments', paymentHeaders);
    const settings = fakeSheet('settings', ['id', 'system_name'], [[1, 'الحوت']]);
    const gas = loadAppsScript({ settings: settings.sheet, customers: customers.sheet, contracts: contracts.sheet, payments: payments.sheet });

    const first = gas.addContract_({
      customer_id: 15, principal: 5_000_000, profit_percent: 20, installments: 10,
      delivery_date: '2026-01-01', first_due_date: '2026-01-31',
    });
    expect(first).toMatchObject({ profit_amount: 1_000_000, contract_total: 6_000_000, installment_value: 600_000, expected_end_date: '2026-10-31' });
    const equalInstallment = gas.addPayment_({ contract_id: first.id, amount: 600_000, payment_date: '2026-01-01', request_id: 'a-1' });
    expect(equalInstallment).toMatchObject({ paid_after: 600_000, remaining_after: 5_400_000 });
    expect(equalInstallment.contract_after).toMatchObject({ next_due_date: '2026-02-28' });
    const partial = gas.addPayment_({ contract_id: first.id, amount: 300_000, payment_date: '2026-01-02', request_id: 'a-2' });
    expect(partial).toMatchObject({ paid_after: 900_000, remaining_after: 5_100_000 });
    expect(partial.contract_after).toMatchObject({ current_installment_remaining: 300_000 });
    const multiInstallment = gas.addPayment_({ contract_id: first.id, amount: 900_000, payment_date: '2026-01-03', request_id: 'a-3' });
    expect(multiInstallment).toMatchObject({ paid_after: 1_800_000, remaining_after: 4_200_000 });
    expect(multiInstallment.contract_after).toMatchObject({ next_due_date: '2026-04-30' });

    const second = gas.addContract_({
      customer_id: 15, principal: 3_000_000, profit_percent: 10, installments: 6,
      delivery_date: '2026-02-01', first_due_date: '2026-02-28',
    });
    gas.addPayment_({ contract_id: second.id, amount: 550_000, payment_date: '2026-02-01', request_id: 'b-1' });
    let current = gas.listContracts_();
    expect(current.find((item) => item.id === first.id)?.remaining_amount).toBe(4_200_000);
    expect(current.find((item) => item.id === second.id)?.remaining_amount).toBe(2_750_000);

    const firstPayment = gas.listPayments_().find((item) => item.request_id === 'a-1');
    gas.cancelPayment_({ payment_id: firstPayment?.id, cancellation_reason: 'اختبار الإلغاء' });
    current = gas.listContracts_();
    expect(current.find((item) => item.id === first.id)?.remaining_amount).toBe(4_800_000);
    expect(current.find((item) => item.id === second.id)?.remaining_amount).toBe(2_750_000);
    expect(gas.listPayments_().find((item) => item.request_id === 'a-1')?.status).toBe('cancelled');

    const dashboard = gas.getDashboard_();
    expect(dashboard.summary).toMatchObject({
      total_principal: 8_000_000,
      total_contract_value: 9_300_000,
      total_received: 1_750_000,
      total_remaining: 7_550_000,
      total_expected_profit: 1_300_000,
      customers_count: 1,
      active_contracts_count: 2,
      overdue_contracts_count: 2,
    });

    expect(gas.archiveContract_({ contract_id: first.id })).toMatchObject({ id: first.id, status: 'مؤرشف', archived: true });
    expect(gas.getDashboard_().summary).toMatchObject({
      total_principal: 3_000_000,
      total_contract_value: 3_300_000,
      total_received: 550_000,
      total_remaining: 2_750_000,
      total_expected_profit: 300_000,
      active_contracts_count: 1,
      overdue_contracts_count: 1,
    });
    expect(gas.restoreContract_({ contract_id: first.id })).toMatchObject({ id: first.id, archived: false });
    expect(gas.getDashboard_().summary).toMatchObject({
      total_principal: 8_000_000,
      total_contract_value: 9_300_000,
      total_received: 1_750_000,
      total_remaining: 7_550_000,
      total_expected_profit: 1_300_000,
      active_contracts_count: 2,
      overdue_contracts_count: 2,
    });
    expect(() => gas.permanentlyDeleteContract_({ contract_id: first.id })).toThrow('دفعات نشطة');

    const mistaken = gas.addContract_({
      customer_id: 15, principal: 200_000, profit_percent: 0, installments: 2,
      delivery_date: '2026-03-01', first_due_date: '2026-03-31',
    });
    expect(gas.permanentlyDeleteContract_({ contract_id: mistaken.id })).toEqual({
      contract_id: mistaken.id,
      customer_id: 15,
      deleted_contracts: 1,
      deleted_payments: 0,
    });
    expect(gas.listContracts_().map((contract) => contract.id)).toEqual([first.id, second.id]);
    expect(gas.listContracts_().find((contract) => contract.id === second.id)).toMatchObject({ remaining_amount: 2_750_000 });

    expect(gas.reportsSummary_({ from: '2026-01-01', to: '2026-01-31' })).toMatchObject({
      received_amount: 1_200_000,
      payments_count: 2,
      cancelled_payments_amount: 600_000,
      cancelled_payments_count: 1,
      new_contracts_count: 1,
      new_contracts_principal: 5_000_000,
      new_contracts_total: 6_000_000,
      new_contracts_profit: 1_000_000,
    });

    expect(gas.reportsSummary_({ from: '2026-02-01', to: '2026-02-28' })).toMatchObject({
      received_amount: 550_000,
      payments_count: 1,
      new_contracts_count: 1,
      new_contracts_principal: 3_000_000,
    });

    expect(() => gas.permanentlyDeleteCustomer_({ customer_id: 15 })).toThrow('دفعات مرتبطة');
    expect(gas.archiveCustomer_({ customer_id: 15 })).toMatchObject({ id: 15, archived: true });
    expect(gas.readTable_('customers').rows.filter((row) => row.id !== '')).toHaveLength(1);
    expect(gas.listContracts_()).toHaveLength(2);
    expect(gas.listPayments_()).toHaveLength(4);
    expect(gas.readTable_('settings').rows).toHaveLength(1);
  });

  it('يعيد نتيجة الدفعة نفسها عند ضياع الاستجابة أو تكرار الإرسال بنفس request_id', () => {
    const { gas, contract } = createPaymentScenario();
    const request = {
      contract_id: contract.id,
      amount: 100,
      payment_date: '2026-01-10',
      request_id: 'stable-logical-payment',
    };

    const first = gas.addPayment_(request);
    const retryAfterLostResponse = gas.addPayment_(request);
    const duplicateSubmit = gas.addPayment_(request);

    expect(gas.listPayments_()).toHaveLength(1);
    expect(retryAfterLostResponse).toMatchObject({
      id: first.id,
      receipt_number: first.receipt_number,
      request_id: request.request_id,
      paid_after: 100,
      remaining_after: 900,
    });
    expect(duplicateSubmit).toMatchObject({ id: first.id, receipt_number: first.receipt_number });
    expect(duplicateSubmit.contract_after).toMatchObject({ paid_amount: 100, remaining_amount: 900 });
  });

  it('يرفض إعادة استخدام request_id نفسه لدفعة بمبلغ مختلف', () => {
    const { gas, contract } = createPaymentScenario();
    expect(() => gas.addPayment_({
      contract_id: contract.id,
      amount: 100,
      payment_date: '2026-01-10',
    })).toThrow('request_id');
    gas.addPayment_({
      contract_id: contract.id,
      amount: 100,
      payment_date: '2026-01-10',
      request_id: 'payload-mismatch',
    });

    expect(() => gas.addPayment_({
      contract_id: contract.id,
      amount: 101,
      payment_date: '2026-01-10',
      request_id: 'payload-mismatch',
    })).toThrow('request_id');
    expect(gas.listPayments_()).toHaveLength(1);
    expect(gas.listContracts_().find((row) => row.id === contract.id)).toMatchObject({ paid_amount: 100, remaining_amount: 900 });
  });

  it('يكمل reconciliation بأمان إذا فشل التنفيذ بعد append ثم أُعيد بنفس request_id', () => {
    const { gas, contract } = createPaymentScenario();
    const later = gas.addPayment_({
      contract_id: contract.id,
      amount: 200,
      payment_date: '2026-02-10',
      request_id: 'existing-later-payment',
    });
    const originalRebuild = gas.rebuildPaymentSnapshots_;
    gas.rebuildPaymentSnapshots_ = () => { throw new Error('injected failure after append'); };

    expect(() => gas.addPayment_({
      contract_id: contract.id,
      amount: 100,
      payment_date: '2026-01-10',
      request_id: 'partial-commit-recovery',
    })).toThrow('injected failure after append');
    expect(gas.listPayments_()).toHaveLength(2);

    gas.rebuildPaymentSnapshots_ = originalRebuild;
    const recovered = gas.addPayment_({
      contract_id: contract.id,
      amount: 100,
      payment_date: '2026-01-10',
      request_id: 'partial-commit-recovery',
    });
    const rows = gas.listPayments_();

    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.request_id === 'partial-commit-recovery')).toMatchObject({ paid_after: 100, remaining_after: 900 });
    expect(rows.find((row) => row.id === later.id)).toMatchObject({ paid_after: 300, remaining_after: 700 });
    expect(recovered.contract_after).toMatchObject({ paid_amount: 300, remaining_amount: 700 });
  });

  it('يمنع حذف العميل نهائياً حتى إذا كانت كل دفعاته ملغاة', () => {
    const { gas, contract } = createPaymentScenario();
    const payment = gas.addPayment_({
      contract_id: contract.id,
      amount: 100,
      payment_date: '2026-01-10',
      request_id: 'cancelled-history-must-survive',
    });
    gas.cancelPayment_({ payment_id: payment.id, cancellation_reason: 'اختبار حماية التاريخ' });

    expect(() => gas.permanentlyDeleteCustomer_({ customer_id: 71 })).toThrow('دفعات مرتبطة');
    expect(gas.listPayments_()).toHaveLength(1);
    expect(gas.listPayments_()[0]).toMatchObject({ id: payment.id, status: 'cancelled' });
  });

  it('يعيد snapshots بعد إلغاء دفعة وسطية ولا يؤثر في عقد آخر لنفس العميل', () => {
    const { gas, contract } = createPaymentScenario();
    const other = gas.addContract_({
      customer_id: 71, principal: 500, profit_percent: 0, installments: 5,
      delivery_date: '2026-01-01', first_due_date: '2026-01-31',
    });
    const first = gas.addPayment_({ contract_id: contract.id, amount: 100, payment_date: '2026-01-10', request_id: 'cancel-middle-first' });
    const middle = gas.addPayment_({ contract_id: contract.id, amount: 200, payment_date: '2026-01-20', request_id: 'cancel-middle-target' });
    const later = gas.addPayment_({ contract_id: contract.id, amount: 300, payment_date: '2026-01-30', request_id: 'cancel-middle-later' });
    const otherPayment = gas.addPayment_({ contract_id: other.id, amount: 40, payment_date: '2026-01-15', request_id: 'cancel-middle-other' });
    const otherBefore = gas.listContracts_().find((row) => row.id === other.id);

    const cancelled = gas.cancelPayment_({ payment_id: middle.id, cancellation_reason: 'إلغاء دفعة وسطية' });
    const rows = gas.listPayments_();
    const active = rows.filter((row) => row.contract_id === contract.id && row.status === 'active');

    expect(cancelled).toMatchObject({ id: middle.id, status: 'cancelled', receipt_number: middle.receipt_number });
    expect(active.find((row) => row.id === first.id)).toMatchObject({ paid_after: 100, remaining_after: 900 });
    expect(active.find((row) => row.id === later.id)).toMatchObject({ paid_after: 400, remaining_after: 600 });
    expect(active.every((row) => Number(row.paid_after) + Number(row.remaining_after) === 1_000)).toBe(true);
    expect(cancelled.contract_after).toMatchObject({ paid_amount: 400, remaining_amount: 600 });
    expect(rows.find((row) => row.id === otherPayment.id)).toMatchObject({ paid_after: 40, remaining_after: 460 });
    expect(gas.listContracts_().find((row) => row.id === other.id)).toMatchObject({
      paid_amount: otherBefore?.paid_amount,
      remaining_amount: otherBefore?.remaining_amount,
    });
  });

  it('يعيد إجماليات العقد الصحيحة عند إلغاء أحدث دفعة', () => {
    const { gas, contract } = createPaymentScenario();
    const first = gas.addPayment_({ contract_id: contract.id, amount: 100, payment_date: '2026-01-10', request_id: 'cancel-latest-first' });
    const second = gas.addPayment_({ contract_id: contract.id, amount: 200, payment_date: '2026-01-20', request_id: 'cancel-latest-second' });
    const latest = gas.addPayment_({ contract_id: contract.id, amount: 300, payment_date: '2026-01-30', request_id: 'cancel-latest-target' });

    const cancelled = gas.cancelPayment_({ payment_id: latest.id, cancellation_reason: 'إلغاء أحدث دفعة' });
    const rows = gas.listPayments_();

    expect(rows.find((row) => row.id === first.id)).toMatchObject({ paid_after: 100, remaining_after: 900 });
    expect(rows.find((row) => row.id === second.id)).toMatchObject({ paid_after: 300, remaining_after: 700 });
    expect(cancelled.contract_after).toMatchObject({ paid_amount: 300, remaining_amount: 700 });
  });

  it('يعيد العقد المكتمل إلى الحالة النشطة عند إلغاء الدفعة النهائية', () => {
    const { gas, contract } = createPaymentScenario();
    gas.addPayment_({ contract_id: contract.id, amount: 900, payment_date: '2026-09-30', request_id: 'complete-before-final' });
    const finalPayment = gas.addPayment_({ contract_id: contract.id, amount: 100, payment_date: '2026-10-31', request_id: 'complete-final' });
    expect(finalPayment.contract_after).toMatchObject({ status: 'مكتمل', paid_amount: 1_000, remaining_amount: 0 });

    const cancelled = gas.cancelPayment_({ payment_id: finalPayment.id, cancellation_reason: 'إلغاء الدفعة النهائية' });

    expect(cancelled.contract_after).toMatchObject({
      paid_amount: 900,
      remaining_amount: 100,
      next_due_date: '2026-10-31',
    });
    expect((cancelled.contract_after as Record<string, unknown>).status).not.toBe('مكتمل');
  });

  it('يصلح partial commit عند الفشل بعد كتابة cancelled ثم Retry', () => {
    const { gas, contract } = createPaymentScenario();
    const first = gas.addPayment_({ contract_id: contract.id, amount: 100, payment_date: '2026-01-10', request_id: 'cancel-recovery-first' });
    const target = gas.addPayment_({ contract_id: contract.id, amount: 200, payment_date: '2026-01-20', request_id: 'cancel-recovery-target' });
    const later = gas.addPayment_({ contract_id: contract.id, amount: 300, payment_date: '2026-01-30', request_id: 'cancel-recovery-later' });
    const originalRebuild = gas.rebuildPaymentSnapshots_;
    gas.rebuildPaymentSnapshots_ = () => { throw new Error('injected failure after cancellation status write'); };

    expect(() => gas.cancelPayment_({
      payment_id: target.id,
      cancellation_reason: 'إلغاء قابل للاسترداد',
    })).toThrow('injected failure after cancellation status write');
    expect(gas.listPayments_()).toHaveLength(3);
    expect(gas.listPayments_().find((row) => row.id === target.id)).toMatchObject({
      status: 'cancelled',
      receipt_number: target.receipt_number,
    });
    expect(gas.readTable_('contracts').rows.find((row) => row.id === contract.id)).toMatchObject({
      paid_amount: 600,
      remaining_amount: 400,
    });
    expect(gas.listPayments_().find((row) => row.id === later.id)).toMatchObject({ paid_after: 600, remaining_after: 400 });

    gas.rebuildPaymentSnapshots_ = originalRebuild;
    const recovered = gas.cancelPayment_({ payment_id: target.id, cancellation_reason: 'إلغاء قابل للاسترداد' });
    const rows = gas.listPayments_();
    const active = rows.filter((row) => row.contract_id === contract.id && row.status === 'active');

    expect(rows).toHaveLength(3);
    expect(rows.find((row) => row.id === target.id)).toMatchObject({ status: 'cancelled', receipt_number: target.receipt_number });
    expect(active.find((row) => row.id === first.id)).toMatchObject({ paid_after: 100, remaining_after: 900 });
    expect(active.find((row) => row.id === later.id)).toMatchObject({ paid_after: 400, remaining_after: 600 });
    expect(active.every((row) => Number(row.paid_after) + Number(row.remaining_after) === 1_000)).toBe(true);
    expect(recovered.contract_after).toMatchObject({ paid_amount: 400, remaining_amount: 600 });
    expect(gas.readTable_('contracts').rows.find((row) => row.id === contract.id)).toMatchObject({
      paid_amount: 400,
      remaining_amount: 600,
    });
  });

  it('يجعل Retry لإلغاء ناجح سابقاً idempotent مع reconciliation كامل', () => {
    const { gas, contract } = createPaymentScenario();
    gas.addPayment_({ contract_id: contract.id, amount: 100, payment_date: '2026-01-10', request_id: 'cancel-idempotent-first' });
    const target = gas.addPayment_({ contract_id: contract.id, amount: 200, payment_date: '2026-01-20', request_id: 'cancel-idempotent-target' });
    const firstCancel = gas.cancelPayment_({ payment_id: target.id, cancellation_reason: 'السبب الأصلي' });
    const cancelledAt = firstCancel.cancelled_at;

    const retry = gas.cancelPayment_({ payment_id: target.id, cancellation_reason: 'سبب Retry لا يستبدل التاريخ' });
    const rows = gas.listPayments_();

    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.id === target.id)).toMatchObject({
      status: 'cancelled',
      receipt_number: target.receipt_number,
      cancellation_reason: 'السبب الأصلي',
      cancelled_at: cancelledAt,
    });
    expect(retry.contract_after).toMatchObject({ paid_amount: 100, remaining_amount: 900 });
  });

  it('يعيد بناء snapshots بعد تعديل قيمة العقد ويرفض التخفيض تحت المدفوع دون كتابة جزئية', () => {
    const { gas, contract } = createPaymentScenario();
    const other = gas.addContract_({
      customer_id: 71,
      principal: 500,
      profit_percent: 0,
      installments: 5,
      delivery_date: '2026-01-01',
      first_due_date: '2026-01-31',
    });
    const later = gas.addPayment_({ contract_id: contract.id, amount: 200, payment_date: '2026-02-10', request_id: 'snapshot-later' });
    const earlier = gas.addPayment_({ contract_id: contract.id, amount: 100, payment_date: '2026-01-10', request_id: 'snapshot-earlier' });
    const cancelled = gas.addPayment_({ contract_id: contract.id, amount: 50, payment_date: '2026-01-20', request_id: 'snapshot-cancelled' });
    gas.cancelPayment_({ payment_id: cancelled.id, cancellation_reason: 'لا يدخل في الحساب' });
    const otherPayment = gas.addPayment_({ contract_id: other.id, amount: 40, payment_date: '2026-01-15', request_id: 'snapshot-other-contract' });

    const updated = gas.updateContract_({ contract_id: contract.id, principal: 1_200, profit_percent: 25 });
    const activeRows = gas.listPayments_().filter((row) => row.contract_id === contract.id && row.status === 'active');
    const otherAfter = gas.listPayments_().find((row) => row.id === otherPayment.id);

    expect(updated).toMatchObject({ contract_total: 1_500, paid_amount: 300, remaining_amount: 1_200 });
    expect(activeRows.find((row) => row.id === earlier.id)).toMatchObject({ paid_after: 100, remaining_after: 1_400 });
    expect(activeRows.find((row) => row.id === later.id)).toMatchObject({ paid_after: 300, remaining_after: 1_200 });
    expect(activeRows.every((row) => Number(row.paid_after) + Number(row.remaining_after) === 1_500)).toBe(true);
    expect(otherAfter).toMatchObject({ paid_after: 40, remaining_after: 460 });

    const snapshotsBeforeReject = gas.listPayments_().map((row) => ({
      id: row.id,
      paid_after: row.paid_after,
      remaining_after: row.remaining_after,
    }));
    expect(() => gas.updateContract_({ contract_id: contract.id, principal: 200, profit_percent: 0 })).toThrow('أصغر من المبلغ المدفوع');
    expect(gas.listContracts_().find((row) => row.id === contract.id)).toMatchObject({ contract_total: 1_500, paid_amount: 300, remaining_amount: 1_200 });
    expect(gas.listPayments_().map((row) => ({
      id: row.id,
      paid_after: row.paid_after,
      remaining_after: row.remaining_after,
    }))).toEqual(snapshotsBeforeReject);
  });

  it('يصالح receipt counter المفقود أو القديم مع أعلى رقم موجود', () => {
    const { gas, contract } = createPaymentScenario();
    const first = gas.addPayment_({ contract_id: contract.id, amount: 100, payment_date: '2026-01-10', request_id: 'receipt-safe-1' });
    const firstReceipt = String(first.receipt_number);
    const receiptDate = firstReceipt.split('-')[1];
    const key = `RECEIPT_SEQUENCE_${receiptDate}`;

    gas.__properties.delete(key);
    const second = gas.addPayment_({ contract_id: contract.id, amount: 100, payment_date: '2026-01-11', request_id: 'receipt-safe-2' });
    gas.__properties.set(key, '1');
    const third = gas.addPayment_({ contract_id: contract.id, amount: 100, payment_date: '2026-01-12', request_id: 'receipt-safe-3' });
    const receipts = gas.listPayments_().map((row) => row.receipt_number);

    expect(firstReceipt).toMatch(/^R-\d{8}-0001$/);
    expect(second.receipt_number).toBe(`R-${receiptDate}-0002`);
    expect(third.receipt_number).toBe(`R-${receiptDate}-0003`);
    expect(new Set(receipts).size).toBe(receipts.length);
  });

  it('يستبعد العميل المؤرشف وعقوده من Dashboard ويعيدهما بعد Restore دون التأثير في عميل آخر', () => {
    const customerRows = [
      { id: 81, name: 'عميل مؤرشف', phone: '081', archived: false },
      { id: 82, name: 'عميل مستمر', phone: '082', archived: false },
    ].map((customer) => customerHeaders.map((header) => (customer as Record<string, unknown>)[header] ?? ''));
    const customers = fakeSheet('customers', customerHeaders, customerRows);
    const contracts = fakeSheet('contracts', contractHeaders);
    const payments = fakeSheet('payments', paymentHeaders);
    const settings = fakeSheet('settings', ['id', 'system_name'], [[1, 'الحوت']]);
    const gas = loadAppsScript({ customers: customers.sheet, contracts: contracts.sheet, payments: payments.sheet, settings: settings.sheet });
    gas.today_ = () => '2026-01-30';
    const archivedCustomerContract = gas.addContract_({ customer_id: 81, principal: 1_000, profit_percent: 10, installments: 10, delivery_date: '2026-01-01', first_due_date: '2026-01-31' });
    const otherContract = gas.addContract_({ customer_id: 82, principal: 2_000, profit_percent: 20, installments: 10, delivery_date: '2026-01-01', first_due_date: '2026-01-31' });
    gas.addPayment_({ contract_id: archivedCustomerContract.id, amount: 100, payment_date: '2026-01-10', request_id: 'archive-customer-payment' });
    gas.addPayment_({ contract_id: otherContract.id, amount: 200, payment_date: '2026-01-10', request_id: 'other-customer-payment' });

    expect(gas.getDashboard_().summary).toMatchObject({
      customers_count: 2,
      active_contracts_count: 2,
      total_principal: 3_000,
      total_contract_value: 3_500,
      total_received: 300,
      total_remaining: 3_200,
      total_expected_profit: 500,
    });
    gas.archiveCustomer_({ customer_id: 81 });
    expect(gas.getDashboard_().summary).toMatchObject({
      customers_count: 1,
      active_contracts_count: 1,
      total_principal: 2_000,
      total_contract_value: 2_400,
      total_received: 200,
      total_remaining: 2_200,
      total_expected_profit: 400,
    });
    expect(gas.listContracts_()).toHaveLength(2);
    expect(gas.listPayments_()).toHaveLength(2);
    expect(gas.listContracts_().find((row) => row.id === otherContract.id)).toMatchObject({ paid_amount: 200, remaining_amount: 2_200 });

    gas.restoreCustomer_({ customer_id: 81 });
    expect(gas.getDashboard_().summary).toMatchObject({
      customers_count: 2,
      active_contracts_count: 2,
      total_principal: 3_000,
      total_contract_value: 3_500,
      total_received: 300,
      total_remaining: 3_200,
      total_expected_profit: 500,
    });
  });

  it('يفصل موعد التذكير ويصحح الدفعة ولقطات ما بعدها داخل عقد واحد', () => {
    const customerRow = customerHeaders.map((header) => ({ id: 21, name: 'سارة', phone: '07700000001' } as Record<string, unknown>)[header] ?? '');
    const customers = fakeSheet('customers', customerHeaders, [customerRow]);
    const contracts = fakeSheet('contracts', contractHeaders);
    const payments = fakeSheet('payments', paymentHeaders);
    const settings = fakeSheet('settings', ['id', 'system_name'], [[1, 'الحوت']]);
    const gas = loadAppsScript({ settings: settings.sheet, customers: customers.sheet, contracts: contracts.sheet, payments: payments.sheet });
    const first = gas.addContract_({ customer_id: 21, principal: 1_000_000, profit_percent: 10, installments: 10, delivery_date: '2026-01-01', first_due_date: '2026-01-31' });
    const second = gas.addContract_({ customer_id: 21, principal: 1_000_000, profit_percent: 0, installments: 10, delivery_date: '2026-01-01', first_due_date: '2026-01-31' });
    const payment1 = gas.addPayment_({ contract_id: first.id, amount: 100_000, payment_date: '2026-01-31', request_id: 'edit-1' });
    const payment2 = gas.addPayment_({ contract_id: first.id, amount: 200_000, payment_date: '2026-02-10', request_id: 'edit-2' });
    const payment3 = gas.addPayment_({ contract_id: first.id, amount: 300_000, payment_date: '2026-03-10', request_id: 'edit-3' });
    gas.addPayment_({ contract_id: second.id, amount: 100_000, payment_date: '2026-02-01', request_id: 'other-contract' });
    const secondBefore = gas.listContracts_().find((row) => row.id === second.id);

    const automaticDue = gas.listContracts_().find((row) => row.id === first.id)?.next_due_date;
    expect(first).toMatchObject({ reminder_mode: 'automatic', manual_reminder_date: '' });
    expect(gas.setManualReminderDate_({ contract_id: first.id, manual_reminder_date: '2026-09-15', manual_due_amount: 75_000 })).toMatchObject({ reminder_mode: 'manual', manual_reminder_date: '2026-09-15', manual_reminder_anchor_day: 15, manual_due_amount: 75_000, next_due_date: automaticDue });
    expect(gas.dismissReminder_({ contract_id: first.id, effective_due_date: '2026-09-15' })).toMatchObject({ dismissed_reminder_date: '2026-09-15' });

    const edited = gas.updatePayment_({ payment_id: payment1.id, amount: 150_000, payment_date: '2026-02-01', notes: 'تصحيح', edit_reason: 'خطأ إدخال' });
    expect(edited).toMatchObject({ amount: 150_000, payment_date: '2026-02-01', notes: 'تصحيح', edit_reason: 'خطأ إدخال', paid_after: 150_000, remaining_after: 950_000 });
    expect(edited.contract_after).toMatchObject({ reminder_mode: 'manual', manual_reminder_date: '2026-09-15', manual_due_amount: 75_000, dismissed_reminder_date: '2026-09-15' });
    const after = gas.listPayments_();
    expect(after.find((row) => row.id === payment2.id)).toMatchObject({ paid_after: 350_000, remaining_after: 750_000 });
    expect(after.find((row) => row.id === payment3.id)).toMatchObject({ paid_after: 650_000, remaining_after: 450_000 });
    expect(gas.listContracts_().find((row) => row.id === first.id)).toMatchObject({ paid_amount: 650_000, remaining_amount: 450_000 });
    expect(gas.listContracts_().find((row) => row.id === second.id)).toMatchObject({ paid_amount: secondBefore?.paid_amount, remaining_amount: secondBefore?.remaining_amount });
    expect(gas.reportsSummary_({ from: '2026-01-01', to: '2026-01-31' })).toMatchObject({ received_amount: 0, payments_count: 0 });
    expect(gas.reportsSummary_({ from: '2026-02-01', to: '2026-02-28' })).toMatchObject({ received_amount: 450_000, payments_count: 3 });
    expect(() => gas.updatePayment_({ payment_id: payment1.id, amount: 900_000, edit_reason: 'قيمة غير صحيحة' })).toThrow('أكبر من إجمالي العقد');

    const addedWhileManual = gas.addPayment_({ contract_id: first.id, amount: 50_000, payment_date: '2026-03-20', request_id: 'manual-preserved' });
    expect(addedWhileManual.contract_after).toMatchObject({ reminder_mode: 'manual', manual_reminder_date: '2026-09-15', manual_reminder_anchor_day: 15, manual_due_amount: 75_000 });
    const cancelled = gas.cancelPayment_({ payment_id: payment2.id, cancellation_reason: 'اختبار' });
    expect(cancelled.contract_after).toMatchObject({ id: first.id, dismissed_reminder_date: '2026-09-15' });
    expect(gas.listContracts_().find((row) => row.id === first.id)).toMatchObject({ reminder_mode: 'manual', manual_reminder_date: '2026-09-15', manual_due_amount: 75_000 });
    expect(() => gas.updatePayment_({ payment_id: payment2.id, amount: 1, edit_reason: 'ممنوع' })).toThrow('لا يمكن تعديل دفعة ملغاة');

    const changedEnd = gas.updateContract_({ contract_id: first.id, expected_end_date: '2026-12-31' });
    expect(changedEnd).toMatchObject({ installments: 12, expected_end_date: '2026-12-31', reminder_mode: 'manual', manual_reminder_date: '2026-09-15' });
    expect(gas.listContracts_().find((row) => row.id === second.id)).toMatchObject({ paid_amount: secondBefore?.paid_amount, remaining_amount: secondBefore?.remaining_amount });

    expect(gas.restoreReminder_({ contract_id: first.id })).toMatchObject({ dismissed_reminder_date: '' });
    const currentAutomaticDue = gas.listContracts_().find((row) => row.id === first.id)?.next_due_date;
    expect(gas.clearManualReminderDate_({ contract_id: first.id })).toMatchObject({ reminder_mode: 'automatic', manual_reminder_date: '', manual_reminder_anchor_day: '', next_due_date: currentAutomaticDue });
  });
});
