import type { Metadata } from 'next';
import LoginForm from '@/features/auth/login-form';
import WhaleLogo from '@/components/whale-logo';

export const metadata: Metadata = { title: 'تسجيل الدخول' };

export default function LoginPage() {
  return (
    <main className="login-shell">
      <div className="login-glow login-glow-one" />
      <div className="login-glow login-glow-two" />
      <section className="login-card">
        <div className="mb-10 flex justify-center">
          <WhaleLogo />
        </div>
        <p className="eyebrow">مساحة الإدارة الآمنة</p>
        <h1 className="mt-3 text-3xl font-black text-white">مرحباً بعودتك</h1>
        <p className="mt-3 text-sm leading-7 text-slate-400">
          سجّل الدخول للوصول إلى العقود والتحصيلات والتقارير.
        </p>
        <LoginForm />
        <p className="mt-8 text-center text-xs text-slate-500">
          اتصال محمي · بياناتك لا تغادر خادمك وGoogle Sheets
        </p>
      </section>
    </main>
  );
}

