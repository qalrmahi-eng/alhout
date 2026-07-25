import { Waves } from 'lucide-react';

export default function WhaleLogo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-11 place-items-center rounded-2xl bg-gradient-to-br from-cyan-300 to-teal-500 text-slate-950 shadow-lg shadow-cyan-950/20">
        <Waves size={24} strokeWidth={2.4} />
      </span>
      {!compact && (
        <span>
          <strong className="block text-xl font-black tracking-tight">الحوت</strong>
          <small className="text-xs text-slate-400">إدارة مالية أذكى</small>
        </span>
      )}
    </div>
  );
}

