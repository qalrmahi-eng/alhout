'use client';

import { FormEvent, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { Field, ModalHeader } from '@/components/business-ui';
import { formatContractNumber, formatIqd } from '@/lib/formatters';
import { updatePayment } from '@/lib/sheets';
import type { ContractView, Payment } from '@/types/domain';

type Props = { payment: Payment; contract: ContractView; onClose: () => void; onSaved: (payment: Payment) => void };

export default function EditPaymentDialog({ payment, contract, onClose, onSaved }: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError('');
    const form = new FormData(event.currentTarget);
    try {
      onSaved(await updatePayment({
        payment_id: payment.id,
        amount: form.get('amount'),
        payment_date: form.get('payment_date'),
        notes: form.get('notes'),
        edit_reason: form.get('edit_reason'),
      }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر تعديل الدفعة');
    } finally { setSaving(false); }
  }
  return <div className="modal-backdrop"><div className="modal-panel max-w-xl">
    <ModalHeader title="تعديل الدفعة" onClose={onClose} />
    <div className="payment-summary"><div><small>العميل</small><strong>{contract.customer.name}</strong></div><div><small>العقد</small><strong dir="ltr">{formatContractNumber(contract.id)}</strong></div><div><small>القيمة الحالية</small><strong>{formatIqd(payment.amount)}</strong></div></div>
    <form className="form-grid mt-5" onSubmit={submit}>
      <Field label="المبلغ"><input name="amount" type="number" min="1" step="1" defaultValue={payment.amount} required /></Field>
      <Field label="تاريخ الدفع"><input name="payment_date" type="date" defaultValue={payment.payment_date} required /></Field>
      <Field label="الملاحظة" wide><textarea name="notes" defaultValue={payment.notes} rows={3} /></Field>
      <Field label="سبب التعديل" wide><textarea name="edit_reason" rows={3} minLength={3} placeholder="مثال: تصحيح مبلغ أو تاريخ الدفع" required /></Field>
      {error && <p className="error-banner form-wide">{error}</p>}
      <div className="modal-actions form-wide"><button type="button" className="secondary-button" onClick={onClose}>إلغاء</button><button className="primary-button" disabled={saving}>{saving && <LoaderCircle size={17} className="animate-spin" />}حفظ التعديل</button></div>
    </form>
  </div></div>;
}
