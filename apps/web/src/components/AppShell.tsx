'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  ClipboardList,
  FileBarChart,
  Bell,
  Menu,
  X,
  LogOut,
  Users,
  KeyRound,
  Building2,
  Sparkles,
  Bot,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { homeForRole, type Role } from '@/types';
import { haptic } from '@/lib/telegram';
import { useTelegram } from '@/components/TelegramProvider';
import { useI18n } from '@/lib/i18n';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

const NAV: Array<{
  href: string;
  labelKey: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: Role[];
}> = [
  {
    href: '/dashboard',
    labelKey: 'nav.dashboard',
    icon: LayoutDashboard,
    roles: ['ADMIN', 'SUPER_ADMIN'],
  },
  { href: '/today', labelKey: 'nav.today', icon: ClipboardList, roles: ['MANAGER', 'ADMIN', 'SUPER_ADMIN'] },
  { href: '/ai', labelKey: 'nav.ai', icon: Sparkles, roles: ['ADMIN', 'SUPER_ADMIN'] },
  { href: '/assistant', labelKey: 'nav.assistant', icon: Bot, roles: ['MANAGER', 'ADMIN', 'SUPER_ADMIN'] },
  { href: '/branches', labelKey: 'nav.branches', icon: Building2, roles: ['ADMIN', 'SUPER_ADMIN'] },
  { href: '/users', labelKey: 'nav.users', icon: Users, roles: ['ADMIN', 'SUPER_ADMIN'] },
  { href: '/reports', labelKey: 'nav.reports', icon: FileBarChart, roles: ['ADMIN', 'SUPER_ADMIN'] },
  { href: '/notifications', labelKey: 'nav.notifications', icon: Bell },
  { href: '/account', labelKey: 'nav.account', icon: KeyRound },
];

function bottomTabsFor(role: Role, t: (k: string) => string) {
  if (role === 'ADMIN' || role === 'SUPER_ADMIN') {
    return [
      { href: '/dashboard', label: t('nav.tabKpi'), icon: LayoutDashboard },
      { href: '/today', label: t('nav.tabToday'), icon: ClipboardList },
      { href: '/reports', label: t('nav.tabReport'), icon: FileBarChart },
      { href: '/users', label: t('nav.users'), icon: Users },
    ];
  }
  return [
    { href: '/today', label: t('nav.tabToday'), icon: ClipboardList },
      { href: '/assistant', label: t('nav.assistant'), icon: Bot },
    { href: '/notifications', label: t('nav.tabNotify'), icon: Bell },
    { href: '/account', label: t('nav.account'), icon: KeyRound },
  ];
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout, loading } = useAuth();
  const { isMiniApp } = useTelegram();
  const { t, roleLabel } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    api<any[]>('/notifications')
      .then((n) => setUnread(n.filter((x) => !x.read).length))
      .catch(() => {});
  }, [user, pathname]);

  const items = useMemo(() => {
    if (!user) return [];
    return NAV.filter((n) => {
      if (!n.roles) return true;
      return n.roles.includes(user.role);
    });
  }, [user]);

  const tabs = useMemo(() => (user ? bottomTabsFor(user.role, t) : []), [user, t]);

  if (loading || !user) {
    return (
      <div className="min-h-[100dvh] grid place-items-center bg-mesh safe-pad">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-2 border-teal-600 border-t-transparent animate-spin" />
          <p className="text-ink-muted text-sm">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  const NavLinks = ({ mobile = false }: { mobile?: boolean }) => (
    <nav className={cn('space-y-1', mobile && 'px-2')}>
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + '/');
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => {
              haptic('light');
              setOpen(false);
            }}
            className={cn(
              'flex items-center gap-3 px-3 rounded-xl text-sm font-medium transition-all touch-target',
              mobile ? 'min-h-12 py-3' : 'py-2.5',
              active
                ? 'bg-teal-700 text-white shadow-soft'
                : 'text-ink-soft hover:bg-teal-50 hover:text-teal-800 active:bg-teal-100',
            )}
          >
            <Icon className="w-5 h-5 shrink-0" />
            {t(item.labelKey)}
            {item.href === '/notifications' && unread > 0 && (
              <span className="ml-auto min-w-5 h-5 px-1 rounded-full bg-status-red text-[10px] text-white grid place-items-center">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div
      className={cn(
        'min-h-[100dvh]',
        isMiniApp ? 'tg-app-shell bg-sand-50' : 'bg-mesh',
      )}
    >
      {!isMiniApp && (
        <div
          className="fixed inset-0 pointer-events-none opacity-[0.035]"
          style={{
            backgroundImage:
              'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23083A34\' fill-opacity=\'1\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")',
          }}
        />
      )}

      <aside className="hidden lg:flex fixed left-0 top-0 bottom-0 w-[260px] flex-col border-r border-teal-900/10 bg-white/70 backdrop-blur-xl z-30">
        <div className="px-5 pt-6 pb-4">
          <Link href={homeForRole(user.role)} className="block group">
            <p className="font-display text-3xl text-teal-800 tracking-tight group-hover:text-teal-600 transition">
              {t('app.title')}
            </p>
          </Link>
        </div>
        <div className="px-4 pb-2">
          <LanguageSwitcher className="w-full justify-center" />
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-2">
          <NavLinks />
        </div>
        <div className="p-4 border-t border-teal-100">
          <div className="rounded-2xl bg-teal-50/80 p-3 mb-3">
            <p className="text-sm font-semibold text-ink truncate">{user.name}</p>
            <p className="text-xs text-teal-700 mt-0.5">{roleLabel(user.role)}</p>
          </div>
          <button
            onClick={() => {
              logout();
              router.push('/login');
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-ink-muted hover:text-status-red rounded-xl hover:bg-rose-50 transition"
          >
            <LogOut className="w-4 h-4" /> {t('common.logout')}
          </button>
        </div>
      </aside>

      <header className="lg:hidden sticky top-0 z-40 border-b border-teal-100/80 bg-white/90 backdrop-blur-xl safe-top">
        <div className="flex items-center justify-between px-3 h-12 sm:h-14">
          <button
            type="button"
            onClick={() => {
              haptic('light');
              setOpen(true);
            }}
            className="touch-target grid place-items-center rounded-xl hover:bg-teal-50 active:bg-teal-100"
            aria-label={t('common.menu')}
          >
            <Menu className="w-5 h-5 text-ink" />
          </button>
          <Link href={homeForRole(user.role)} className="font-display text-xl sm:text-2xl text-teal-800">
            {t('app.title')}
          </Link>
          <LanguageSwitcher />
        </div>
      </header>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-ink/40 z-50 lg:hidden"
              onClick={() => setOpen(false)}
            />
            <motion.aside
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              className="fixed left-0 top-0 bottom-0 w-[min(300px,88vw)] bg-white z-50 lg:hidden flex flex-col shadow-glow safe-pad"
            >
              <div className="flex items-center justify-between px-4 h-14 border-b border-teal-50 shrink-0">
                <p className="font-display text-2xl text-teal-800">{t('app.title')}</p>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="touch-target grid place-items-center rounded-xl hover:bg-teal-50"
                  aria-label={t('common.close')}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto py-3 overscroll-contain">
                <NavLinks mobile />
              </div>
              <div className="p-4 border-t safe-bottom shrink-0">
                <p className="text-sm font-semibold truncate">{user.name}</p>
                <p className="text-xs text-teal-700 mb-3">{roleLabel(user.role)}</p>
                <button
                  type="button"
                  onClick={() => {
                    logout();
                    router.push('/login');
                  }}
                  className="flex items-center gap-2 min-h-11 text-sm text-status-red"
                >
                  <LogOut className="w-4 h-4" /> {t('common.logout')}
                </button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="hidden lg:flex fixed top-0 left-[260px] right-0 h-14 items-center justify-end px-8 z-20 bg-transparent">
        <Link
          href="/notifications"
          className="relative mt-3 inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/70 border border-teal-100 text-sm text-ink-soft hover:bg-white transition shadow-soft"
        >
          <Bell className="w-4 h-4" />
          {t('nav.notifications')}
          {unread > 0 && (
            <span className="min-w-5 h-5 px-1 rounded-full bg-teal-700 text-[11px] text-white grid place-items-center">
              {unread}
            </span>
          )}
        </Link>
      </div>

      <main className="lg:pl-[260px] relative z-10">
        <div
          className={cn(
            'max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-10 lg:pt-16',
            'pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] lg:pb-10',
          )}
        >
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28 }}
          >
            {children}
          </motion.div>
        </div>
      </main>

      <nav
        className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-teal-100/90 bg-white/95 backdrop-blur-xl safe-bottom"
        aria-label={t('common.mainNav')}
      >
        <div
          className="grid px-1 pt-1"
          style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
        >
          {tabs.map((tab) => {
            const active = pathname === tab.href || pathname.startsWith(tab.href + '/');
            const Icon = tab.icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                onClick={() => haptic('light')}
                className={cn(
                  'relative flex flex-col items-center justify-center gap-0.5 min-h-14 py-1.5 text-[10px] font-medium transition-colors',
                  active ? 'text-teal-800' : 'text-ink-muted active:text-teal-700',
                )}
              >
                <span className="relative">
                  <Icon className={cn('w-5 h-5', active && 'stroke-[2.25px]')} />
                  {tab.href === '/notifications' && unread > 0 && (
                    <span className="absolute -top-1.5 -right-2 min-w-4 h-4 px-0.5 rounded-full bg-status-red text-[9px] text-white grid place-items-center">
                      {unread > 9 ? '9+' : unread}
                    </span>
                  )}
                </span>
                <span className="leading-tight truncate max-w-full px-0.5">{tab.label}</span>
                {active && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-teal-600" />
                )}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
