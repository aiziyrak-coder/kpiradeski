'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  getTelegramWebApp,
  isTelegramMiniApp,
  tgVersionAtLeast,
  type TelegramWebApp,
  type TelegramWebAppUser,
} from '@/lib/telegram';
import { homeForRole, type Role } from '@/types';
import { useAuth } from '@/lib/auth';

type TgCtx = {
  ready: boolean;
  isMiniApp: boolean;
  webApp: TelegramWebApp | null;
  tgUser: TelegramWebAppUser | null;
};

const TelegramContext = createContext<TgCtx>({
  ready: false,
  isMiniApp: false,
  webApp: null,
  tgUser: null,
});

const TEAL_BG = '#f7faf9';
const TEAL_HEADER = '#0f766e';

/** Telegram qorongʻi mavzusida ham yorugʻ, o‘qiladigan UI */
function forceLightTheme() {
  document.documentElement.style.setProperty('--tg-bg', TEAL_BG);
  document.documentElement.style.setProperty('--tg-text', '#12201E');
  document.documentElement.style.setProperty('--tg-hint', '#6B7F7A');
  document.documentElement.style.setProperty('--tg-button', TEAL_HEADER);
  document.documentElement.style.setProperty('--tg-secondary-bg', '#ffffff');
  document.documentElement.style.colorScheme = 'light';
}

export function TelegramProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [webApp, setWebApp] = useState<TelegramWebApp | null>(null);
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();

  useEffect(() => {
    let cancelled = false;
    let tries = 0;

    const boot = () => {
      const wa = getTelegramWebApp();
      if (!wa) {
        if (tries++ < 40) {
          setTimeout(boot, 50);
          return;
        }
        if (!cancelled) setReady(true);
        return;
      }

      try {
        wa.ready();
        wa.expand();
        // Version-gated: calling these on 6.0 logs noisy console warnings
        if (tgVersionAtLeast('6.9')) {
          wa.setHeaderColor?.(TEAL_HEADER);
          wa.setBackgroundColor?.(TEAL_BG);
        }
        if (tgVersionAtLeast('7.7')) {
          wa.disableVerticalSwipes?.();
        }
        document.documentElement.classList.add('tg-mini-app');
        forceLightTheme();
        document.documentElement.style.setProperty(
          '--tg-viewport-stable-height',
          `${wa.viewportStableHeight || wa.viewportHeight || window.innerHeight}px`,
        );
        const applyViewport = () => {
          forceLightTheme();
          document.documentElement.style.setProperty(
            '--tg-viewport-stable-height',
            `${wa.viewportStableHeight || wa.viewportHeight}px`,
          );
        };
        // @ts-expect-error optional event
        wa.onEvent?.('viewportChanged', applyViewport);
        // @ts-expect-error optional event — mavzuni eʼtiborsiz qoldiramiz (doim yorugʻ)
        wa.onEvent?.('themeChanged', forceLightTheme);
      } catch {
        // ignore
      }

      if (!cancelled) {
        setWebApp(wa);
        setReady(true);
      }
    };

    boot();
    return () => {
      cancelled = true;
    };
  }, []);

  // Telegram BackButton (WebApp ≥ 6.1)
  useEffect(() => {
    const wa = webApp;
    if (!wa?.BackButton || !tgVersionAtLeast('6.1')) return;

    const homePaths = ['/my', '/today', '/dashboard', '/team', '/login'];
    const atHome = homePaths.some((p) => pathname === p);

    const onBack = () => {
      if (window.history.length > 1) router.back();
      else {
        const role =
          user?.role ||
          (typeof localStorage !== 'undefined'
            ? (localStorage.getItem('klinikpi_role') as Role)
            : null) ||
          'STAFF';
        router.replace(homeForRole(role));
      }
    };

    if (!atHome && pathname !== '/login') {
      wa.BackButton.show();
      wa.BackButton.onClick(onBack);
    } else {
      wa.BackButton.hide();
    }

    return () => {
      try {
        wa.BackButton.offClick(onBack);
        wa.BackButton.hide();
      } catch {
        // ignore
      }
    };
  }, [webApp, pathname, router, user?.role]);

  const value = useMemo(
    () => ({
      ready,
      isMiniApp: isTelegramMiniApp() || Boolean(webApp?.initData),
      webApp,
      tgUser: webApp?.initDataUnsafe?.user || null,
    }),
    [ready, webApp],
  );

  return <TelegramContext.Provider value={value}>{children}</TelegramContext.Provider>;
}

export function useTelegram() {
  return useContext(TelegramContext);
}
