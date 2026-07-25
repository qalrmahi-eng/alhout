'use client';

import { useRef, useState } from 'react';
import { Download, Printer, Share2, X } from 'lucide-react';
import { toPng } from 'html-to-image';
import type { ContractSummary, Customer, Payment, Settings } from '@/types/domain';
import WhaleLogo from '@/components/whale-logo';
import { buildReceiptSnapshot } from '@/lib/receipt';

type Props = {
  customer: Customer;
  payment: Payment;
  summary: ContractSummary;
  settings: Settings;
  onClose: () => void;
  notify: (message: string, type?: 'success' | 'error') => void;
};

const iqd = (value: number) => `${new Intl.NumberFormat('ar-IQ').format(value)} د.ع`;

export default function ReceiptModal({
  customer,
  payment,
  summary,
  settings,
  onClose,
  notify,
}: Props) {
  const receiptRef = useRef<HTMLDivElement>(null);
  const [working, setWorking] = useState(false);

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

  const created = new Date(payment.created_at || `${payment.payment_date}T12:00:00+03:00`);
  const snapshot = buildReceiptSnapshot(customer, payment, summary);

  return (
    <div className="modal-backdrop receipt-dialog" role="dialog" aria-modal="true">
      <div className="modal-panel max-w-3xl">
        <div className="no-print mb-4 flex items-center justify-between">
          <div>
            <p className="eyebrow">تم حفظ الدفعة بنجاح</p>
            <h2 className="text-xl font-black">وصل الاستلام جاهز</h2>
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
                {created.toLocaleString('ar-IQ', { timeZone: 'Asia/Baghdad' })}
              </p>
            </div>
          </header>
          <div className="receipt-title">
            <span>وصل استلام</span>
            <small>{settings.system_name}</small>
          </div>
          <p className="receipt-statement">
            استلمنا من السيد/ة <strong>{snapshot.customerName}</strong> مبلغًا قدره{' '}
            <strong>{iqd(snapshot.paymentAmount)}</strong> عن العقد المبين أدناه.
          </p>
          <div className="receipt-grid">
            <ReceiptItem label="رقم الهاتف" value={snapshot.customerPhone} />
            <ReceiptItem label="أصل المبلغ" value={iqd(snapshot.principal)} />
            <ReceiptItem label="نسبة الربح" value={`${snapshot.profitPercent}%`} />
            <ReceiptItem label="مبلغ الربح" value={iqd(snapshot.profitAmount)} />
            <ReceiptItem label="إجمالي العقد" value={iqd(snapshot.contractTotal)} />
            <ReceiptItem label="هذه الدفعة" value={iqd(snapshot.paymentAmount)} accent />
            <ReceiptItem label="مجموع المدفوع" value={iqd(snapshot.paidAfterPayment)} />
            <ReceiptItem label="المتبقي" value={iqd(snapshot.remaining)} />
            <ReceiptItem label="قيمة القسط" value={iqd(snapshot.installmentValue)} />
            <ReceiptItem
              label="الأقساط المكتملة / المتبقية"
              value={`${snapshot.completedInstallments} / ${snapshot.remainingInstallments}`}
            />
            <ReceiptItem
              label="المدفوع / المتبقي من القسط الحالي"
              value={`${iqd(snapshot.currentInstallmentPaid)} / ${iqd(snapshot.currentInstallmentRemaining)}`}
            />
            <ReceiptItem
              label="موعد القسط القادم"
              value={snapshot.completed ? 'تم إكمال العقد' : snapshot.nextDueDate || '-'}
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
            <Printer size={17} /> طباعة
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
