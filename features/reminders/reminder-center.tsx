'use client';

import { useMemo, useState } from 'react';
import { BellRing, CalendarSearch, Eye, EyeOff, MessageCircle, WalletCards } from 'lucide-react';
import { EmptyState, PanelTitle } from '@/components/business-ui';
import { formatContractNumber, formatDate, formatIqd } from '@/lib/formatters';
import { buildDismissedReminders, buildReminders, buildRemindersForDate, reminderCategories, type ReminderCategory } from '@/lib/reminders';
import { buildWhatsAppUrl } from '@/lib/whatsapp';
import { reminderMode } from '@/lib/due-date';
import type { ContractView, Customer } from '@/types/domain';

type Props = {
  customers: Customer[];
  contracts: ContractView[];
  today: string;
  onPay: (contract: ContractView) => void;
  onDismiss: (contract: ContractView, dueDate: string) => Promise<void>;
  onRestore: (contract: ContractView) => Promise<void>;
  notify: (message: string, type?: 'success' | 'error') => void;
};

export default function ReminderCenter(props: Props) {
  const reminders = useMemo(() => buildReminders(props.customers, props.contracts, props.today), [props.customers, props.contracts, props.today]);
  const dismissed = useMemo(() => buildDismissedReminders(props.customers, props.contracts, props.today), [props.customers, props.contracts, props.today]);
  const [category, setCategory] = useState<ReminderCategory | 'by_date' | 'dismissed'>('today');
  const [selectedDate, setSelectedDate] = useState(props.today);
  const selectedDateRows = useMemo(() => buildRemindersForDate(props.customers, props.contracts, props.today, selectedDate), [props.customers, props.contracts, props.today, selectedDate]);
  const rows = category === 'by_date'
    ? selectedDateRows
    : category === 'dismissed'
      ? dismissed
      : reminders.filter((reminder) => reminder.category === category);
  const contractsById = new Map(props.contracts.map((contract) => [contract.id, contract]));

  function whatsapp(contract: ContractView) {
    try {
      window.open(buildWhatsAppUrl(contract.customer, contract, props.today), '_blank', 'noopener,noreferrer');
    } catch (error) {
      props.notify(error instanceof Error ? error.message : 'تعذر فتح واتساب', 'error');
    }
  }

  return <div className="space-y-5">
    <section className="panel">
      <PanelTitle title="مركز التذكيرات" subtitle="يعتمد على الاستحقاق الحالي لكل عقد، ولا يعرض الأقساط المدفوعة مقدماً" icon={BellRing} />
      <div className="reminder-tabs">{reminderCategories.map((item) => {
        const count = reminders.filter((reminder) => reminder.category === item.id).length;
        return <button className={category === item.id ? 'active' : ''} onClick={() => setCategory(item.id)} key={item.id}><span>{item.label}</span><b>{count}</b></button>;
      })}<button className={category === 'by_date' ? 'active' : ''} onClick={() => setCategory('by_date')}><span>حسب التاريخ</span><b>{selectedDateRows.length}</b></button><button className={category === 'dismissed' ? 'active' : ''} onClick={() => setCategory('dismissed')}><span>المخفية</span><b>{dismissed.length}</b></button></div>
      {category === 'by_date' && <label className="reminder-date-filter"><CalendarSearch size={18} /><span>اختر تاريخ المتابعة</span><input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} /></label>}
    </section>
    <section className="panel overflow-hidden">
      {rows.length ? <div className="reminder-list">{rows.map((reminder) => {
        const contract = contractsById.get(reminder.contract.id);
        if (!contract) return null;
        const isDismissed = category === 'dismissed';
        const isPartialOverdue = reminder.days < 0 && reminderMode(contract) === 'automatic' && contract.current_installment_paid > 0 && contract.current_installment_remaining > 0;
        const timing = reminder.days < 0 ? `متأخر ${Math.abs(reminder.days)} أيام` : reminder.days === 0 ? 'مستحق اليوم' : reminder.days === 1 ? 'غداً' : `متبقي ${reminder.days} أيام`;
        return <article className="reminder-row" key={`${contract.id}:${reminder.dueDate}`}>
          <div className="reminder-person"><strong>{reminder.customer.name}</strong><a href={`tel:${reminder.customer.phone}`}>{reminder.customer.phone || 'بدون هاتف'}</a></div>
          <div><small>العقد</small><strong dir="ltr">{formatContractNumber(contract.id)}</strong></div>
          <div><small>المطلوب الآن</small><strong>{formatIqd(reminder.amount)}</strong>{isPartialOverdue && <em>متبقي من الاستحقاق: {formatIqd(contract.current_installment_remaining)}</em>}</div>
          <div><small>موعد المتابعة</small><strong>{formatDate(reminder.dueDate)}</strong><em className={reminder.days < 0 ? 'late-text' : ''}>{timing}</em>{reminderMode(contract) === 'manual' && <span className="muted-badge">يدوي</span>}</div>
          <div><small>متبقي العقد</small><strong>{formatIqd(contract.remaining_amount)}</strong></div>
          <div className="reminder-actions">{isDismissed ? <button className="secondary-button compact" onClick={() => void props.onRestore(contract)}><Eye size={16} /> استعادة</button> : <><button className="secondary-button compact" onClick={() => whatsapp(contract)}><MessageCircle size={16} /> واتساب</button><button className="secondary-button compact" onClick={() => void props.onDismiss(contract, reminder.dueDate)}><EyeOff size={16} /> إخفاء</button><button className="primary-button compact" onClick={() => props.onPay(contract)}><WalletCards size={16} /> دفعة</button></>}</div>
        </article>;
      })}</div> : <EmptyState text="لا توجد عقود في هذا التصنيف." />}
    </section>
  </div>;
}
