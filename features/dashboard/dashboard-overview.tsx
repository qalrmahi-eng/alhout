'use client';

import { CalendarClock, CircleDollarSign, FileText, TrendingUp, UsersRound, WalletCards } from 'lucide-react';
import { EmptyState, PanelTitle } from '@/components/business-ui';
import { formatContractNumber, formatDate, formatIqd } from '@/lib/formatters';
import { buildDashboardReminderGroups, type ReminderItem } from '@/lib/reminders';
import type { ContractView, Customer, DashboardSummary, Payment } from '@/types/domain';

type Props = {
  summary: DashboardSummary;
  customers: Customer[];
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
  const reminders = buildDashboardReminderGroups(props.customers, props.contracts, props.today);
  const dueToday = reminders.today.slice(0, 5);
  const overdue = reminders.overdue.slice(0, 5);
  const upcoming = reminders.upcoming.slice(0, 5);
  const contractsById = new Map(props.contracts.map((contract) => [contract.id, contract]));
  const recentPayments = [...props.payments].filter((payment) => payment.status !== 'cancelled').reverse().slice(0, 6);

  return <div className="space-y-6">
    <section className="dashboard-brief">
      <div><p className="eyebrow">الوضع المالي الآن</p><h2>{formatIqd(props.summary.total_remaining)} متبقية للتحصيل</h2><p>استُلم هذا الشهر {formatIqd(props.summary.received_this_month)}</p></div>
      <div className="dashboard-counters"><span><b>{props.summary.customers_count}</b> عميل</span><span><b>{props.summary.active_contracts_count}</b> عقد نشط</span><span><b>{props.summary.completed_contracts_count}</b> مكتمل</span><span className="late-text"><b>{reminders.all.length}</b> تذكير نشط</span></div>
    </section>
    <div className="dashboard-money-grid">{primary.map(([label, value, Icon, tone]) => <article className={`stat-card tone-${tone}`} key={label}><span className="stat-icon"><Icon size={20} /></span><small>{label}</small><strong>{formatIqd(value)}</strong></article>)}</div>
    <div className="quick-grid">
      <QuickReminders title="المستحقة اليوم" rows={dueToday} empty="لا توجد أقساط مستحقة اليوم." onPay={props.onPay} onAll={() => props.onNavigate('reminders')} />
      <QuickReminders title="المتأخرون" rows={overdue} empty="لا توجد عقود متأخرة." onPay={props.onPay} onAll={() => props.onNavigate('reminders')} />
      <QuickReminders title="القادمة ضمن مواعيد التنبيه" rows={upcoming} empty="لا توجد استحقاقات قريبة." onPay={props.onPay} onAll={() => props.onNavigate('reminders')} />
      <section className="panel"><PanelTitle title="آخر الدفعات" subtitle="أحدث العمليات النشطة" icon={WalletCards} /><div className="compact-list">{recentPayments.map((payment) => {
        const contract = contractsById.get(payment.contract_id);
        return <div key={payment.id}><span><strong>{contract?.customer.name || `عميل #${payment.customer_id}`}</strong><small>{formatDate(payment.payment_date)} · {formatContractNumber(payment.contract_id)}</small></span><b>{formatIqd(payment.amount)}</b></div>;
      })}{!recentPayments.length && <EmptyState text="لا توجد دفعات بعد." />}</div><button className="text-button mt-3" onClick={() => props.onNavigate('payments')}>عرض الكل</button></section>
    </div>
  </div>;
}

function QuickReminders({ title, rows, empty, onPay, onAll }: { title: string; rows: ReminderItem<ContractView>[]; empty: string; onPay: (contract: ContractView) => void; onAll: () => void }) {
  return <section className="panel"><PanelTitle title={title} subtitle={`${rows.length} سجل ظاهر`} icon={UsersRound} /><div className="compact-list">{rows.map((reminder) => {
    const timing = reminder.days < 0 ? `متأخر ${Math.abs(reminder.days)} أيام` : reminder.days === 0 ? 'اليوم' : `بعد ${reminder.days} أيام`;
    const statusClass = reminder.days < 0 ? 'status status-late' : reminder.days === 0 ? 'status status-today' : 'status status-regular';
    return <div key={reminder.contract.id}><span><strong>{reminder.customer.name}</strong><small>{formatContractNumber(reminder.contract.id)} · {formatDate(reminder.dueDate)}</small></span><b className={statusClass}>{timing}</b><button className="mini-button" onClick={() => onPay(reminder.contract)}>دفع</button></div>;
  })}{!rows.length && <EmptyState text={empty} />}</div><button className="text-button mt-3" onClick={onAll}>عرض الكل</button></section>;
}
