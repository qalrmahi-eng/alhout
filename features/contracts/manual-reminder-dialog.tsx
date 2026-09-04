'use client';

import { FormEvent, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { Field, ModalHeader } from '@/components/business-ui';
import { clearManualReminderDate, setManualReminderDate } from '@/lib/sheets';
import { addCalendarMonth, reminderMode } from '@/lib/due-date';
import type { Contract } from '@/types/domain';

type Props = { contract: Contract; onClose: () => void; onSaved: (contract: Contract) => void };

export default function ManualReminderDialog({ contract, onClose, onSaved }: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const isManual = reminderMode(contract) === 'manual';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError('');
    const form = new FormData(event.currentTarget);
    try {
      onSaved(await setManualReminderDate(contract.id, String(form.get('manual_reminder_date'))));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر حفظ موعد التذكير');
    } finally { setSaving(false); }
  }

  async function clear() {
    setSaving(true); setError('');
    try { onSaved(await clearManualReminderDate(contract.id)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'تعذر العودة إلى الموعد التلقائي'); }
    finally { setSaving(false); }
  }

  async function advanceOneMonth() {
    if (!contract.manual_reminder_date) return;
    setSaving(true); setError('');
    try { onSaved(await setManualReminderDate(contract.id, addCalendarMonth(contract.manual_reminder_date))); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'تعذر ترحيل موعد التذكير'); }
    finally { setSaving(false); }
  }

  return <div className="modal-backdrop"><div className="modal-panel max-w-md">
    <ModalHeader title={isManual ? 'تعديل موعد التذكير' : 'تحديد موعد التذكير'} onClose={onClose} />
    <form onSubmit={submit} className="space-y-4">
      <Field label="موعد التذكير"><input name="manual_reminder_date" type="date" defaultValue={contract.manual_reminder_date || contract.next_due_date} required /></Field>
      <p className="text-xs leading-6 text-slate-500">هذا الموعد للتذكير والتواصل فقط، ولا يغيّر الأقساط أو الرصيد أو موعد الاستحقاق المالي.</p>
      {error && <p className="error-banner">{error}</p>}
      <div className="modal-actions flex-wrap">
        {isManual && <button type="button" className="secondary-button" disabled={saving || !contract.manual_reminder_date} onClick={advanceOneMonth}>ترحيل للشهر القادم</button>}
        {isManual && <button type="button" className="secondary-button" disabled={saving} onClick={clear}>العودة للتذكير التلقائي</button>}
        <button type="button" className="secondary-button" onClick={onClose}>إلغاء</button>
        <button className="primary-button" disabled={saving}>{saving && <LoaderCircle size={17} className="animate-spin" />}حفظ الموعد</button>
      </div>
    </form>
  </div></div>;
}
