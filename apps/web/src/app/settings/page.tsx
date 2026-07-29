'use client';

import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { Button, Input, SectionHeader, Textarea } from '@/components/ui';
import { api } from '@/lib/api';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { RoleGate } from '@/components/RoleGate';
import { Globe, Instagram, Loader2, Plus, Radio, Sparkles, Trash2 } from 'lucide-react';

type Website = { id?: string; name: string; url: string; enabled: boolean };

type IntegrationsPayload = {
  config: {
    telegram: {
      enabled: boolean;
      channelUrl: string;
      botUsername: string;
      notes: string;
    };
    instagram: {
      enabled: boolean;
      username: string;
      profileUrl: string;
      notes: string;
    };
    websites: Website[];
  };
  runtime: { telegramBotConfigured: boolean; telegramChatConfigured: boolean };
  lastAudit: any;
};

export default function SettingsPage() {
  const { t } = useI18n();
  const toast = useToast();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [auditing, setAuditing] = useState(false);
  const [data, setData] = useState<IntegrationsPayload | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<IntegrationsPayload>('/settings/integrations');
      setData(res);
    } catch (e: any) {
      toast.error(t('settings.loadFail'), e.message);
    } finally {
      setLoading(false);
    }
  }, [t, toast]);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    if (!data) return;
    setSaving(true);
    try {
      const res = await api<IntegrationsPayload>('/settings/integrations', {
        method: 'PUT',
        body: JSON.stringify(data.config),
      });
      setData(res);
      toast.success(t('settings.saved'));
    } catch (e: any) {
      toast.error(t('settings.saveFail'), e.message);
    } finally {
      setSaving(false);
    }
  }

  async function runAudit() {
    setAuditing(true);
    try {
      const audit = await api<any>('/settings/integrations/ai-audit', { method: 'POST' });
      setData((d) => (d ? { ...d, lastAudit: audit } : d));
      toast.success(t('settings.auditDone'));
    } catch (e: any) {
      toast.error(t('settings.auditFail'), e.message);
    } finally {
      setAuditing(false);
    }
  }

  if (!user) return null;

  return (
    <RoleGate allow={['ADMIN', 'SUPER_ADMIN', 'DIRECTOR']}>
      <AppShell>
        <SectionHeader title={t('settings.title')} description={t('settings.subtitle')} />
        {loading || !data ? (
          <div className="flex items-center gap-2 text-sm text-ink-muted py-12 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('common.loading')}
          </div>
        ) : (
          <div className="space-y-5 max-w-3xl">
            <div className="rounded-2xl border border-teal-100 bg-white/90 p-4 shadow-soft space-y-3">
              <div className="flex items-center gap-2">
                <Radio className="h-5 w-5 text-sky-600" />
                <p className="font-semibold text-ink">{t('settings.telegram')}</p>
                <label className="ml-auto flex items-center gap-2 text-xs text-ink-muted">
                  <input
                    type="checkbox"
                    checked={data.config.telegram.enabled}
                    onChange={(e) =>
                      setData({
                        ...data,
                        config: {
                          ...data.config,
                          telegram: { ...data.config.telegram, enabled: e.target.checked },
                        },
                      })
                    }
                  />
                  {t('settings.enabled')}
                </label>
              </div>
              <Input
                placeholder="https://t.me/..."
                value={data.config.telegram.channelUrl}
                onChange={(e) =>
                  setData({
                    ...data,
                    config: {
                      ...data.config,
                      telegram: { ...data.config.telegram, channelUrl: e.target.value },
                    },
                  })
                }
              />
              <Input
                placeholder="@bot"
                value={data.config.telegram.botUsername}
                onChange={(e) =>
                  setData({
                    ...data,
                    config: {
                      ...data.config,
                      telegram: { ...data.config.telegram, botUsername: e.target.value },
                    },
                  })
                }
              />
              <Textarea
                rows={2}
                placeholder={t('settings.notesPh')}
                value={data.config.telegram.notes}
                onChange={(e) =>
                  setData({
                    ...data,
                    config: {
                      ...data.config,
                      telegram: { ...data.config.telegram, notes: e.target.value },
                    },
                  })
                }
              />
              <p className="text-xs text-ink-muted">
                Bot env: {data.runtime.telegramBotConfigured ? '✓' : '—'} · Chat:{' '}
                {data.runtime.telegramChatConfigured ? '✓' : '—'}
              </p>
            </div>

            <div className="rounded-2xl border border-teal-100 bg-white/90 p-4 shadow-soft space-y-3">
              <div className="flex items-center gap-2">
                <Instagram className="h-5 w-5 text-pink-600" />
                <p className="font-semibold text-ink">{t('settings.instagram')}</p>
                <label className="ml-auto flex items-center gap-2 text-xs text-ink-muted">
                  <input
                    type="checkbox"
                    checked={data.config.instagram.enabled}
                    onChange={(e) =>
                      setData({
                        ...data,
                        config: {
                          ...data.config,
                          instagram: { ...data.config.instagram, enabled: e.target.checked },
                        },
                      })
                    }
                  />
                  {t('settings.enabled')}
                </label>
              </div>
              <Input
                placeholder="@radeski"
                value={data.config.instagram.username}
                onChange={(e) =>
                  setData({
                    ...data,
                    config: {
                      ...data.config,
                      instagram: { ...data.config.instagram, username: e.target.value },
                    },
                  })
                }
              />
              <Input
                placeholder="https://instagram.com/..."
                value={data.config.instagram.profileUrl}
                onChange={(e) =>
                  setData({
                    ...data,
                    config: {
                      ...data.config,
                      instagram: { ...data.config.instagram, profileUrl: e.target.value },
                    },
                  })
                }
              />
              <Textarea
                rows={2}
                placeholder={t('settings.notesPh')}
                value={data.config.instagram.notes}
                onChange={(e) =>
                  setData({
                    ...data,
                    config: {
                      ...data.config,
                      instagram: { ...data.config.instagram, notes: e.target.value },
                    },
                  })
                }
              />
            </div>

            <div className="rounded-2xl border border-teal-100 bg-white/90 p-4 shadow-soft space-y-3">
              <div className="flex items-center gap-2">
                <Globe className="h-5 w-5 text-teal-700" />
                <p className="font-semibold text-ink">{t('settings.websites')}</p>
                <Button
                  type="button"
                  variant="ghost"
                  className="ml-auto text-xs"
                  onClick={() =>
                    setData({
                      ...data,
                      config: {
                        ...data.config,
                        websites: [
                          ...data.config.websites,
                          {
                            id: `new_${Date.now()}`,
                            name: 'Sayt',
                            url: 'https://',
                            enabled: true,
                          },
                        ],
                      },
                    })
                  }
                >
                  <Plus className="h-4 w-4 mr-1" />
                  {t('settings.addSite')}
                </Button>
              </div>
              {data.config.websites.length === 0 && (
                <p className="text-sm text-ink-muted">{t('settings.noSites')}</p>
              )}
              {data.config.websites.map((site, idx) => (
                <div
                  key={site.id || idx}
                  className="grid gap-2 sm:grid-cols-[1fr_2fr_auto_auto] items-center border border-teal-50 rounded-xl p-3"
                >
                  <Input
                    placeholder={t('settings.siteName')}
                    value={site.name}
                    onChange={(e) => {
                      const websites = [...data.config.websites];
                      websites[idx] = { ...site, name: e.target.value };
                      setData({ ...data, config: { ...data.config, websites } });
                    }}
                  />
                  <Input
                    placeholder="https://"
                    value={site.url}
                    onChange={(e) => {
                      const websites = [...data.config.websites];
                      websites[idx] = { ...site, url: e.target.value };
                      setData({ ...data, config: { ...data.config, websites } });
                    }}
                  />
                  <label className="flex items-center gap-1 text-xs text-ink-muted whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={site.enabled}
                      onChange={(e) => {
                        const websites = [...data.config.websites];
                        websites[idx] = { ...site, enabled: e.target.checked };
                        setData({ ...data, config: { ...data.config, websites } });
                      }}
                    />
                    ON
                  </label>
                  <button
                    type="button"
                    className="text-rose-600 p-2"
                    onClick={() => {
                      const websites = data.config.websites.filter((_, i) => i !== idx);
                      setData({ ...data, config: { ...data.config, websites } });
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              {(user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') && (
                <Button type="button" onClick={save} disabled={saving}>
                  {saving ? t('common.saving') : t('settings.save')}
                </Button>
              )}
              {(user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') && (
                <Button type="button" variant="secondary" onClick={runAudit} disabled={auditing}>
                  {auditing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      {t('settings.auditing')}
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-2" />
                      {t('settings.runAudit')}
                    </>
                  )}
                </Button>
              )}
            </div>

            {data.lastAudit && (
              <div className="rounded-2xl border border-amber-100 bg-amber-50/60 p-4 shadow-soft space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-ink">{t('settings.lastAudit')}</p>
                  <span className="text-sm font-bold text-teal-800">
                    {data.lastAudit.score != null ? `${data.lastAudit.score}/100` : '—'}
                  </span>
                </div>
                {data.lastAudit.at && (
                  <p className="text-xs text-ink-muted">
                    {new Date(data.lastAudit.at).toLocaleString()}
                  </p>
                )}
                {data.lastAudit.overview && (
                  <p className="text-sm text-ink whitespace-pre-wrap">{data.lastAudit.overview}</p>
                )}
                {Array.isArray(data.lastAudit.priorities) && data.lastAudit.priorities.length > 0 && (
                  <ul className="text-sm list-disc pl-5 space-y-1">
                    {data.lastAudit.priorities.map((p: string, i: number) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                )}
                {Array.isArray(data.lastAudit.items) && data.lastAudit.items.length > 0 && (
                  <div className="space-y-2">
                    {data.lastAudit.items.slice(0, 12).map((it: any, i: number) => (
                      <div
                        key={i}
                        className="rounded-xl bg-white/80 border border-amber-100 p-3 text-sm"
                      >
                        <p className="font-medium">
                          [{it.severity}] {it.channel} · {it.title}
                        </p>
                        <p className="text-ink-muted mt-1">{it.detail}</p>
                        <p className="text-teal-800 mt-1">{it.action}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </AppShell>
    </RoleGate>
  );
}
