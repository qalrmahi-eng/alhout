'use client';

import { useEffect, useRef, useState } from 'react';
import { Download, Printer, Share2, X } from 'lucide-react';
import { toPng } from 'html-to-image';
import type { Contract, ContractSummary, Customer, Payment, Settings } from '@/types/domain';
import WhaleLogo from '@/components/whale-logo';
import { buildReceiptSnapshot } from '@/lib/receipt';
import { formatDate, formatIqd } from '@/lib/formatters';

type Props = {
  customer: Customer;
  contract: Contract;
  payment: Payment;
  summary: ContractSummary;
  settings: Settings;
  onClose: () => void;
  notify: (message: string, type?: 'success' | 'error') => void;
  autoPrint?: boolean;
};

export default function ReceiptModal({
  customer,
  contract,
  payment,
  summary,
  settings,
  onClose,
  notify,
  autoPrint = false,
}: Props) {
  const receiptRef = useRef<HTMLDivElement>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    document.documentElement.classList.add('receipt-open');
    return () => document.documentElement.classList.remove('receipt-open');
  }, []);

  useEffect(() => {
    if (!autoPrint) return;
    const timer = window.setTimeout(() => window.print(), 250);
    return () => window.clearTimeout(timer);
  }, [autoPrint]);

  async function makeImage() {
    if (!receiptRef.current) throw new Error('تعذر العثور على الوصل');
    return toPng(receiptRef.current, {
      pixelRatio: 3,
      cacheBust: true,
      backgroundColor: '#ffffff',
    });
  }

  function downloadDataUrl(dataUrl: string) {
    const anchor = document.createElement('a');
    anchor.download = `وصل-${payment.receipt_number || payment.id}.png`;
    anchor.href = dataUrl;
    anchor.click();
  }

  async function download() {
    setWorking(true);
    try {
      downloadDataUrl(await makeImage());
      notify('تم حفظ صورة الوصل', 'success');
    } catch {
      notify('حُفظت الدفعة، لكن تعذر إنشاء صورة الوصل. يمكنك طباعته الآن.', 'error');
    } finally {
      setWorking(false);
    }
  }

  async function share() {
    setWorking(true);
    try {
      const dataUrl = await makeImage();
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], `وصل-${payment.receipt_number || payment.id}.png`, {
        type: 'image/png',
      });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'وصل استلام', text: settings.system_name });
        notify('تمت مشاركة الوصل', 'success');
      } else {
        downloadDataUrl(dataUrl);
        notify('جهازك لا يدعم مشاركة الملفات؛ تم تنزيل صورة الوصل بدلاً منها.', 'success');
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      notify('حُفظت الدفعة، لكن تعذرت مشاركة الوصل.', 'error');
    } finally {
      setWorking(false);
    }
  }

  const snapshot = buildReceiptSnapshot(customer, contract, payment, summary);

  return (
    <div className="modal-backdrop receipt-dialog" role="dialog" aria-modal="true">
      <div className="modal-panel max-w-3xl">
        <div className="no-print mb-4 flex items-center justify-between">
          <div>
            <p className="eyebrow">تم حفظ الدفعة بنجاح</p>
            <h2 className="text-xl font-black">وصل القبض جاهز</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="إغلاق">
            <X size={20} />
          </button>
        </div>

        <div ref={receiptRef} className="receipt-paper">
          <div className="receipt-watermark">الحوت</div>
          <header className="receipt-header">
            <WhaleLogo />
            <div className="text-left">
              <p className="text-xs text-slate-500">رقم الوصل</p>
              <strong dir="ltr">{snapshot.receiptNumber}</strong>
              <p className="mt-1 text-xs text-slate-500">
                تاريخ الدفع: {formatDate(payment.payment_date)}
              </p>
            </div>
          </header>
          <div className="receipt-title">
            <span>وصل قبض</span>
            <small>{settings.system_name}</small>
          </div>
          <p className="receipt-statement">
            استلمنا من السيد/ة <strong>{snapshot.customerName}</strong> مبلغًا قدره{' '}
            <strong>{formatIqd(snapshot.paymentAmount)}</strong>، وتفاصيل الرصيد بعد هذه الدفعة مبينة أدناه.
          </p>
          <div className="receipt-grid">
            <ReceiptItem label="المبلغ المستلم" value={formatIqd(snapshot.paymentAmount)} accent />
            <ReceiptItem label="إجمالي العقد" value={formatIqd(snapshot.contractTotal)} />
            <ReceiptItem label="إجمالي المدفوع بعد الدفعة" value={formatIqd(snapshot.paidAfterPayment)} />
            <ReceiptItem label="المتبقي بعد الدفعة" value={formatIqd(snapshot.remaining)} />
            <ReceiptItem label="قيمة الدفعة القادمة" value={formatIqd(snapshot.expectedPaymentAmount)} />
            <ReceiptItem
              label="موعد القسط القادم"
              value={snapshot.completed ? 'تم إكمال العقد' : formatDate(snapshot.nextDueDate)}
            />
          </div>
          {snapshot.completed && <div className="completed-ribbon">تم إكمال العقد بالكامل</div>}
          {snapshot.notes && (
            <p className="mt-5 rounded-xl bg-slate-50 p-3 text-sm">
              <strong>ملاحظة:</strong> {snapshot.notes}
            </p>
          )}
          <div className="receipt-signatures">
            <div><span>توقيع الدافع</span><i /></div>
            <div><span>توقيع المستلم</span><i /></div>
          </div>
          <footer>{settings.receipt_footer || 'هذا الوصل تأكيد باستلام المبلغ المبين أعلاه.'}</footer>
        </div>

        <div className="no-print mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <button className="secondary-button" onClick={download} disabled={working}>
            <Download size={17} /> حفظ PNG
          </button>
          <button className="secondary-button" onClick={share} disabled={working}>
            <Share2 size={17} /> مشاركة
          </button>
          <button className="secondary-button" onClick={() => window.print()}>
            <Printer size={17} /> طباعة / PDF
          </button>
          <button className="primary-button" onClick={onClose}>
            <X size={17} /> إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}

function ReceiptItem({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className={accent ? 'receipt-item receipt-item-accent' : 'receipt-item'}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
