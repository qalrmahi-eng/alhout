'use client';

import { useMemo, useState } from 'react';
import { Archive, ArrowRight, CalendarClock, Phone, Plus, RotateCcw, Search, Settings, Trash2, WalletCards } from 'lucide-react';
import { EmptyState, StatusBadge } from '@/components/business-ui';
import {
  buildCustomerPortfolio,
  isArchivedCustomer,
  matchesContractFilter,
  matchesCustomerFilter,
  type CustomerContractFilter,
  type CustomerFilter,
  type CustomerPortfolio,
} from '@/lib/customer-classification';
import { customerAvatar, customerMatchesSearch } from '@/lib/sheets';
import { formatContractNumber, formatDate, formatIqd } from '@/lib/formatters';
import { effectiveDueDate, reminderMode } from '@/lib/due-date';
import type { ContractStatus, ContractView, Customer } from '@/types/domain';

type Props = {
  customers: Customer[];
  contracts: ContractView[];
  query: string;
  selectedCustomerId: number | null;
  onQuery: (value: string) => void;
  onSelectCustomer: (id: number | null) => void;
  onEditCustomer: (customer: Customer) => void;
  onDeleteCustomer: (customer: Customer) => void;
  onArchiveCustomer: (customer: Customer) => void;
  onAddContract: (customer: Customer) => void;
  onOpenContract: (contract: ContractView) => void;
  onPay: (contract: ContractView) => void;
};

const customerFilters: { id: CustomerFilter; label: string }[] = [
  { id: 'all', label: 'الكل' },
  { id: 'balance', label: 'عليهم مبالغ' },
  { id: 'completed', label: 'مكتملون' },
  { id: 'no-contracts', label: 'بدون عقود' },
];

const contractFilters: { id: CustomerContractFilter; label: string }[] = [
  { id: 'all', label: 'الكل' },
  { id: 'active', label: 'الجارية' },
  { id: 'completed', label: 'المكتملة' },
  { id: 'archived', label: 'المؤرشفة' },
];

function overallStatus(portfolio: CustomerPortfolio): ContractStatus | null {
  if (portfolio.active.some((contract) => contract.status === 'متأخر')) return 'متأخر';
  if (portfolio.active.some((contract) => contract.status === 'مستحق اليوم')) return 'مستحق اليوم';
  if (portfolio.active.some((contract) => contract.status === 'منتظم')) return 'منتظم';
  if (portfolio.completed.length) return 'مكتمل';
  return null;
}

export default function CustomerWorkspace(props: Props) {
  const [customerFilter, setCustomerFilter] = useState<CustomerFilter>('all');
  const [contractFilter, setContractFilter] = useState<CustomerContractFilter>('all');
  const contractsByCustomer = useMemo(() => {
    const index = new Map<number, ContractView[]>();
    props.contracts.forEach((contract) => {
      const rows = index.get(contract.customer_id);
      if (rows) rows.push(contract);
      else index.set(contract.customer_id, [contract]);
    });
    return index;
  }, [props.contracts]);
  const portfoliosByCustomer = useMemo(() => new Map(props.customers.map((customer) => [
    customer.id,
    buildCustomerPortfolio(contractsByCustomer.get(customer.id) || []),
  ])), [contractsByCustomer, props.customers]);
  const counts = useMemo(() => ({
    all: props.customers.filter((customer) => matchesCustomerFilter(customer, portfoliosByCustomer.get(customer.id)!, 'all')).length,
    balance: props.customers.filter((customer) => matchesCustomerFilter(customer, portfoliosByCustomer.get(customer.id)!, 'balance')).length,
    completed: props.customers.filter((customer) => matchesCustomerFilter(customer, portfoliosByCustomer.get(customer.id)!, 'completed')).length,
    'no-contracts': props.customers.filter((customer) => matchesCustomerFilter(customer, portfoliosByCustomer.get(customer.id)!, 'no-contracts')).length,
    archived: props.customers.filter((customer) => matchesCustomerFilter(customer, portfoliosByCustomer.get(customer.id)!, 'archived')).length,
  }), [portfoliosByCustomer, props.customers]);
  const selected = props.customers.find((customer) => customer.id === props.selectedCustomerId);
  const selectedContracts = selected ? contractsByCustomer.get(selected.id) || [] : [];
  const selectedPortfolio = selected ? portfoliosByCustomer.get(selected.id)! : null;
  const visibleSelectedContracts = selectedContracts.filter((contract) => matchesContractFilter(contract, contractFilter));
  const filtered = useMemo(() => props.customers.filter((customer) => (
    matchesCustomerFilter(customer, portfoliosByCustomer.get(customer.id)!, customerFilter) &&
    customerMatchesSearch(customer, props.query)
  )), [customerFilter, portfoliosByCustomer, props.customers, props.query]);

  if (selected) {
    return (
      <div className="space-y-5">
        <button className="text-button" onClick={() => props.onSelectCustomer(null)}><ArrowRight size={17} /> العودة إلى العملاء</button>
        <section className="panel customer-profile">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="avatar avatar-large">{customerAvatar(selected.name)}</span>
              <div><h2 className="text-xl font-black">{selected.name}</h2><p className="text-sm text-slate-500">{selected.phone || 'لا يوجد رقم هاتف'}</p></div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="secondary-button compact" onClick={() => props.onEditCustomer(selected)} disabled={Boolean(selected.archived)}><Settings size={16} /> تعديل العميل</button>
              <button className="secondary-button compact" onClick={() => props.onArchiveCustomer(selected)}>{selected.archived ? <RotateCcw size={16} /> : <Archive size={16} />}{selected.archived ? 'استعادة العميل' : 'أرشفة العميل'}</button>
              <button className="primary-button compact" onClick={() => props.onAddContract(selected)} disabled={Boolean(selected.archived)}><Plus size={16} /> إضافة عقد</button>
              <button className="danger-button compact" onClick={() => props.onDeleteCustomer(selected)}><Trash2 size={16} /> حذف العميل</button>
            </div>
          </div>
          <div className="profile-meta">
            <span><small>العنوان</small><strong>{selected.address || '—'}</strong></span>
            <span><small>الملاحظات</small><strong>{selected.notes || '—'}</strong></span>
            <span><small>عدد العقود</small><strong>{selectedContracts.length}</strong></span>
          </div>
        </section>

        <section>
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3"><div><h2 className="section-heading">العقود</h2><p className="text-sm text-slate-500">كل عقد مستقل في دفعاته ورصيده.</p></div><div className="filter-pills contract-filter-tabs">{contractFilters.map((item) => {
            const count = item.id === 'all' ? selectedContracts.length : selectedPortfolio![item.id].length;
            return <button type="button" key={item.id} className={contractFilter === item.id ? 'active' : ''} onClick={() => setContractFilter(item.id)}>{item.label}<b>{count}</b></button>;
          })}</div></div>
          {visibleSelectedContracts.length ? <div className="contract-grid">{visibleSelectedContracts.map((contract) => (
            <article className="contract-card" key={contract.id}>
              <div className="flex items-center justify-between"><strong className="contract-number">{formatContractNumber(contract.id)}</strong><StatusBadge status={contract.summary.status} /></div>
              <div className="contract-money-grid">
                <span><small>المبلغ المسلم</small><strong>{formatIqd(contract.principal)}</strong></span>
                <span><small>إجمالي العقد</small><strong>{formatIqd(contract.contract_total)}</strong></span>
                <span><small>المدفوع</small><strong>{formatIqd(contract.paid_amount)}</strong></span>
                <span><small>المتبقي</small><strong>{formatIqd(contract.remaining_amount)}</strong></span>
              </div>
              <div className="contract-facts"><span>{contract.profit_percent}% ربح</span><span>{contract.installments} شهر</span><span>قسط {formatIqd(contract.installment_value)}</span></div>
              <div className="next-due"><CalendarClock size={16} /><span>موعد المتابعة</span><strong>{formatDate(effectiveDueDate(contract))}</strong>{reminderMode(contract) === 'manual' && <em className="muted-badge">يدوي</em>}</div>
              <div className="card-actions">
                <button className="primary-button compact" disabled={['مكتمل', 'مؤرشف'].includes(contract.status)} onClick={() => props.onPay(contract)}><WalletCards size={16} /> دفعة</button>
                <button className="secondary-button compact" onClick={() => props.onOpenContract(contract)}>تفاصيل العقد</button>
              </div>
            </article>
          ))}</div> : <div className="panel"><EmptyState text={selectedContracts.length ? 'لا توجد عقود ضمن هذا التصنيف.' : 'لا توجد عقود لهذا العميل بعد.'} action={!selectedContracts.length && !isArchivedCustomer(selected) ? <button className="primary-button compact" onClick={() => props.onAddContract(selected)}><Plus size={16} /> إضافة عقد</button> : undefined} /></div>}
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="panel filter-panel customer-filter-panel">
        <label className="search-box"><Search size={18} /><input value={props.query} onChange={(event) => props.onQuery(event.target.value)} placeholder="ابحث بالاسم أو الهاتف..." /></label>
        <div className="filter-pills customer-filter-tabs">{customerFilters.map((item) => <button type="button" key={item.id} className={customerFilter === item.id ? 'active' : ''} onClick={() => setCustomerFilter(item.id)}>{item.label}<b>{counts[item.id]}</b></button>)}</div>
        <button type="button" className={customerFilter === 'archived' ? 'archive-filter-button active' : 'archive-filter-button'} onClick={() => setCustomerFilter(customerFilter === 'archived' ? 'all' : 'archived')}><Archive size={15} /> المؤرشفون <b>{counts.archived}</b></button>
      </div>
      {filtered.length ? <div className="customer-list">{filtered.map((customer) => {
        const portfolio = portfoliosByCustomer.get(customer.id)!;
        const status = overallStatus(portfolio);
        const customerArchived = isArchivedCustomer(customer);
        return <button className="customer-list-row" key={customer.id} onClick={() => props.onSelectCustomer(customer.id)}>
          <span className="avatar">{customerAvatar(customer.name)}</span>
          <span className="customer-list-identity"><strong>{customer.name}</strong><small>{customer.phone || 'بدون هاتف'}</small><em className="mobile-contract-breakdown">{portfolio.active.length} جاري · {portfolio.completed.length} مكتمل · {portfolio.archived.length} مؤرشف</em></span>
          <span><small>العقود</small><strong className="contract-breakdown">{portfolio.active.length} جاري · {portfolio.completed.length} مكتمل · {portfolio.archived.length} مؤرشف</strong></span>
          <span><small>المبالغ المسلمة الحالية</small><strong>{formatIqd(portfolio.currentPrincipal)}</strong></span>
          <span><small>المتبقي</small><strong>{formatIqd(portfolio.remaining)}</strong></span>
          <span className="customer-status-stack">{customerArchived ? <StatusBadge status="مؤرشف" /> : portfolio.archiveOnly ? <em className="muted-badge">أرشيف فقط</em> : status ? <StatusBadge status={status} /> : portfolio.active.length > 0 ? <em className="muted-badge">عليه مبلغ</em> : portfolio.inconsistent.length > 0 ? <em className="muted-badge">تعارض بيانات</em> : <em className="muted-badge">بلا عقود</em>}{portfolio.mixed && !customerArchived && <em className="muted-badge">مختلط</em>}{portfolio.hasStatusMismatch && <em className="muted-badge">تعارض بيانات</em>}</span>
          {customer.phone && <Phone size={17} className="text-slate-400" />}
        </button>;
      })}</div> : <div className="panel"><EmptyState text="لا توجد نتائج مطابقة." /></div>}
    </div>
  );
}
