import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('تنظيف ما قبل الإنتاج', () => {
  it('يبقي زر إضافة العميل الأبيض وحده في الـHeader', () => {
    const dashboard = readFileSync('features/dashboard/dashboard-app.tsx', 'utf8');
    const header = dashboard.slice(dashboard.indexOf('<header className="topbar">'), dashboard.indexOf('</header>'));
    expect(header).toContain('secondary-button compact');
    expect(header).toContain('عميل');
    expect(header).not.toContain('primary-button compact');
  });

  it('يثبت الحذف النهائي الصريح وإصلاح تاريخ Safari', () => {
    const customer = readFileSync('features/customers/customer-workspace.tsx', 'utf8');
    const dashboard = readFileSync('features/dashboard/dashboard-app.tsx', 'utf8');
    const backend = readFileSync('google-apps-script/Code.gs', 'utf8');
    const css = readFileSync('app/globals.css', 'utf8');
    expect(customer).toContain('حذف العميل');
    expect(dashboard).toContain('لا يمكن التراجع عن هذه العملية');
    expect(backend).toContain('delete_customer_permanently: permanentlyDeleteCustomer_');
    expect(css).toContain('input[type="date"]');
    expect(css).toContain('unicode-bidi: plaintext');
  });
});
