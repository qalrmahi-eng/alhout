import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from '@/proxy';

describe('حدود الحماية', () => {
  it('يرفض API دون Session', async () => {
    Object.assign(process.env, { SESSION_SECRET: `test-${'x'.repeat(40)}` });
    const response = await proxy(new NextRequest('http://localhost/api/sheets'));
    expect(response.status).toBe(401);
  });

  it('لا يكشف رابط Apps Script أو سره في كود المتصفح', () => {
    const client = readFileSync('lib/sheets.ts', 'utf8');
    expect(client).not.toContain('SHEETS_API_URL');
    expect(client).not.toContain('SHEETS_API_SECRET');
    expect(client).not.toContain(['script', 'google', 'com'].join('.'));
  });

  it('يفرض Apps Script السر ويمنع request_id المكرر', () => {
    const code = readFileSync('google-apps-script/Code.gs', 'utf8');
    expect(code).toContain('validSecret_(body.secret)');
    expect(code).toContain("text_(row.request_id) === requestId");
    expect(code).toContain("found.object.status = 'cancelled'");
  });

  it('لا يعيد doGet بيانات العملاء', () => {
    const code = readFileSync('google-apps-script/Code.gs', 'utf8');
    const healthHandler = code.slice(code.indexOf('function doGet()'), code.indexOf('function doPost'));
    expect(healthHandler).not.toContain('customers');
    expect(healthHandler).toContain("status: 'healthy'");
  });

  it('يسمح Route Handler بإجراء dashboard', () => {
    const route = readFileSync('app/api/sheets/route.ts', 'utf8');
    const allowedActions = route.slice(
      route.indexOf('const ALLOWED_ACTIONS'),
      route.indexOf(']);', route.indexOf('const ALLOWED_ACTIONS')),
    );
    expect(allowedActions).toContain("'dashboard'");
    expect(allowedActions).toContain("'reports_summary'");
    expect(allowedActions).toContain("'delete_customer_permanently'");
    expect(allowedActions).toContain("'set_manual_reminder_date'");
    expect(allowedActions).toContain("'clear_manual_reminder_date'");
    expect(allowedActions).toContain("'update_payment'");
  });
});
