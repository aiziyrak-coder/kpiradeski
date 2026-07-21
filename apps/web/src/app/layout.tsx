import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { Cormorant_Garamond, Outfit } from 'next/font/google';
import { AuthProvider } from '@/lib/auth';
import { TelegramProvider } from '@/components/TelegramProvider';
import { ToastProvider } from '@/components/Toast';
import './globals.css';

const display = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-display',
  display: 'swap',
});

const sans = Outfit({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'KliniKPI — Dermatologiya KPI platformasi',
  description: 'Klinika administratsiyasi va menejmenti uchun avtomatlashtirilgan KPI-monitoring',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'KliniKPI',
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#0f766e',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uz" className={`${display.variable} ${sans.variable}`}>
      <head>
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
      </head>
      <body className="font-sans overscroll-none">
        <AuthProvider>
          <TelegramProvider>
            <ToastProvider>{children}</ToastProvider>
          </TelegramProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
