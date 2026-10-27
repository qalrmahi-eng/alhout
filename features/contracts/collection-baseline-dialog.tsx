'use client';

import { FormEvent, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { Field, ModalHeader } from '@/components/business-ui';
import { clearCollectionBaseline, setCollectionBaseline } from '@/lib/sheets';
import type { Contract } from '@/types/domain';

type Props = {
  contract: Contract;
  today: string;
  onClose: () => void;
  onSaved: (contract: Contract) => void;
};

export default function CollectionBaselineDialog({ contract, today, onClose, onSaved }: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const configured = Boolean(contract.collection_start_date);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      onSaved(await setCollectionBaseline(contract.id, String(form.get('collection_start_date'))));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر ضبط بداية التحصيل');
    } finally {
      setSaving(false);
    }
  }

  async function clear() {
    setSaving(true);
    setError('');
    try {
      onSaved(await clearCollectionBaseline(contract.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر إلغاء بداية التحصيل');
    } finally {
      setSaving(false);
    }
  }

  return <div className="modal-backdrop"><div className="modal-panel max-w-md">
    <ModalHeader title={configured ? 'تعديل بداية التحصيل' : 'ضبط بداية التحصيل'} onClose={onClose} />
    <form onSubmit={submit} className="space-y-4">
      <Field label="أول موعد تحصيل فعلي"><input name="collection_start_date" type="date" defaultValue={contract.collection_start_date || today} required /></Field>
      <p className="text-xs leading-6 text-slate-500">يُحفظ إجمالي المدفوع الحالي كنقطة بداية مرة واحدة، ثم تتحرك المتابعة تلقائياً مع الدفعات الجزئية والكاملة والمقدمة. لا تتغير الدفعات التاريخية أو جدول FIFO المالي.</p>
      {configured && <p className="text-xs leading-6 text-amber-700">تعديل التاريخ يبقي نقطة المدفوع الأصلية. استخدم الإلغاء للعودة إلى الاستحقاق المالي النظري.</p>}
      {error && <p className="error-banner">{error}</p>}
      <div className="modal-actions flex-wrap">
        {configured && <button type="button" className="secondary-button" disabled={saving} onClick={clear}>إلغاء الضبط</button>}
        <button type="button" className="secondary-button" onClick={onClose}>تراجع</button>
        <button className="primary-button" disabled={saving}>{saving && <LoaderCircle size={17} className="animate-spin" />}حفظ</button>
      </div>
    </form>
  </div></div>;
}
