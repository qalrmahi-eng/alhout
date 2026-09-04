'use client';

import { ArrowRight, CalendarClock, Phone, Plus, Search, Settings, Trash2, WalletCards } from 'lucide-react';
import { EmptyState, StatusBadge } from '@/components/business-ui';
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
  onAddContract: (customer: Customer) => void;
  onOpenContract: (contract: ContractView) => void;
  onPay: (contract: ContractView) => void;
};

function overallStatus(contracts: ContractView[]): ContractStatus | null {
  if (!contracts.length) return null;
  if (contracts.some((contract) => contract.summary.status === 'متأخر')) return 'متأخر';
  if (contracts.some((contract) => contract.summary.status === 'مستحق اليوم')) return 'مستحق اليوم';
  if (contracts.some((contract) => contract.summary.status === 'منتظم')) return 'منتظم';
  if (contracts.every((contract) => contract.summary.status === 'مكتمل')) return 'مكتمل';
  return 'مؤرشف';
}

export default function CustomerWorkspace(props: Props) {
  const contractsByCustomer = new Map<number, ContractView[]>();
  props.contracts.forEach((contract) => {
    const rows = contractsByCustomer.get(contract.customer_id);
    if (rows) rows.push(contract);
    else contractsByCustomer.set(contract.customer_id, [contract]);
  });

  const selected = props.customers.find((customer) => customer.id === props.selectedCustomerId);
  if (selected) {
    const contracts = contractsByCustomer.get(selected.id) || [];
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
              <button className="secondary-button compact" onClick={() => props.onEditCustomer(selected)}><Settings size={16} /> تعديل العميل</button>
              <button className="primary-button compact" onClick={() => props.onAddContract(selected)}><Plus size={16} /> إضافة عقد</button>
              <button className="danger-button compact" onClick={() => props.onDeleteCustomer(selected)}><Trash2 size={16} /> حذف العميل</button>
            </div>
          </div>
          <div className="profile-meta">
            <span><small>العنوان</small><strong>{selected.address || '—'}</strong></span>
            <span><small>الملاحظات</small><strong>{selected.notes || '—'}</strong></span>
            <span><small>عدد العقود</small><strong>{contracts.length}</strong></span>
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-end justify-between"><div><h2 className="section-heading">العقود</h2><p className="text-sm text-slate-500">كل عقد مستقل في دفعاته ورصيده.</p></div></div>
          {contracts.length ? <div className="contract-grid">{contracts.map((contract) => (
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
          ))}</div> : <div className="panel"><EmptyState text="لا توجد عقود لهذا العميل بعد." action={<button className="primary-button compact" onClick={() => props.onAddContract(selected)}><Plus size={16} /> إضافة عقد</button>} /></div>}
        </section>
      </div>
    );
  }

  const filtered = props.customers.filter((customer) => customerMatchesSearch(customer, props.query));
  return (
    <div className="space-y-5">
      <div className="panel filter-panel"><label className="search-box"><Search size={18} /><input value={props.query} onChange={(event) => props.onQuery(event.target.value)} placeholder="ابحث بالاسم أو الهاتف..." /></label></div>
      {filtered.length ? <div className="customer-list">{filtered.map((customer) => {
        const contracts = contractsByCustomer.get(customer.id) || [];
        const active = contracts.filter((contract) => !['مكتمل', 'مؤرشف'].includes(contract.summary.status));
        const principal = contracts.reduce((sum, contract) => sum + contract.principal, 0);
        const remaining = active.reduce((sum, contract) => sum + contract.remaining_amount, 0);
        const status = overallStatus(contracts);
        return <button className="customer-list-row" key={customer.id} onClick={() => props.onSelectCustomer(customer.id)}>
          <span className="avatar">{customerAvatar(customer.name)}</span>
          <span className="customer-list-identity"><strong>{customer.name}</strong><small>{customer.phone || 'بدون هاتف'}</small></span>
          <span><small>العقود</small><strong>{contracts.length} / {active.length} نشط</strong></span>
          <span><small>المبالغ المسلمة</small><strong>{formatIqd(principal)}</strong></span>
          <span><small>المتبقي</small><strong>{formatIqd(remaining)}</strong></span>
          <span>{status ? <StatusBadge status={status} /> : <em className="muted-badge">بلا عقود</em>}</span>
          {customer.phone && <Phone size={17} className="text-slate-400" />}
        </button>;
      })}</div> : <div className="panel"><EmptyState text="لا توجد نتائج مطابقة." /></div>}
    </div>
  );
}
