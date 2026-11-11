import { describe, expect, it } from 'vitest';
import {
  buildCustomerPortfolio,
  matchesContractFilter,
  matchesCustomerFilter,
  type ClassifiableContract,
} from '@/lib/customer-classification';
import { customerMatchesSearch } from '@/lib/sheets';
import type { Customer } from '@/types/domain';

const customer = (archived = false): Customer => ({ id: 1, name: 'محمد', phone: '0770', archived });
const contract = (
  remaining: number,
  options: Partial<ClassifiableContract> = {},
): ClassifiableContract => ({
  principal: 1_000_000,
  remaining_amount: remaining,
  status: remaining === 0 ? 'مكتمل' : 'منتظم',
  archived: false,
  ...options,
});

describe('تصنيف العملاء المشتق من العقود', () => {
  it('يصنف العقد المكتمل والرصيد المتبقي بدقة', () => {
    const completed = buildCustomerPortfolio([contract(0)]);
    const balance = buildCustomerPortfolio([contract(95_000)]);
    expect(matchesCustomerFilter(customer(), completed, 'completed')).toBe(true);
    expect(matchesCustomerFilter(customer(), completed, 'balance')).toBe(false);
    expect(matchesCustomerFilter(customer(), balance, 'balance')).toBe(true);
    expect(matchesCustomerFilter(customer(), balance, 'completed')).toBe(false);
  });

  it('يبقي العميل المختلط ضمن عليهم مبالغ ويعرض توزيع عقوده', () => {
    const portfolio = buildCustomerPortfolio([contract(0), contract(245_000)]);
    expect(portfolio).toMatchObject({ mixed: true, remaining: 245_000 });
    expect(portfolio.active).toHaveLength(1);
    expect(portfolio.completed).toHaveLength(1);
    expect(matchesCustomerFilter(customer(), portfolio, 'balance')).toBe(true);
    expect(matchesCustomerFilter(customer(), portfolio, 'completed')).toBe(false);
  });

  it('يصنف العميل مكتملًا فقط عندما تكتمل كل عقوده الحالية', () => {
    const portfolio = buildCustomerPortfolio([contract(0), contract(0)]);
    expect(matchesCustomerFilter(customer(), portfolio, 'completed')).toBe(true);
  });

  it('يميز بلا عقود عن أرشيف فقط', () => {
    const empty = buildCustomerPortfolio([]);
    const archiveOnly = buildCustomerPortfolio([contract(0, { archived: true, status: 'مؤرشف' })]);
    expect(matchesCustomerFilter(customer(), empty, 'no-contracts')).toBe(true);
    expect(archiveOnly.archiveOnly).toBe(true);
    expect(matchesCustomerFilter(customer(), archiveOnly, 'no-contracts')).toBe(false);
    expect(matchesCustomerFilter(customer(), archiveOnly, 'completed')).toBe(false);
    expect(matchesCustomerFilter(customer(), archiveOnly, 'balance')).toBe(false);
  });

  it('يتجاهل المؤرشف في التصنيف التشغيلي ويحتفظ به في الملخص', () => {
    const portfolio = buildCustomerPortfolio([
      contract(0, { archived: true, status: 'مؤرشف' }),
      contract(120_000),
    ]);
    expect(portfolio.archived).toHaveLength(1);
    expect(portfolio.active).toHaveLength(1);
    expect(matchesCustomerFilter(customer(), portfolio, 'balance')).toBe(true);
  });

  it('يعرض العميل المؤرشف في خيار المؤرشفين فقط', () => {
    const portfolio = buildCustomerPortfolio([contract(100_000)]);
    expect(matchesCustomerFilter(customer(true), portfolio, 'all')).toBe(false);
    expect(matchesCustomerFilter(customer(true), portfolio, 'balance')).toBe(false);
    expect(matchesCustomerFilter(customer(true), portfolio, 'archived')).toBe(true);
  });

  it('ينتقل تلقائياً بين عليهم مبالغ ومكتملين عند تغير remaining', () => {
    const before = buildCustomerPortfolio([contract(20_000)]);
    const after = buildCustomerPortfolio([contract(0)]);
    const reopened = buildCustomerPortfolio([contract(20_000)]);
    expect(matchesCustomerFilter(customer(), before, 'balance')).toBe(true);
    expect(matchesCustomerFilter(customer(), after, 'completed')).toBe(true);
    expect(matchesCustomerFilter(customer(), reopened, 'balance')).toBe(true);
  });

  it('يفلتر عقود العميل دون خلط المؤرشف بالمكتمل', () => {
    const rows = [
      contract(100_000),
      contract(0),
      contract(0, { archived: true, status: 'مؤرشف' }),
    ];
    expect(rows.filter((row) => matchesContractFilter(row, 'active'))).toHaveLength(1);
    expect(rows.filter((row) => matchesContractFilter(row, 'completed'))).toHaveLength(1);
    expect(rows.filter((row) => matchesContractFilter(row, 'archived'))).toHaveLength(1);
  });

  it('يكشف تعارض status مع remaining دون تعديل البيانات', () => {
    expect(buildCustomerPortfolio([contract(100_000, { status: 'مكتمل' })]).hasStatusMismatch).toBe(true);
    expect(buildCustomerPortfolio([contract(0, { status: 'منتظم' })]).hasStatusMismatch).toBe(true);
  });

  it('يجمع فلتر الرصيد مع البحث بالاسم أو الهاتف', () => {
    const customers = [
      { ...customer(), id: 1, name: 'محمد علي', phone: '07701111111' },
      { ...customer(), id: 2, name: 'محمد حسن', phone: '07702222222' },
      { ...customer(), id: 3, name: 'سارة', phone: '07703333333' },
    ];
    const portfolios = new Map([
      [1, buildCustomerPortfolio([contract(95_000)])],
      [2, buildCustomerPortfolio([contract(0)])],
      [3, buildCustomerPortfolio([contract(50_000)])],
    ]);
    const result = customers.filter((row) => (
      matchesCustomerFilter(row, portfolios.get(row.id)!, 'balance') &&
      customerMatchesSearch(row, 'محمد')
    ));
    expect(result.map((row) => row.id)).toEqual([1]);
  });
});
