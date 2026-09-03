'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarRange, FileText, LoaderCircle, Printer, Search } from 'lucide-react';
import { EmptyState, PanelTitle, StatusBadge } from '@/components/business-ui';
import { formatContractNumber, formatDate, formatIqd } from '@/lib/formatters';
import { reportPresetRange, type ReportPreset } from '@/lib/reports';
import { getReportsSummary } from '@/lib/sheets';
import type { ContractView, Customer, Payment, ReportsSummary } from '@/types/domain';

type Props = { customers: Customer[]; contracts: ContractView[]; payments: Payment[]; today: string };

export default function ReportsSection(props: Props) {
  const initial = reportPresetRange('current_month', props.today);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [summary, setSummary] = useState<ReportsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerId, setCustomerId] = useState<number | ''>('');
  const [contractId, setContractId] = useState<number | 'all'>('all');

  useEffect(() => {
    let active = true;
    void getReportsSummary(from, to).then((value) => { if (active) setSummary(value); }).catch((caught) => {
      if (active) { setSummary(null); setError(caught instanceof Error ? caught.message : 'تعذر تحميل التقرير'); }
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [from, to]);

  function preset(value: ReportPreset) {
    const range = reportPresetRange(value, props.today);
    setLoading(true); setError('');
    setFrom(range.from); setTo(range.to);
  }

  const customers = props.customers.filter((customer) => {
    const query = customerSearch.trim().toLowerCase();
    return !query || customer.name.toLowerCase().includes(query) || customer.phone.toLowerCase().includes(query);
  });
  const selectedCustomer = props.customers.find((customer) => customer.id === customerId);
  const customerContracts = props.contracts.filter((contract) => contract.customer_id === customerId);
  const statementContracts = contractId === 'all' ? customerContracts : customerContracts.filter((contract) => contract.id === contractId);
  const paymentsByContract = useMemo(() => {
    const index = new Map<number, Payment[]>();
    props.payments.forEach((payment) => {
      const rows = index.get(payment.contract_id);
      if (rows) rows.push(payment); else index.set(payment.contract_id, [payment]);
    });
    return index;
  }, [props.payments]);

  return <div className="space-y-6">
    <section className="panel">
      <PanelTitle title="تقارير الفترة" subtitle="الحساب حسب تاريخ الدفع وتاريخ تسليم العقد" icon={CalendarRange} />
      <div className="report-toolbar">
        <div className="filter-pills"><button onClick={() => preset('current_month')}>هذا الشهر</button><button onClick={() => preset('previous_month')}>الشهر السابق</button><button onClick={() => preset('current_year')}>هذه السنة</button></div>
        <label className="compact-field"><span>من</span><input type="date" value={from} max={to} onChange={(event) => { setLoading(true); setError(''); setFrom(event.target.value); }} /></label>
        <label className="compact-field"><span>إلى</span><input type="date" value={to} min={from} onChange={(event) => { setLoading(true); setError(''); setTo(event.target.value); }} /></label>
      </div>
      {loading ? <div className="loading-inline"><LoaderCircle className="animate-spin" /> جارٍ حساب التقرير...</div> : error ? <p className="error-banner">{error}</p> : summary && <div className="report-metrics">
        <Metric label="الدفعات المستلمة" value={formatIqd(summary.received_amount)} detail={`${summary.payments_count} دفعة`} />
        <Metric label="العقود الجديدة" value={String(summary.new_contracts_count)} detail={formatIqd(summary.new_contracts_principal)} />
        <Metric label="قيمة العقود الجديدة" value={formatIqd(summary.new_contracts_total)} detail={`ربح ${formatIqd(summary.new_contracts_profit)}`} />
        <Metric label="العقود المكتملة" value={String(summary.completed_contracts_count)} />
        <Metric label="الدفعات الملغاة" value={formatIqd(summary.cancelled_payments_amount)} detail={`${summary.cancelled_payments_count} دفعة`} muted />
      </div>}
    </section>

    <section className="panel statement-section">
      <div className="flex flex-wrap items-center justify-between gap-3"><PanelTitle title="كشف حساب عميل" subtitle="كل العقود أو عقد محدد" icon={FileText} />{selectedCustomer && <button className="secondary-button compact" onClick={() => window.print()}><Printer size={16} /> طباعة / PDF</button>}</div>
      <div className="statement-controls no-print">
        <label className="search-box"><Search size={17} /><input value={customerSearch} onChange={(event) => setCustomerSearch(event.target.value)} placeholder="ابحث عن العميل..." /></label>
        <select value={customerId} onChange={(event) => { setCustomerId(Number(event.target.value) || ''); setContractId('all'); }}><option value="">اختر العميل</option>{customers.map((customer) => <option value={customer.id} key={customer.id}>{customer.name} · {customer.phone}</option>)}</select>
        <select value={contractId} disabled={!selectedCustomer} onChange={(event) => setContractId(event.target.value === 'all' ? 'all' : Number(event.target.value))}><option value="all">كل العقود</option>{customerContracts.map((contract) => <option value={contract.id} key={contract.id}>{formatContractNumber(contract.id)}</option>)}</select>
      </div>
      {selectedCustomer ? <div className="statement-print-area">
        <header className="statement-header"><div><p className="eyebrow">كشف حساب</p><h2>{selectedCustomer.name}</h2><span>{selectedCustomer.phone || 'بدون هاتف'}</span></div><div><small>تاريخ الإصدار</small><strong>{formatDate(props.today)}</strong></div></header>
        {statementContracts.length ? statementContracts.map((contract) => <article className="statement-contract" key={contract.id}>
          <div className="flex items-center justify-between"><h3>{formatContractNumber(contract.id)}</h3><StatusBadge status={contract.summary.status} /></div>
          <div className="statement-summary"><span>المبلغ المسلم <b>{formatIqd(contract.principal)}</b></span><span>الربح <b>{formatIqd(contract.profit_amount)}</b></span><span>إجمالي العقد <b>{formatIqd(contract.contract_total)}</b></span><span>الأقساط <b>{contract.installments} × {formatIqd(contract.installment_value)}</b></span><span>أول استحقاق <b>{formatDate(contract.first_due_date)}</b></span></div>
          <div className="table-wrap"><table><thead><tr><th>التاريخ</th><th>رقم الوصل</th><th>المبلغ</th><th>الحالة</th></tr></thead><tbody>{(paymentsByContract.get(contract.id) || []).map((payment) => <tr key={payment.id} className={payment.status === 'cancelled' ? 'cancelled-row' : ''}><td>{formatDate(payment.payment_date)}</td><td dir="ltr">{payment.receipt_number}</td><td>{formatIqd(payment.amount)}</td><td>{payment.status === 'cancelled' ? 'ملغاة' : 'نشطة'}</td></tr>)}</tbody></table></div>
          <footer><span>إجمالي المدفوع <b>{formatIqd(contract.paid_amount)}</b></span><span>المتبقي <b>{formatIqd(contract.remaining_amount)}</b></span><span>الاستحقاق القادم <b>{formatDate(contract.next_due_date)}</b></span></footer>
        </article>) : <EmptyState text="لا توجد عقود لهذا العميل." />}
      </div> : <EmptyState text="اختر عميلاً لإظهار كشف الحساب." />}
    </section>
  </div>;
}

function Metric({ label, value, detail, muted = false }: { label: string; value: string; detail?: string; muted?: boolean }) {
  return <div className={muted ? 'report-metric muted' : 'report-metric'}><small>{label}</small><strong>{value}</strong>{detail && <span>{detail}</span>}</div>;
}
