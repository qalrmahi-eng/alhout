'use client';

import { WalletCards } from 'lucide-react';
import { EmptyState, PanelTitle } from '@/components/business-ui';
import { formatBaghdadDateTime } from '@/lib/dates';
import { formatContractNumber, formatDate, formatIqd } from '@/lib/formatters';
import type { Contract, Customer, Payment } from '@/types/domain';

type Props = {
  payments: Payment[];
  customers: Customer[];
  contracts: Contract[];
  onReceipt: (payment: Payment) => void;
  onCancel: (payment: Payment) => void;
  onEdit: (payment: Payment) => void;
};

export default function PaymentHistory(props: Props) {
  const names = new Map(props.customers.map((customer) => [customer.id, customer.name]));
  const contracts = new Map(props.contracts.map((contract) => [contract.id, contract]));
  return <section className="panel overflow-hidden">
    <PanelTitle title="سجل الدفعات" subtitle={`${props.payments.length} عملية محفوظة`} icon={WalletCards} />
    {props.payments.length ? <div className="table-wrap mt-5"><table><thead><tr><th>رقم الوصل</th><th>العميل / العقد</th><th>المبلغ</th><th>التاريخ</th><th>الملاحظة</th><th>الحالة</th><th>إجراء</th></tr></thead><tbody>{[...props.payments].sort((a, b) => b.payment_date.localeCompare(a.payment_date) || String(b.created_at || '').localeCompare(String(a.created_at || '')) || b.id - a.id).map((payment) => {
      const contract = contracts.get(payment.contract_id);
      const cancelled = payment.status === 'cancelled';
      return <tr key={payment.id} className={cancelled ? 'cancelled-row' : ''}>
        <td dir="ltr">{payment.receipt_number || `#${payment.id}`}</td>
        <td>{names.get(contract?.customer_id || payment.customer_id) || `عميل #${payment.customer_id}`}<small className="block" dir="ltr">{formatContractNumber(payment.contract_id)}</small></td>
        <td className="font-black">{formatIqd(payment.amount)}</td><td>{formatDate(payment.payment_date)}</td><td>{payment.notes || '—'}{payment.edited_at && <small className="block mt-1">معدلة: {payment.edit_reason}</small>}</td>
        <td>{cancelled ? <span><b className="status status-archived">ملغاة</b><small className="block mt-1">{payment.cancellation_reason} · {formatBaghdadDateTime(payment.cancelled_at)}</small></span> : <span className="flex flex-wrap gap-1"><b className="status status-paid">نشطة</b>{payment.edited_at && <b className="status status-today">معدلة</b>}</span>}</td>
        <td><div className="flex gap-2"><button className="mini-button" onClick={() => props.onReceipt(payment)}>الوصل</button>{!cancelled && <><button className="mini-button" onClick={() => props.onEdit(payment)}>تعديل</button><button className="mini-button danger" onClick={() => props.onCancel(payment)}>إلغاء</button></>}</div></td>
      </tr>;
    })}</tbody></table></div> : <EmptyState text="لا توجد دفعات مسجلة بعد." />}
  </section>;
}
