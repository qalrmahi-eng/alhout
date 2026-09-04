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
  canonicalHeader_: (header: unknown) => string;
  readTable_: (name: string) => { sheet: SheetLike; headers: string[]; rows: Record<string, unknown>[] };
  upgradeSheets: () => { plan: { sheet: string; action: string; headers: string[] }[] };
  getDashboard_: () => { customers: unknown[]; contracts: Record<string, unknown>[]; payments: unknown[]; summary: Record<string, number> };
  reportsSummary_: (data: Record<string, unknown>) => Record<string, number | string>;
  addContract_: (data: Record<string, unknown>) => Record<string, unknown>;
  addPayment_: (data: Record<string, unknown>) => Record<string, unknown>;
  cancelPayment_: (data: Record<string, unknown>) => Record<string, unknown>;
  updatePayment_: (data: Record<string, unknown>) => Record<string, unknown>;
  setManualReminderDate_: (data: Record<string, unknown>) => Record<string, unknown>;
  clearManualReminderDate_: (data: Record<string, unknown>) => Record<string, unknown>;
  permanentlyDeleteCustomer_: (data: Record<string, unknown>) => Record<string, unknown>;
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
  'archived', 'created_at', 'updated_at', 'manual_reminder_date',
];
const paymentHeaders = [
  'id', 'customer_id', 'amount', 'payment_date', 'notes', 'created_at', 'contract_id',
  'request_id', 'receipt_number', 'status', 'cancellation_reason', 'cancelled_at',
  'paid_after', 'remaining_after', 'updated_at', 'edited_at', 'edit_reason',
];

describe('ترقية Sheets وسلامة العناوين', () => {
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
});

describe('سيناريو Phase 1 في Apps Script', () => {
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
    expect(first).toMatchObject({ profit_amount: 1_000_000, contract_total: 6_000_000, installment_value: 600_000 });
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
    });

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

    expect(gas.permanentlyDeleteCustomer_({ customer_id: 15 })).toEqual({
      customer_id: 15,
      deleted_customers: 1,
      deleted_contracts: 2,
      deleted_payments: 4,
    });
    expect(gas.readTable_('customers').rows.filter((row) => row.id !== '')).toHaveLength(0);
    expect(gas.listContracts_()).toHaveLength(0);
    expect(gas.listPayments_()).toHaveLength(0);
    expect(gas.readTable_('settings').rows).toHaveLength(1);
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
    expect(gas.setManualReminderDate_({ contract_id: first.id, manual_reminder_date: '2026-09-15' })).toMatchObject({ manual_reminder_date: '2026-09-15', next_due_date: automaticDue });
    expect(gas.clearManualReminderDate_({ contract_id: first.id })).toMatchObject({ manual_reminder_date: '', next_due_date: automaticDue });

    const edited = gas.updatePayment_({ payment_id: payment1.id, amount: 150_000, payment_date: '2026-02-01', notes: 'تصحيح', edit_reason: 'خطأ إدخال' });
    expect(edited).toMatchObject({ amount: 150_000, payment_date: '2026-02-01', notes: 'تصحيح', edit_reason: 'خطأ إدخال', paid_after: 150_000, remaining_after: 950_000 });
    const after = gas.listPayments_();
    expect(after.find((row) => row.id === payment2.id)).toMatchObject({ paid_after: 350_000, remaining_after: 750_000 });
    expect(after.find((row) => row.id === payment3.id)).toMatchObject({ paid_after: 650_000, remaining_after: 450_000 });
    expect(gas.listContracts_().find((row) => row.id === first.id)).toMatchObject({ paid_amount: 650_000, remaining_amount: 450_000 });
    expect(gas.listContracts_().find((row) => row.id === second.id)).toMatchObject({ paid_amount: secondBefore?.paid_amount, remaining_amount: secondBefore?.remaining_amount });
    expect(gas.reportsSummary_({ from: '2026-01-01', to: '2026-01-31' })).toMatchObject({ received_amount: 0, payments_count: 0 });
    expect(gas.reportsSummary_({ from: '2026-02-01', to: '2026-02-28' })).toMatchObject({ received_amount: 450_000, payments_count: 3 });
    expect(() => gas.updatePayment_({ payment_id: payment1.id, amount: 900_000, edit_reason: 'قيمة غير صحيحة' })).toThrow('أكبر من إجمالي العقد');

    gas.cancelPayment_({ payment_id: payment2.id, cancellation_reason: 'اختبار' });
    expect(() => gas.updatePayment_({ payment_id: payment2.id, amount: 1, edit_reason: 'ممنوع' })).toThrow('لا يمكن تعديل دفعة ملغاة');
  });
});
