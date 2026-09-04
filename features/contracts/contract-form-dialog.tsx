'use client';

import { FormEvent, useMemo, useState } from 'react';
import { Calculator, LoaderCircle } from 'lucide-react';
import { Field, ModalHeader } from '@/components/business-ui';
import { buildContractFormPayload } from '@/lib/contract-form';
import { addInstallmentPeriod, calculateContract, inclusiveMonthlyInstallments, splitInstallments } from '@/lib/finance';
import { formatDate, formatIqd } from '@/lib/formatters';
import { addContract, updateContract } from '@/lib/sheets';
import type { Contract, Customer, Settings } from '@/types/domain';

type Props = {
  value: { contract: Contract | null; customerId?: number };
  customers: Customer[];
  defaults: Settings;
  today: string;
  onClose: () => void;
  onSaved: (contract: Contract) => void;
};

export default function ContractFormDialog(props: Props) {
  const contract = props.value.contract;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [principal, setPrincipal] = useState(contract?.principal || 0);
  const [profitPercent, setProfitPercent] = useState(contract?.profit_percent ?? props.defaults.default_profit_percent);
  const [installments, setInstallments] = useState(contract?.installments || 10);
  const [firstDueDate, setFirstDueDate] = useState(contract?.first_due_date || props.today);
  const [expectedEndDate, setExpectedEndDate] = useState(contract?.expected_end_date || addInstallmentPeriod(props.today, 9, 'monthly'));

  function changeFirstDueDate(value: string) {
    setFirstDueDate(value);
    try { setExpectedEndDate(addInstallmentPeriod(value, installments - 1, 'monthly')); } catch { /* input is incomplete */ }
  }

  function changeInstallments(value: number) {
    setInstallments(value);
    try { setExpectedEndDate(addInstallmentPeriod(firstDueDate, value - 1, 'monthly')); } catch { /* input is incomplete */ }
  }

  function changeExpectedEndDate(value: string) {
    setExpectedEndDate(value);
    try { setInstallments(inclusiveMonthlyInstallments(firstDueDate, value)); } catch { /* validation appears on save */ }
  }

  const preview = useMemo(() => {
    try {
      if (principal <= 0 || installments <= 0) return null;
      if (inclusiveMonthlyInstallments(firstDueDate, expectedEndDate) !== installments) return null;
      const calculated = calculateContract(principal, profitPercent);
      const parts = splitInstallments(calculated.contractTotal, installments);
      return {
        ...calculated,
        installment: parts[0],
        expectedEnd: expectedEndDate,
      };
    } catch { return null; }
  }, [principal, profitPercent, installments, firstDueDate, expectedEndDate]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError('');
    try {
      const data = buildContractFormPayload(new FormData(event.currentTarget));
      const saved = contract
        ? await updateContract({ ...data, contract_id: contract.id })
        : await addContract(data);
      props.onSaved(saved);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر حفظ العقد');
    } finally { setSaving(false); }
  }

  return <div className="modal-backdrop"><div className="modal-panel max-w-4xl"><ModalHeader title={contract ? `تعديل العقد C-${contract.id}` : 'إضافة عقد جديد'} onClose={props.onClose} />
    <div className="contract-form-layout">
      <form className="form-grid" onSubmit={submit}>
        <Field label="العميل"><select name="customer_id" defaultValue={contract?.customer_id || props.value.customerId || props.customers[0]?.id} disabled={Boolean(contract)} required>{props.customers.map((customer) => <option value={customer.id} key={customer.id}>{customer.name} · {customer.phone || 'بدون هاتف'}</option>)}</select>{contract && <input type="hidden" name="customer_id" value={contract.customer_id} />}</Field>
        <Field label="المبلغ المسلم"><input name="principal" type="number" min="1" step="1" value={principal || ''} onChange={(event) => setPrincipal(Number(event.target.value))} required autoFocus /></Field>
        <Field label="نسبة الربح %"><input name="profit_percent" type="number" min="0" step="0.01" value={profitPercent} onChange={(event) => setProfitPercent(Number(event.target.value))} required /></Field>
        <Field label="عدد الأشهر"><input name="installments" type="number" min="1" step="1" value={installments} onChange={(event) => changeInstallments(Number(event.target.value))} required /></Field>
        <Field label="تاريخ تسليم المبلغ"><input name="delivery_date" type="date" defaultValue={contract?.delivery_date || props.today} required /></Field>
        <Field label="تاريخ أول دفعة"><input name="first_due_date" type="date" value={firstDueDate} onChange={(event) => changeFirstDueDate(event.target.value)} required /></Field>
        <Field label="تاريخ آخر دفعة"><input name="expected_end_date" type="date" value={expectedEndDate} onChange={(event) => changeExpectedEndDate(event.target.value)} required /></Field>
        <Field label="اسم الكفيل"><input name="guarantor_name" defaultValue={contract?.guarantor_name} /></Field>
        <Field label="هاتف الكفيل"><input name="guarantor_phone" inputMode="tel" defaultValue={contract?.guarantor_phone} /></Field>
        <Field label="ملاحظات" wide><textarea name="notes" defaultValue={contract?.notes} rows={3} /></Field>
        {error && <p className="error-banner form-wide">{error}</p>}
        <div className="form-wide modal-actions"><button type="button" className="secondary-button" onClick={props.onClose}>إلغاء</button><button className="primary-button" disabled={saving || !preview}>{saving && <LoaderCircle size={17} className="animate-spin" />}{contract ? 'حفظ التعديلات' : 'إضافة العقد'}</button></div>
      </form>
      <aside className="contract-preview">
        <div className="flex items-center gap-2"><Calculator size={18} /><h3>معاينة العقد</h3></div>
        {preview ? <div className="preview-list">
          <Preview label="المبلغ المسلم" value={formatIqd(preview.principal)} />
          <Preview label="مبلغ الربح" value={formatIqd(preview.profitAmount)} />
          <Preview label="إجمالي العقد" value={formatIqd(preview.contractTotal)} accent />
          <Preview label="عدد الأشهر" value={`${installments} شهر`} />
          <Preview label="القسط الشهري" value={formatIqd(preview.installment)} />
          <Preview label="أول استحقاق" value={formatDate(firstDueDate)} />
          <Preview label="آخر استحقاق متوقع" value={formatDate(preview.expectedEnd)} />
        </div> : <p className="mt-4 text-sm text-slate-500">أدخل المبلغ والربح وعدد الأشهر لعرض الحساب.</p>}
        <p className="preview-note">المعاينة إرشادية، والحساب المحفوظ النهائي يأتي من الخادم.</p>
      </aside>
    </div>
  </div></div>;
}

function Preview({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return <div className={accent ? 'accent' : ''}><span>{label}</span><strong>{value}</strong></div>;
}
