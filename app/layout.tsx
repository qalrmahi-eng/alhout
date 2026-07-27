import type { Metadata, Viewport } from 'next';
import PwaRegister from '@/components/pwa-register';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'الحوت', template: '%s | الحوت' },
  description: 'نظام إدارة العقود والأقساط والتحصيل',
  applicationName: 'الحوت',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'الحوت' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#071a2e',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
