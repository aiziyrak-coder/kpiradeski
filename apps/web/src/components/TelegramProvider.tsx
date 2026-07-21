'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  getTelegramWebApp,
  isTelegramMiniApp,
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
        wa.setHeaderColor?.(TEAL_HEADER);
        wa.setBackgroundColor?.(TEAL_BG);
        wa.disableVerticalSwipes?.();
        document.documentElement.classList.add('tg-mini-app');
        document.documentElement.style.setProperty(
          '--tg-viewport-stable-height',
          `${wa.viewportStableHeight || wa.viewportHeight || window.innerHeight}px`,
        );
        const applyTheme = () => {
          const tp = wa.themeParams || {};
          if (tp.bg_color) document.documentElement.style.setProperty('--tg-bg', tp.bg_color);
          if (tp.text_color) document.documentElement.style.setProperty('--tg-text', tp.text_color);
          if (tp.hint_color) document.documentElement.style.setProperty('--tg-hint', tp.hint_color);
          if (tp.button_color)
            document.documentElement.style.setProperty('--tg-button', tp.button_color);
          document.documentElement.style.setProperty(
            '--tg-viewport-stable-height',
            `${wa.viewportStableHeight || wa.viewportHeight}px`,
          );
        };
        applyTheme();
        // @ts-expect-error optional event
        wa.onEvent?.('viewportChanged', applyTheme);
        // @ts-expect-error optional event
        wa.onEvent?.('themeChanged', applyTheme);
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

  // Telegram BackButton
  useEffect(() => {
    const wa = webApp;
    if (!wa?.BackButton) return;

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
