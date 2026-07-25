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
};

function fakeSheet(name: string, headers: string[], rows: unknown[][] = []) {
  const writtenRows: unknown[][] = [];
  const appendedRows: unknown[][] = [];
  const sheet: SheetLike = {
    getName: () => name,
    getLastColumn: () => headers.length,
    getRange: () => ({
      getValues: () => [headers],
      setValues: (values) => {
        writtenRows.push(...values);
      },
    }),
    getDataRange: () => ({ getValues: () => [headers, ...rows] }),
    appendRow: (values) => {
      appendedRows.push(values);
    },
  };
  return { sheet, writtenRows, appendedRows };
}

function loadAppsScript(sheets: Record<string, SheetLike> = {}) {
  const source = readFileSync('google-apps-script/Code.gs', 'utf8');
  const spreadsheet = {
    getSheetByName: (name: string) => sheets[name] || null,
  };
  const context = createContext({
    console,
    SpreadsheetApp: {
      getActiveSpreadsheet: () => spreadsheet,
    },
  });
  runInContext(source, context, { filename: 'Code.gs' });
  return context as unknown as GasRuntime;
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
});

