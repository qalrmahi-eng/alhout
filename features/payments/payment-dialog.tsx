'use client';

import { FormEvent, useMemo, useState } from 'react';
import { CheckCircle2, FileText, LoaderCircle, Printer, RotateCcw } from 'lucide-react';
import { Field, ModalHeader } from '@/components/business-ui';
import { summarizeContract, validatePayment } from '@/lib/finance';
import { formatContractNumber, formatIqd } from '@/lib/formatters';
import { addPayment } from '@/lib/sheets';
import type { ContractView, Payment } from '@/types/domain';

type Props = {
  contract: ContractView;
  today: string;
  onClose: () => void;
  onRecorded: (payment: Payment) => void;
  onReceipt: (payment: Payment, print: boolean) => void;
};

export default function PaymentDialog(props: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<Payment | null>(null);
  const [sequence, setSequence] = useState(0);
  const [remaining, setRemaining] = useState(props.contract.remaining_amount);
  const [paidAfter, setPaidAfter] = useState(props.contract.paid_amount);
  const suggested = useMemo(() => {
    if (paidAfter === props.contract.paid_amount) return Math.min(props.contract.current_installment_remaining || props.contract.installment_value, remaining);
    const synthetic: Payment = { id: -1, customer_id: props.contract.customer_id, contract_id: props.contract.id, amount: paidAfter, payment_date: props.today, status: 'active' };
    return summarizeContract(props.contract, [synthetic], props.today).currentInstallmentRemaining;
  }, [paidAfter, props.contract, props.today, remaining]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError('');
    const form = new FormData(event.currentTarget);
    try {
      const amount = validatePayment(Number(form.get('amount')), remaining);
      const payment = await addPayment({
        customer_id: props.contract.customer_id,
        contract_id: props.contract.id,
        amount,
        payment_date: form.get('payment_date'),
        notes: form.get('notes'),
        request_id: crypto.randomUUID(),
      });
      setSaved(payment);
      setRemaining(payment.remaining_after ?? Math.max(remaining - payment.amount, 0));
      setPaidAfter(payment.paid_after ?? paidAfter + payment.amount);
      props.onRecorded(payment);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر تسجيل الدفعة');
    } finally { setSaving(false); }
  }

  if (saved) return <div className="modal-backdrop"><div className="modal-panel max-w-xl"><ModalHeader title="تم تسجيل الدفعة" onClose={props.onClose} />
    <div className="payment-success"><CheckCircle2 size={44} /><h3>تم استلام {formatIqd(saved.amount)}</h3><p>حُفظت العملية وأصبح الوصل جاهزاً.</p></div>
    <div className="financial-summary-grid compact-grid">
      <Metric label="المبلغ المستلم" value={formatIqd(saved.amount)} />
      <Metric label="المدفوع بعد العملية" value={formatIqd(saved.paid_after || 0)} />
      <Metric label="المتبقي بعد العملية" value={formatIqd(saved.remaining_after || 0)} />
      <Metric label="رقم الوصل" value={saved.receipt_number || `#${saved.id}`} />
    </div>
    <div className="modal-actions flex-wrap">
      <button className="secondary-button" onClick={() => props.onReceipt(saved, false)}><FileText size={17} /> عرض الوصل</button>
      <button className="secondary-button" onClick={() => props.onReceipt(saved, true)}><Printer size={17} /> طباعة / PDF</button>
      {remaining > 0 && <button className="secondary-button" onClick={() => { setSaved(null); setSequence((value) => value + 1); }}><RotateCcw size={17} /> دفعة أخرى</button>}
      <button className="primary-button" onClick={props.onClose}>إغلاق</button>
    </div>
  </div></div>;

  return <div className="modal-backdrop"><div className="modal-panel max-w-xl"><ModalHeader title="تسجيل دفعة" onClose={props.onClose} />
    <div className="payment-summary"><div><small>العميل</small><strong>{props.contract.customer.name}</strong></div><div><small>رقم العقد</small><strong dir="ltr">{formatContractNumber(props.contract.id)}</strong></div><div><small>المتبقي الحالي</small><strong>{formatIqd(remaining)}</strong></div><div><small>القسط المطلوب الآن</small><strong>{formatIqd(suggested)}</strong></div></div>
    <form key={sequence} className="mt-5 space-y-4" onSubmit={submit}>
      <Field label="مبلغ الدفعة"><input name="amount" type="number" min="1" max={remaining} step="1" defaultValue={suggested || ''} autoFocus required /></Field>
      <Field label="تاريخ الدفع"><input name="payment_date" type="date" defaultValue={props.today} required /></Field>
      <Field label="ملاحظة"><textarea name="notes" rows={3} placeholder="اختياري" /></Field>
      {error && <p className="error-banner">{error}</p>}
      <div className="modal-actions"><button type="button" className="secondary-button" onClick={props.onClose}>إلغاء</button><button className="primary-button" disabled={saving}>{saving && <LoaderCircle size={17} className="animate-spin" />}حفظ الدفعة</button></div>
    </form>
  </div></div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="financial-metric"><small>{label}</small><strong>{value}</strong></div>;
}
