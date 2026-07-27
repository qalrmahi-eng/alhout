'use client';

import { FormEvent, useState } from 'react';
import { Eye, EyeOff, LoaderCircle, LockKeyhole, UserRound } from 'lucide-react';

export default function LoginForm() {
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: form.get('username'),
          password: form.get('password'),
        }),
      });
      const result = (await response.json()) as { ok: boolean; message?: string };
      if (!response.ok || !result.ok) throw new Error(result.message || 'تعذر تسجيل الدخول');
      window.location.assign('/');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر تسجيل الدخول');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="mt-8 space-y-5" onSubmit={submit}>
      <label className="field-label">
        اسم المستخدم
        <span className="field-with-icon">
          <UserRound size={18} />
          <input name="username" autoComplete="username" required placeholder="اسم المستخدم" />
        </span>
      </label>
      <label className="field-label">
        كلمة المرور
        <span className="field-with-icon">
          <LockKeyhole size={18} />
          <input
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            required
            placeholder="••••••••••••"
          />
          <button
            type="button"
            className="password-toggle"
            onClick={() => setShowPassword((current) => !current)}
            aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </span>
      </label>
      {error && <p className="error-banner">{error}</p>}
      <button className="primary-button w-full" disabled={loading}>
        {loading ? <LoaderCircle className="animate-spin" size={19} /> : <LockKeyhole size={19} />}
        {loading ? 'جاري التحقق...' : 'دخول آمن'}
      </button>
    </form>
  );
}

