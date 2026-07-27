import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

type SheetLike = {
  getName: () => string;
  getLastColumn: () => number;
  getRange: (
    row: number,
    column: number,
    rows: number,
    columns: number,
  ) => {
    getValues: () => unknown[][];
    setValues: (values: unknown[][]) => void;
  };
  getDataRange: () => { getValues: () => unknown[][] };
  appendRow: (values: unknown[]) => void;
};

type GasRuntime = {
  canonicalHeader_: (header: unknown) => string;
  readHeaders_: (sheet: SheetLike) => string[];
  readTable_: (name: string) => {
    sheet: SheetLike;
    headers: string[];
    rawHeaders: string[];
    rows: Record<string, unknown>[];
  };
  writeObjectRow_: (
    table: { sheet: SheetLike; headers: string[] },
    rowNumber: number,
    object: Record<string, unknown>,
  ) => void;
  appendObject_: (name: string, object: Record<string, unknown>) => void;
  upgradeSheets: (options?: { dryRun?: boolean }) => {
    ok: boolean;
    dry_run: boolean;
    plan: { sheet: string; action: string; headers: string[] }[];
  };
  applySheetsUpgrade: () => unknown;
  getDashboard_: () => {
    settings: Record<string, unknown>;
    customers: Record<string, unknown>[];
    payments: Record<string, unknown>[];
  };
  addCustomer_: (data: Record<string, unknown>) => Record<string, unknown>;
  updateCustomer_: (data: Record<string, unknown>) => Record<string, unknown>;
  listCustomers_: (
    payments?: Record<string, unknown>[],
  ) => Record<string, unknown>[];
};

function fakeSheet(name: string, headers: string[], rows: unknown[][] = []) {
  const data = [headers.slice(), ...rows.map((row) => row.slice())];
  const writtenRows: unknown[][] = [];
  const appendedRows: unknown[][] = [];
  const sheet: SheetLike = {
    getName: () => name,
    getLastColumn: () => data[0]?.length || 0,
    getRange: (row, column, rowCount, columnCount) => ({
      getValues: () =>
        data
          .slice(row - 1, row - 1 + rowCount)
          .map((values) => values.slice(column - 1, column - 1 + columnCount)),
      setValues: (values) => {
        values.forEach((valuesRow, rowOffset) => {
          const targetRow = row - 1 + rowOffset;
          if (!data[targetRow]) data[targetRow] = [];
          valuesRow.forEach((value, columnOffset) => {
            data[targetRow][column - 1 + columnOffset] = value;
          });
          writtenRows.push(valuesRow.slice());
        });
      },
    }),
    getDataRange: () => ({ getValues: () => data.map((row) => row.slice()) }),
    appendRow: (values) => {
      appendedRows.push(values.slice());
      data.push(values.slice());
    },
  };
  return { sheet, writtenRows, appendedRows, data };
}

function formatDate(
  value: Date,
  timeZone: string,
  pattern: string,
): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value);
  const fields = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const date = `${fields.year}-${fields.month}-${fields.day}`;
  return pattern === 'yyyy-MM-dd'
    ? date
    : `${date}T${fields.hour}:${fields.minute}:${fields.second}`;
}

function loadAppsScript(sheets: Record<string, SheetLike> = {}) {
  const source = readFileSync('google-apps-script/Code.gs', 'utf8');
  const spreadsheet = {
    getSheetByName: (name: string) => sheets[name] || null,
  };
  const properties = new Map<string, string>();
  const context = createContext({
    console,
    SpreadsheetApp: {
      getActiveSpreadsheet: () => spreadsheet,
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (key: string) => properties.get(key) || null,
        setProperty: (key: string, value: string) => {
          properties.set(key, value);
        },
      }),
    },
    Utilities: {
      formatDate,
      getUuid: () => '00000000-0000-4000-8000-000000000001',
    },
  });
  runInContext(source, context, { filename: 'Code.gs' });
  return context as unknown as GasRuntime;
}

const customerHeaders = [
  'id',
  'name',
  'phone',
  'principal',
  'profit_percent',
  'installments',
  'paid_installments',
  'start_date',
  'notes',
  'status',
  'created_at',
  'address',
  'guarantor_name',
  'guarantor_phone',
  'profit_amount',
  'contract_total',
  'installment_type',
  'delivery_date',
  'first_due_date',
  'expected_end_date',
  'installment_value',
  'paid_amount',
  'remaining_amount',
  'current_installment_paid',
  'current_installment_remaining',
  'next_due_date',
  'archived',
  'updated_at',
];

function rowFromObject(
  headers: string[],
  object: Record<string, unknown>,
): unknown[] {
  return headers.map((header) => object[header] ?? '');
}

describe('تطبيع عناوين Google Sheets', () => {
  it('يطبع المسافات وNBSP وBOM والمحارف الصفرية وعلامات الاتجاه والحالة', () => {
    const gas = loadAppsScript();
    expect(gas.canonicalHeader_('customer_id')).toBe('customer_id');
    expect(gas.canonicalHeader_('\u00A0\u00A0CUSTOMER_ID\u00A0')).toBe('customer_id');
    expect(gas.canonicalHeader_('\uFEFFcustomer_id')).toBe('customer_id');
    expect(gas.canonicalHeader_('\u061C\u200Ecustomer_id\u200F\u202C')).toBe('customer_id');
    expect(gas.canonicalHeader_('payment_\u200Bdate')).toBe('payment_date');
    expect(gas.canonicalHeader_('  Payment   Date  ')).toBe('payment date');
  });

  it('يقرأ العناوين غير القياسية كمفاتيح canonical ويحافظ على ترتيب الكتابة', () => {
    const headers = [
      'id',
      '\uFEFF\u200FCUSTOMER_ID\u00A0',
      'amount',
      'payment_\u200Bdate',
      'notes',
      'created_at',
    ];
    const fixture = fakeSheet('payments', headers, [
      [1, 27, 40_000, '2026-07-26', 'دفعة اختبار', '2026-07-26T10:00:00'],
    ]);
    const gas = loadAppsScript({ payments: fixture.sheet });
    const table = gas.readTable_('payments');

    expect(table.headers).toEqual([
      'id',
      'customer_id',
      'amount',
      'payment_date',
      'notes',
      'created_at',
    ]);
    expect(table.rawHeaders).toEqual(headers);
    expect(table.rows[0]).toMatchObject({
      id: 1,
      customer_id: 27,
      payment_date: '2026-07-26',
    });

    gas.writeObjectRow_(table, 2, {
      ID: 2,
      '\u200ECUSTOMER_ID': 31,
      amount: 50_000,
      '\uFEFFpayment_date': '2026-07-27',
      notes: 'قيمة جديدة',
      created_at: '2026-07-27T10:00:00',
    });
    expect(fixture.writtenRows[0]).toEqual([
      2,
      31,
      50_000,
      '2026-07-27',
      'قيمة جديدة',
      '2026-07-27T10:00:00',
    ]);

    gas.appendObject_('payments', {
      id: 3,
      '\u00A0customer_id\u00A0': 32,
      amount: 60_000,
      'payment_\u200Bdate': '2026-07-28',
      notes: '',
      created_at: '2026-07-28T10:00:00',
    });
    expect(fixture.appendedRows[0]).toEqual([
      3,
      32,
      60_000,
      '2026-07-28',
      '',
      '2026-07-28T10:00:00',
    ]);
  });

  it('تضيف خطة payments القديمة الأعمدة الجديدة فقط', () => {
    const fixture = fakeSheet('payments', [
      '\uFEFFid',
      '\u00A0CUSTOMER_ID\u00A0',
      'amount',
      '\u200Fpayment_\u200Edate\u200B',
      'notes',
      'created_at',
    ]);
    const gas = loadAppsScript({ payments: fixture.sheet });
    const result = gas.upgradeSheets();
    const paymentsPlan = result.plan.find((item) => item.sheet === 'payments');

    expect(paymentsPlan).toEqual({
      sheet: 'payments',
      action: 'append_headers',
      headers: [
        'request_id',
        'receipt_number',
        'status',
        'cancellation_reason',
        'cancelled_at',
        'updated_at',
      ],
    });
    expect(paymentsPlan?.headers).not.toContain('customer_id');
    expect(paymentsPlan?.headers).not.toContain('payment_date');
  });

  it('يوقف الترقية عند تكرار عنوان بعد التطبيع', () => {
    const fixture = fakeSheet('payments', [
      'id',
      'customer_id',
      '\u200F\u00A0CUSTOMER_ID\u00A0',
      'amount',
      'payment_date',
      'notes',
      'created_at',
    ]);
    const gas = loadAppsScript({ payments: fixture.sheet });

    expect(() => gas.upgradeSheets()).toThrowError(
      /عناوين مكررة بعد التطبيع في ورقة "payments".*"customer_id" في العمودين 2 و3/,
    );
  });

  it('يوفر دالة التطبيق الرسمية', () => {
    const gas = loadAppsScript();
    expect(typeof gas.applySheetsUpgrade).toBe('function');
  });

  it('يقرأ payments مرة واحدة عند تحميل dashboard', () => {
    const settings = fakeSheet('settings', ['id'], [[1]]);
    const customers = fakeSheet('customers', ['id']);
    const payments = fakeSheet('payments', ['id']);
    const gas = loadAppsScript({
      settings: settings.sheet,
      customers: customers.sheet,
      payments: payments.sheet,
    });
    const originalReadTable = gas.readTable_;
    let paymentReads = 0;
    gas.readTable_ = (name: string) => {
      if (name === 'payments') paymentReads += 1;
      return originalReadTable(name);
    };

    const dashboard = gas.getDashboard_();

    expect(paymentReads).toBe(1);
    expect(dashboard).toMatchObject({
      settings: { id: 1 },
      customers: [],
      payments: [],
    });
  });
});

describe('إدارة تواريخ العملاء في Apps Script', () => {
  it('ينشئ العميل بالتاريخين المستقلين والطابعين الزمنيين مهما تغير ترتيب الأعمدة', () => {
    const reorderedHeaders = [
      'first_due_date',
      ...customerHeaders.filter(
        (header) =>
          header !== 'first_due_date' && header !== 'delivery_date',
      ),
      'delivery_date',
    ];
    const customers = fakeSheet('customers', reorderedHeaders);
    const gas = loadAppsScript({ customers: customers.sheet });

    const created = gas.addCustomer_({
      name: 'عميل اختبار',
      phone: '07700000000',
      principal: 1_000_000,
      profit_percent: 10,
      installments: 10,
      installment_type: 'monthly',
      delivery_date: '2026-07-27',
      first_due_date: '2026-08-10',
    });

    const appended = customers.appendedRows[0];
    expect(appended[reorderedHeaders.indexOf('delivery_date')]).toBe(
      '2026-07-27',
    );
    expect(appended[reorderedHeaders.indexOf('first_due_date')]).toBe(
      '2026-08-10',
    );
    expect(appended[reorderedHeaders.indexOf('start_date')]).toBe(
      '2026-07-27',
    );
    expect(appended[reorderedHeaders.indexOf('created_at')]).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/,
    );
    expect(appended[reorderedHeaders.indexOf('updated_at')]).toBe(
      appended[reorderedHeaders.indexOf('created_at')],
    );
    expect(created).toMatchObject({
      delivery_date: '2026-07-27',
      first_due_date: '2026-08-10',
    });
  });

  it('تطبع قراءة العميل كائنات Date إلى قيم بغداد وتعيد الحقول الأربعة', () => {
    const customers = fakeSheet('customers', customerHeaders, [
      rowFromObject(customerHeaders, {
        id: 1,
        name: 'عميل اختبار',
        phone: '07700000000',
        principal: 1_000_000,
        profit_percent: 10,
        installments: 10,
        installment_type: 'monthly',
        start_date: new Date('2026-07-26T21:00:00.000Z'),
        delivery_date: new Date('2026-07-26T21:00:00.000Z'),
        first_due_date: new Date('2026-08-09T21:00:00.000Z'),
        created_at: new Date('2026-07-27T12:45:00.000Z'),
        updated_at: new Date('2026-07-28T13:30:00.000Z'),
      }),
    ]);
    const gas = loadAppsScript({ customers: customers.sheet });

    const [customer] = gas.listCustomers_([]);

    expect(customer).toMatchObject({
      start_date: '2026-07-27',
      delivery_date: '2026-07-27',
      first_due_date: '2026-08-10',
      created_at: '2026-07-27T15:45:00',
      updated_at: '2026-07-28T16:30:00',
    });
  });

  it('يحافظ على التواريخ وcreated_at عند تعديل الاسم فقط أو وصول قيمة فارغة', () => {
    const original = {
      id: 1,
      name: 'الاسم القديم',
      phone: '07700000000',
      principal: 1_000_000,
      profit_percent: 10,
      installments: 10,
      installment_type: 'monthly',
      start_date: '2026-07-27',
      delivery_date: '2026-07-27',
      first_due_date: '2026-08-10',
      created_at: '2026-07-27T10:00:00',
      updated_at: '2026-07-27T10:00:00',
      archived: false,
    };
    const customers = fakeSheet('customers', customerHeaders, [
      rowFromObject(customerHeaders, original),
    ]);
    const payments = fakeSheet('payments', [
      'id',
      'customer_id',
      'amount',
      'payment_date',
      'notes',
      'created_at',
      'status',
    ]);
    const gas = loadAppsScript({
      customers: customers.sheet,
      payments: payments.sheet,
    });

    const updated = gas.updateCustomer_({
      customer_id: 1,
      name: 'الاسم الجديد',
      delivery_date: '',
      first_due_date: undefined,
    });

    expect(updated).toMatchObject({
      name: 'الاسم الجديد',
      delivery_date: '2026-07-27',
      first_due_date: '2026-08-10',
      created_at: '2026-07-27T10:00:00',
    });
    expect(updated.updated_at).not.toBe(original.updated_at);
  });

  it('يرفض تاريخا غير صالح قبل كتابة الصف ولا يفسد البيانات', () => {
    const original = {
      id: 1,
      name: 'عميل اختبار',
      phone: '07700000000',
      principal: 1_000_000,
      profit_percent: 10,
      installments: 10,
      installment_type: 'monthly',
      delivery_date: '2026-07-27',
      first_due_date: '2026-08-10',
      created_at: '2026-07-27T10:00:00',
    };
    const customers = fakeSheet('customers', customerHeaders, [
      rowFromObject(customerHeaders, original),
    ]);
    const gas = loadAppsScript({ customers: customers.sheet });

    expect(() =>
      gas.updateCustomer_({
        customer_id: 1,
        delivery_date: '2026-02-30',
      }),
    ).toThrowError(/تاريخ تسليم المبلغ غير صالح/);
    expect(customers.writtenRows).toHaveLength(0);
    expect(customers.data[1]).toEqual(rowFromObject(customerHeaders, original));
  });
});
