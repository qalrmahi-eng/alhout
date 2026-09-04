'use client';

import { useMemo, useState } from 'react';
import { BellRing, CalendarSearch, MessageCircle, WalletCards } from 'lucide-react';
import { EmptyState, PanelTitle } from '@/components/business-ui';
import { formatContractNumber, formatDate, formatIqd } from '@/lib/formatters';
import { buildReminders, buildRemindersForDate, reminderCategories, type ReminderCategory } from '@/lib/reminders';
import { buildWhatsAppUrl } from '@/lib/whatsapp';
import { reminderMode } from '@/lib/due-date';
import type { ContractView, Customer } from '@/types/domain';

type Props = {
  customers: Customer[];
  contracts: ContractView[];
  today: string;
  onPay: (contract: ContractView) => void;
  notify: (message: string, type?: 'success' | 'error') => void;
};

export default function ReminderCenter(props: Props) {
  const reminders = useMemo(() => buildReminders(props.customers, props.contracts, props.today), [props.customers, props.contracts, props.today]);
  const [category, setCategory] = useState<ReminderCategory | 'by_date'>('today');
  const [selectedDate, setSelectedDate] = useState(props.today);
  const selectedDateRows = useMemo(() => buildRemindersForDate(props.customers, props.contracts, props.today, selectedDate), [props.customers, props.contracts, props.today, selectedDate]);
  const rows = category === 'by_date' ? selectedDateRows : reminders.filter((reminder) => reminder.category === category);
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
      })}<button className={category === 'by_date' ? 'active' : ''} onClick={() => setCategory('by_date')}><span>حسب التاريخ</span><b>{selectedDateRows.length}</b></button></div>
      {category === 'by_date' && <label className="reminder-date-filter"><CalendarSearch size={18} /><span>اختر تاريخ المتابعة</span><input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} /></label>}
    </section>
    <section className="panel overflow-hidden">
      {rows.length ? <div className="reminder-list">{rows.map((reminder) => {
        const contract = contractsById.get(reminder.contract.id);
        if (!contract) return null;
        const timing = reminder.days < 0 ? `متأخر ${Math.abs(reminder.days)} أيام` : reminder.days === 0 ? 'مستحق اليوم' : reminder.days === 1 ? 'غداً' : `متبقي ${reminder.days} أيام`;
        return <article className="reminder-row" key={contract.id}>
          <div className="reminder-person"><strong>{reminder.customer.name}</strong><a href={`tel:${reminder.customer.phone}`}>{reminder.customer.phone || 'بدون هاتف'}</a></div>
          <div><small>العقد</small><strong dir="ltr">{formatContractNumber(contract.id)}</strong></div>
          <div><small>المطلوب الآن</small><strong>{formatIqd(reminder.amount)}</strong></div>
          <div><small>موعد المتابعة</small><strong>{formatDate(reminder.dueDate)}</strong><em className={reminder.days < 0 ? 'late-text' : ''}>{timing}</em>{reminderMode(contract) === 'manual' && <span className="muted-badge">يدوي</span>}</div>
          <div><small>متبقي العقد</small><strong>{formatIqd(contract.remaining_amount)}</strong></div>
          <div className="reminder-actions"><button className="secondary-button compact" onClick={() => whatsapp(contract)}><MessageCircle size={16} /> واتساب</button><button className="primary-button compact" onClick={() => props.onPay(contract)}><WalletCards size={16} /> دفعة</button></div>
        </article>;
      })}</div> : <EmptyState text="لا توجد عقود في هذا التصنيف." />}
    </section>
  </div>;
}
