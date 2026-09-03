'use client';

import { FormEvent, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { Field, ModalHeader } from '@/components/business-ui';
import { buildCustomerFormPayload } from '@/lib/customer-form';
import { addCustomer, updateCustomer } from '@/lib/sheets';
import type { Customer } from '@/types/domain';

type Props = { customer: Customer | null; onClose: () => void; onSaved: (customer: Customer) => void };

export default function CustomerFormDialog(props: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError('');
    try {
      const data = buildCustomerFormPayload(new FormData(event.currentTarget));
      const saved = props.customer
        ? await updateCustomer({ ...data, customer_id: props.customer.id })
        : await addCustomer(data);
      props.onSaved(saved);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر حفظ العميل');
    } finally { setSaving(false); }
  }
  return <div className="modal-backdrop"><div className="modal-panel max-w-2xl"><ModalHeader title={props.customer ? 'تعديل بيانات العميل' : 'إضافة عميل جديد'} onClose={props.onClose} />
    <form className="form-grid" onSubmit={submit}>
      <Field label="اسم العميل"><input name="name" defaultValue={props.customer?.name} required autoFocus /></Field>
      <Field label="رقم الهاتف"><input name="phone" inputMode="tel" defaultValue={props.customer?.phone} /></Field>
      <Field label="العنوان" wide><input name="address" defaultValue={props.customer?.address} /></Field>
      <Field label="ملاحظات" wide><textarea name="notes" defaultValue={props.customer?.notes} rows={3} /></Field>
      {error && <p className="error-banner form-wide">{error}</p>}
      <div className="form-wide modal-actions"><button type="button" className="secondary-button" onClick={props.onClose}>إلغاء</button><button className="primary-button" disabled={saving}>{saving && <LoaderCircle size={17} className="animate-spin" />}{props.customer ? 'حفظ التعديلات' : 'إضافة العميل'}</button></div>
    </form>
  </div></div>;
}
