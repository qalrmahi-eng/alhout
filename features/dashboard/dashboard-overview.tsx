'use client';

import { CalendarClock, CircleDollarSign, FileText, TrendingUp, UsersRound, WalletCards } from 'lucide-react';
import { EmptyState, PanelTitle, StatusBadge } from '@/components/business-ui';
import { formatContractNumber, formatDate, formatIqd } from '@/lib/formatters';
import { differenceInCalendarDays } from '@/lib/whatsapp';
import type { ContractView, DashboardSummary, Payment } from '@/types/domain';

type Props = {
  summary: DashboardSummary;
  contracts: ContractView[];
  payments: Payment[];
  today: string;
  onPay: (contract: ContractView) => void;
  onNavigate: (section: 'customers' | 'reminders' | 'payments') => void;
};

export default function DashboardOverview(props: Props) {
  const primary = [
    ['إجمالي المبالغ المسلمة', props.summary.total_principal, CircleDollarSign, 'navy'],
    ['إجمالي قيمة العقود', props.summary.total_contract_value, FileText, 'cyan'],
    ['إجمالي المبالغ المستلمة', props.summary.total_received, WalletCards, 'teal'],
    ['إجمالي المبالغ المتبقية', props.summary.total_remaining, CalendarClock, 'amber'],
    ['الأرباح المتوقعة', props.summary.total_expected_profit, TrendingUp, 'navy'],
  ] as const;
  const dueToday = props.contracts.filter((contract) => contract.status === 'مستحق اليوم').slice(0, 5);
  const overdue = props.contracts.filter((contract) => contract.status === 'متأخر').slice(0, 5);
  const upcoming = props.contracts.filter((contract) => {
    if (!contract.next_due_date || ['مكتمل', 'مؤرشف'].includes(contract.status)) return false;
    const days = differenceInCalendarDays(contract.next_due_date, props.today);
    return days > 0 && days <= 7;
  }).sort((a, b) => String(a.next_due_date).localeCompare(String(b.next_due_date))).slice(0, 5);
  const contractsById = new Map(props.contracts.map((contract) => [contract.id, contract]));
  const recentPayments = [...props.payments].filter((payment) => payment.status !== 'cancelled').reverse().slice(0, 6);

  return <div className="space-y-6">
    <section className="dashboard-brief">
      <div><p className="eyebrow">الوضع المالي الآن</p><h2>{formatIqd(props.summary.total_remaining)} متبقية للتحصيل</h2><p>استُلم هذا الشهر {formatIqd(props.summary.received_this_month)}</p></div>
      <div className="dashboard-counters"><span><b>{props.summary.customers_count}</b> عميل</span><span><b>{props.summary.active_contracts_count}</b> عقد نشط</span><span><b>{props.summary.completed_contracts_count}</b> مكتمل</span><span className="late-text"><b>{props.summary.overdue_contracts_count}</b> متأخر</span></div>
    </section>
    <div className="dashboard-money-grid">{primary.map(([label, value, Icon, tone]) => <article className={`stat-card tone-${tone}`} key={label}><span className="stat-icon"><Icon size={20} /></span><small>{label}</small><strong>{formatIqd(value)}</strong></article>)}</div>
    <div className="quick-grid">
      <QuickContracts title="المستحقة اليوم" rows={dueToday} empty="لا توجد أقساط مستحقة اليوم." onPay={props.onPay} onAll={() => props.onNavigate('reminders')} />
      <QuickContracts title="المتأخرون" rows={overdue} empty="لا توجد عقود متأخرة." onPay={props.onPay} onAll={() => props.onNavigate('reminders')} />
      <QuickContracts title="القادمة خلال 7 أيام" rows={upcoming} empty="لا توجد استحقاقات قريبة." onPay={props.onPay} onAll={() => props.onNavigate('reminders')} />
      <section className="panel"><PanelTitle title="آخر الدفعات" subtitle="أحدث العمليات النشطة" icon={WalletCards} /><div className="compact-list">{recentPayments.map((payment) => {
        const contract = contractsById.get(payment.contract_id);
        return <div key={payment.id}><span><strong>{contract?.customer.name || `عميل #${payment.customer_id}`}</strong><small>{formatDate(payment.payment_date)} · {formatContractNumber(payment.contract_id)}</small></span><b>{formatIqd(payment.amount)}</b></div>;
      })}{!recentPayments.length && <EmptyState text="لا توجد دفعات بعد." />}</div><button className="text-button mt-3" onClick={() => props.onNavigate('payments')}>عرض الكل</button></section>
    </div>
  </div>;
}

function QuickContracts({ title, rows, empty, onPay, onAll }: { title: string; rows: ContractView[]; empty: string; onPay: (contract: ContractView) => void; onAll: () => void }) {
  return <section className="panel"><PanelTitle title={title} subtitle={`${rows.length} سجل ظاهر`} icon={UsersRound} /><div className="compact-list">{rows.map((contract) => <div key={contract.id}><span><strong>{contract.customer.name}</strong><small>{formatContractNumber(contract.id)} · {formatDate(contract.next_due_date)}</small></span><StatusBadge status={contract.status} /><button className="mini-button" onClick={() => onPay(contract)}>دفع</button></div>)}{!rows.length && <EmptyState text={empty} />}</div><button className="text-button mt-3" onClick={onAll}>عرض الكل</button></section>;
}
