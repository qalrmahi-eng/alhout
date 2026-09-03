import { CheckCircle2, Gauge, X } from 'lucide-react';
import type { ContractStatus } from '@/types/domain';

export function PanelTitle({ title, subtitle, icon: Icon }: { title: string; subtitle: string; icon: typeof Gauge }) {
  return <div className="panel-title"><span><Icon size={19} /></span><div><h2>{title}</h2><p>{subtitle}</p></div></div>;
}

export function ModalHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return <div className="modal-header"><h2>{title}</h2><button type="button" className="icon-button" onClick={onClose} aria-label="إغلاق"><X size={19} /></button></div>;
}

export function Field({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return <label className={wide ? 'field-label form-wide' : 'field-label'}>{label}{children}</label>;
}

export function DetailMetric({ label, value }: { label: string; value: string }) {
  return <div><small>{label}</small><strong>{value}</strong></div>;
}

export function EmptyState({ text, action }: { text: string; action?: React.ReactNode }) {
  return <div className="empty-state"><CheckCircle2 size={30} /><p>{text}</p>{action}</div>;
}

export function StatusBadge({ status }: { status: ContractStatus }) {
  const key = status === 'متأخر' ? 'late' : status === 'مستحق اليوم' ? 'today' : status === 'مكتمل' ? 'paid' : status === 'مؤرشف' ? 'archived' : 'regular';
  return <span className={`status status-${key}`}>{status}</span>;
}
