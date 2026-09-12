'use client';

import type { ReactNode } from 'react';
import { Archive, ArrowRight, CalendarClock, MessageCircle, Pencil, Printer, RotateCcw, Trash2, WalletCards } from 'lucide-react';
import { EmptyState, StatusBadge } from '@/components/business-ui';
import { formatBaghdadDateTime } from '@/lib/dates';
import { formatContractNumber, formatDate, formatIqd } from '@/lib/formatters';
import { buildWhatsAppUrl } from '@/lib/whatsapp';
import { effectiveDueDate, reminderMode } from '@/lib/due-date';
import type { ContractView, Payment } from '@/types/domain';

type Props = {
  contract: ContractView;
  payments: Payment[];
  today: string;
  onBack: () => void;
  onPay: () => void;
  onEdit: () => void;
  onReceipt: (payment: Payment) => void;
  onCancel: (payment: Payment) => void;
  onEditPayment: (payment: Payment) => void;
  onArchive: () => void;
  onDelete: () => void;
  onReminder: () => void;
  onWhatsAppError: (message: string) => void;
};

export default function ContractDetails(props: Props) {
  const { contract } = props;
  const progress = contract.summary;
  const sortedPayments = [...props.payments].sort((a, b) => b.payment_date.localeCompare(a.payment_date) || String(b.created_at || '').localeCompare(String(a.created_at || '')) || b.id - a.id);
  function whatsapp() {
    try {
      window.open(buildWhatsAppUrl(contract.customer, contract, props.today), '_blank', 'noopener,noreferrer');
    } catch (error) {
      props.onWhatsAppError(error instanceof Error ? error.message : 'تعذر فتح واتساب');
    }
  }
  return <div className="space-y-5 contract-print-area">
    <button className="text-button no-print" onClick={props.onBack}><ArrowRight size={17} /> العودة إلى العميل</button>
    <section className="panel contract-header-panel">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="eyebrow">تفاصيل العقد</p><div className="flex items-center gap-3"><h2 className="text-2xl font-black" dir="ltr">{formatContractNumber(contract.id)}</h2><StatusBadge status={progress.status} /></div><p className="mt-1 text-slate-500">{contract.customer.name} · {contract.customer.phone || 'بدون هاتف'}</p></div>
        <div className="flex flex-wrap gap-2 no-print">
          <button className="secondary-button compact" onClick={whatsapp} disabled={!effectiveDueDate(contract) || contract.remaining_amount <= 0}><MessageCircle size={16} /> واتساب</button>
          <button className="secondary-button compact" onClick={props.onEdit} disabled={contract.status === 'مؤرشف'}><Pencil size={16} /> تعديل</button>
          <button className="secondary-button compact" onClick={props.onReminder}><CalendarClock size={16} /> {reminderMode(contract) === 'manual' ? 'تعديل موعد التذكير' : 'تحديد موعد التذكير'}</button>
          <button className="secondary-button compact" onClick={props.onArchive}>{contract.status === 'مؤرشف' ? <RotateCcw size={16} /> : <Archive size={16} />}{contract.status === 'مؤرشف' ? 'استرجاع' : 'أرشفة'}</button>
          <button className="danger-button compact" onClick={props.onDelete}><Trash2 size={16} /> حذف العقد</button>
          <button className="primary-button compact" onClick={props.onPay} disabled={['مكتمل', 'مؤرشف'].includes(progress.status)}><WalletCards size={16} /> إضافة دفعة</button>
        </div>
      </div>
      <div className="financial-summary-grid">
        <Metric label="المبلغ المسلم" value={formatIqd(contract.principal)} />
        <Metric label="إجمالي العقد" value={formatIqd(contract.contract_total)} />
        <Metric label="المدفوع" value={formatIqd(contract.paid_amount)} />
        <Metric label="المتبقي" value={formatIqd(contract.remaining_amount)} accent />
        <Metric label="قيمة القسط" value={formatIqd(contract.installment_value)} />
        <Metric label="الاستحقاق القادم" value={formatDate(contract.next_due_date)} />
      </div>
    </section>

    <div className="detail-columns">
      <section className="panel">
        <h3 className="section-heading">تقدم الأقساط</h3>
        <div className="progress-meta"><span>{progress.completedInstallments} من {contract.installments} أقساط مكتملة</span><strong>{Math.round((progress.paidAmount / Math.max(progress.contractTotal, 1)) * 100)}%</strong></div>
        <div className="progress-track"><i style={{ width: `${Math.min(100, progress.paidAmount / Math.max(progress.contractTotal, 1) * 100)}%` }} /></div>
        <div className="payment-summary mt-4"><div><small>القسط الحالي</small><strong>{formatIqd(progress.currentInstallmentPaid)} / {formatIqd(progress.currentInstallmentPaid + progress.currentInstallmentRemaining)}</strong></div><div><small>المتبقي منه</small><strong>{formatIqd(progress.currentInstallmentRemaining)}</strong></div></div>
      </section>
      <section className="panel">
        <h3 className="section-heading">بيانات العقد</h3>
        <div className="info-list">
          <Info label="تاريخ التسليم" value={formatDate(contract.delivery_date)} />
          <Info label="أول استحقاق" value={formatDate(contract.first_due_date)} />
          <Info label="آخر استحقاق متوقع" value={formatDate(contract.expected_end_date)} />
          <Info label="موعد التذكير" value={<span className="reminder-info-value">{formatDate(effectiveDueDate(contract))}{reminderMode(contract) === 'manual' && <em className="muted-badge">تذكير يدوي</em>}</span>} />
          <Info label="نسبة الربح" value={`${contract.profit_percent}%`} />
          <Info label="مبلغ الربح" value={formatIqd(contract.profit_amount)} />
          <Info label="الكفيل" value={contract.guarantor_name || '—'} />
          <Info label="هاتف الكفيل" value={contract.guarantor_phone || '—'} />
          <Info label="الملاحظات" value={contract.notes || '—'} wide />
        </div>
      </section>
    </div>

    <section className="panel overflow-hidden">
      <h3 className="section-heading">جدول الأقساط</h3>
      {reminderMode(contract) === 'manual' && <p className="mt-2 text-xs leading-6 text-amber-700">هذا جدول حسابي داخلي، والمتابعة الفعلية تعتمد موعد التذكير اليدوي.</p>}
      <div className="table-wrap mt-4 max-h-96"><table><thead><tr><th>#</th><th>الاستحقاق</th><th>القيمة</th><th>المدفوع</th><th>المتبقي</th><th>الحالة</th></tr></thead><tbody>{progress.schedule.map((row) => <tr key={row.number}><td>{row.number}</td><td>{formatDate(row.dueDate)}</td><td>{formatIqd(row.amount)}</td><td>{formatIqd(row.paid)}</td><td>{formatIqd(row.remaining)}</td><td><span className="status">{row.status}</span></td></tr>)}</tbody></table></div>
    </section>

    <section className="panel overflow-hidden">
      <div className="flex items-center justify-between"><div><h3 className="section-heading">سجل الدفعات</h3><p className="text-sm text-slate-500">{props.payments.length} عملية محفوظة</p></div><button className="secondary-button compact no-print" onClick={() => window.print()}><Printer size={16} /> طباعة</button></div>
      {props.payments.length ? <><div className="table-wrap mt-4 desktop-payment-table"><table><thead><tr><th>رقم الوصل</th><th>تاريخ الدفع</th><th>المبلغ</th><th>الملاحظة</th><th>الحالة</th><th>إجراء</th></tr></thead><tbody>{sortedPayments.map((payment) => {
        const cancelled = payment.status === 'cancelled';
        return <tr key={payment.id} className={cancelled ? 'cancelled-row' : ''}><td dir="ltr">{payment.receipt_number || `#${payment.id}`}</td><td>{formatDate(payment.payment_date)}</td><td>{formatIqd(payment.amount)}</td><td>{payment.notes || '—'}{payment.edited_at && <small className="block mt-1">معدلة: {payment.edit_reason}</small>}</td><td>{cancelled ? <span><b className="status status-archived">ملغاة</b><small className="block mt-1">{payment.cancellation_reason} · {formatBaghdadDateTime(payment.cancelled_at)}</small></span> : <span className="flex flex-wrap gap-1"><b className="status status-paid">نشطة</b>{payment.edited_at && <b className="status status-today">معدلة</b>}</span>}</td><td><div className="flex gap-2"><button className="mini-button" onClick={() => props.onReceipt(payment)}>الوصل</button>{!cancelled && <><button className="mini-button" onClick={() => props.onEditPayment(payment)}>تعديل</button><button className="mini-button danger" onClick={() => props.onCancel(payment)}>إلغاء</button></>}</div></td></tr>;
      })}</tbody></table></div><div className="mobile-payment-list">{sortedPayments.map((payment) => {
        const cancelled = payment.status === 'cancelled';
        return <article className={cancelled ? 'mobile-payment-card cancelled' : 'mobile-payment-card'} key={payment.id}>
          <header><strong>{formatIqd(payment.amount)}</strong><span className={cancelled ? 'status status-archived' : 'status status-paid'}>{cancelled ? 'ملغاة' : 'نشطة'}</span></header>
          <div><span>{formatDate(payment.payment_date)}</span><b dir="ltr">{payment.receipt_number || `#${payment.id}`}</b></div>
          {payment.notes && <p>{payment.notes}</p>}
          {payment.edited_at && <p>معدلة: {payment.edit_reason}</p>}
          {cancelled && <p className="late-text">{payment.cancellation_reason} · {formatBaghdadDateTime(payment.cancelled_at)}</p>}
          <footer className="no-print"><button className="mini-button" onClick={() => props.onReceipt(payment)}>عرض الوصل</button>{!cancelled && <><button className="mini-button" onClick={() => props.onEditPayment(payment)}>تعديل</button><button className="mini-button danger" onClick={() => props.onCancel(payment)}>إلغاء الدفعة</button></>}</footer>
        </article>;
      })}</div></> : <EmptyState text="لا توجد دفعات لهذا العقد بعد." />}
    </section>
  </div>;
}

function Metric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return <div className={accent ? 'financial-metric accent' : 'financial-metric'}><small>{label}</small><strong>{value}</strong></div>;
}

function Info({ label, value, wide = false }: { label: string; value: ReactNode; wide?: boolean }) {
  return <div className={wide ? 'info-wide' : ''}><span>{label}</span><strong>{value}</strong></div>;
}
