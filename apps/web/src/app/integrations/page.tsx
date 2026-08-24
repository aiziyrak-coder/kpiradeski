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
type TgChannel = { id?: string; name: string; url: string; enabled: boolean; notes?: string };
type IgProfile = {
  id?: string;
  name: string;
  username: string;
  profileUrl: string;
  enabled: boolean;
  notes?: string;
};

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
    telegramChannels: TgChannel[];
    instagramProfiles: IgProfile[];
    websites: Website[];
  };
  runtime: { telegramBotConfigured: boolean; telegramChatConfigured: boolean };
  lastAudit: any;
};

function uid(prefix: string) {
  return `${prefix}_${Date.now()}`;
}

export default function IntegrationsPage() {
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
      setData({
        ...res,
        config: {
          ...res.config,
          telegramChannels: res.config.telegramChannels || [],
          instagramProfiles: res.config.instagramProfiles || [],
          websites: res.config.websites || [],
        },
      });
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
        body: JSON.stringify({
          telegram: data.config.telegram,
          instagram: data.config.instagram,
          telegramChannels: data.config.telegramChannels,
          instagramProfiles: data.config.instagramProfiles,
          websites: data.config.websites,
        }),
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

  const canEdit = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';

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
            {/* Telegram channels */}
            <div className="rounded-2xl border border-teal-100 bg-white/90 p-4 shadow-soft space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Radio className="h-5 w-5 text-sky-600" />
                <p className="font-semibold text-ink">{t('settings.telegram')}</p>
                {canEdit && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="ml-auto text-xs"
                    onClick={() =>
                      setData({
                        ...data,
                        config: {
                          ...data.config,
                          telegramChannels: [
                            ...data.config.telegramChannels,
                            {
                              id: uid('tg'),
                              name: 'Kanal',
                              url: 'https://t.me/',
                              enabled: true,
                              notes: '',
                            },
                          ],
                        },
                      })
                    }
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    {t('settings.addChannel')}
                  </Button>
                )}
              </div>
              <Input
                placeholder="@bot (KPI bot)"
                value={data.config.telegram.botUsername}
                disabled={!canEdit}
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
              <p className="text-xs text-ink-muted">
                Bot env: {data.runtime.telegramBotConfigured ? '✓' : '—'} · Chat:{' '}
                {data.runtime.telegramChatConfigured ? '✓' : '—'}
              </p>
              {data.config.telegramChannels.length === 0 && (
                <p className="text-sm text-ink-muted">{t('settings.noChannels')}</p>
              )}
              {data.config.telegramChannels.map((ch, idx) => (
                <div
                  key={ch.id || idx}
                  className="grid gap-2 border border-teal-50 rounded-xl p-3"
                >
                  <div className="grid gap-2 sm:grid-cols-[1fr_2fr_auto_auto] items-center">
                    <Input
                      placeholder={t('settings.channelName')}
                      value={ch.name}
                      disabled={!canEdit}
                      onChange={(e) => {
                        const telegramChannels = [...data.config.telegramChannels];
                        telegramChannels[idx] = { ...ch, name: e.target.value };
                        setData({ ...data, config: { ...data.config, telegramChannels } });
                      }}
                    />
                    <Input
                      placeholder="https://t.me/..."
                      value={ch.url}
                      disabled={!canEdit}
                      onChange={(e) => {
                        const telegramChannels = [...data.config.telegramChannels];
                        telegramChannels[idx] = { ...ch, url: e.target.value };
                        setData({ ...data, config: { ...data.config, telegramChannels } });
                      }}
                    />
                    <label className="flex items-center gap-1 text-xs text-ink-muted whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={ch.enabled}
                        disabled={!canEdit}
                        onChange={(e) => {
                          const telegramChannels = [...data.config.telegramChannels];
                          telegramChannels[idx] = { ...ch, enabled: e.target.checked };
                          setData({ ...data, config: { ...data.config, telegramChannels } });
                        }}
                      />
                      ON
                    </label>
                    {canEdit && (
                      <button
                        type="button"
                        className="text-rose-600 p-2"
                        onClick={() => {
                          const telegramChannels = data.config.telegramChannels.filter(
                            (_, i) => i !== idx,
                          );
                          setData({ ...data, config: { ...data.config, telegramChannels } });
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <Textarea
                    rows={2}
                    placeholder={t('settings.notesPh')}
                    value={ch.notes || ''}
                    disabled={!canEdit}
                    onChange={(e) => {
                      const telegramChannels = [...data.config.telegramChannels];
                      telegramChannels[idx] = { ...ch, notes: e.target.value };
                      setData({ ...data, config: { ...data.config, telegramChannels } });
                    }}
                  />
                </div>
              ))}
            </div>

            {/* Instagram profiles */}
            <div className="rounded-2xl border border-teal-100 bg-white/90 p-4 shadow-soft space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Instagram className="h-5 w-5 text-pink-600" />
                <p className="font-semibold text-ink">{t('settings.instagram')}</p>
                {canEdit && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="ml-auto text-xs"
                    onClick={() =>
                      setData({
                        ...data,
                        config: {
                          ...data.config,
                          instagramProfiles: [
                            ...data.config.instagramProfiles,
                            {
                              id: uid('ig'),
                              name: 'Instagram',
                              username: '',
                              profileUrl: 'https://instagram.com/',
                              enabled: true,
                              notes: '',
                            },
                          ],
                        },
                      })
                    }
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    {t('settings.addProfile')}
                  </Button>
                )}
              </div>
              {data.config.instagramProfiles.length === 0 && (
                <p className="text-sm text-ink-muted">{t('settings.noProfiles')}</p>
              )}
              {data.config.instagramProfiles.map((p, idx) => (
                <div
                  key={p.id || idx}
                  className="grid gap-2 border border-teal-50 rounded-xl p-3"
                >
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input
                      placeholder={t('settings.profileName')}
                      value={p.name}
                      disabled={!canEdit}
                      onChange={(e) => {
                        const instagramProfiles = [...data.config.instagramProfiles];
                        instagramProfiles[idx] = { ...p, name: e.target.value };
                        setData({ ...data, config: { ...data.config, instagramProfiles } });
                      }}
                    />
                    <Input
                      placeholder="@radeski"
                      value={p.username}
                      disabled={!canEdit}
                      onChange={(e) => {
                        const username = e.target.value.replace(/^@/, '');
                        const instagramProfiles = [...data.config.instagramProfiles];
                        instagramProfiles[idx] = {
                          ...p,
                          username,
                          profileUrl:
                            p.profileUrl && !p.profileUrl.endsWith('/')
                              ? p.profileUrl
                              : username
                                ? `https://instagram.com/${username}`
                                : p.profileUrl,
                        };
                        setData({ ...data, config: { ...data.config, instagramProfiles } });
                      }}
                    />
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto] items-center">
                    <Input
                      placeholder="https://instagram.com/..."
                      value={p.profileUrl}
                      disabled={!canEdit}
                      onChange={(e) => {
                        const instagramProfiles = [...data.config.instagramProfiles];
                        instagramProfiles[idx] = { ...p, profileUrl: e.target.value };
                        setData({ ...data, config: { ...data.config, instagramProfiles } });
                      }}
                    />
                    <label className="flex items-center gap-1 text-xs text-ink-muted whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={p.enabled}
                        disabled={!canEdit}
                        onChange={(e) => {
                          const instagramProfiles = [...data.config.instagramProfiles];
                          instagramProfiles[idx] = { ...p, enabled: e.target.checked };
                          setData({ ...data, config: { ...data.config, instagramProfiles } });
                        }}
                      />
                      ON
                    </label>
                    {canEdit && (
                      <button
                        type="button"
                        className="text-rose-600 p-2"
                        onClick={() => {
                          const instagramProfiles = data.config.instagramProfiles.filter(
                            (_, i) => i !== idx,
                          );
                          setData({ ...data, config: { ...data.config, instagramProfiles } });
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <Textarea
                    rows={2}
                    placeholder={t('settings.notesPh')}
                    value={p.notes || ''}
                    disabled={!canEdit}
                    onChange={(e) => {
                      const instagramProfiles = [...data.config.instagramProfiles];
                      instagramProfiles[idx] = { ...p, notes: e.target.value };
                      setData({ ...data, config: { ...data.config, instagramProfiles } });
                    }}
                  />
                </div>
              ))}
            </div>

            {/* Websites */}
            <div className="rounded-2xl border border-teal-100 bg-white/90 p-4 shadow-soft space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Globe className="h-5 w-5 text-teal-700" />
                <p className="font-semibold text-ink">{t('settings.websites')}</p>
                {canEdit && (
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
                              id: uid('web'),
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
                )}
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
                    disabled={!canEdit}
                    onChange={(e) => {
                      const websites = [...data.config.websites];
                      websites[idx] = { ...site, name: e.target.value };
                      setData({ ...data, config: { ...data.config, websites } });
                    }}
                  />
                  <Input
                    placeholder="https://radeski.uz"
                    value={site.url}
                    disabled={!canEdit}
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
                      disabled={!canEdit}
                      onChange={(e) => {
                        const websites = [...data.config.websites];
                        websites[idx] = { ...site, enabled: e.target.checked };
                        setData({ ...data, config: { ...data.config, websites } });
                      }}
                    />
                    ON
                  </label>
                  {canEdit && (
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
                  )}
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              {canEdit && (
                <Button type="button" onClick={save} disabled={saving}>
                  {saving ? t('common.saving') : t('settings.save')}
                </Button>
              )}
              {canEdit && (
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
                  <p className="text-sm text-ink leading-relaxed">{data.lastAudit.overview}</p>
                )}
                {Array.isArray(data.lastAudit.priorities) && data.lastAudit.priorities.length > 0 && (
                  <ul className="text-sm list-disc pl-5 space-y-1 text-ink">
                    {data.lastAudit.priorities.map((p: string, i: number) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                )}
                {Array.isArray(data.lastAudit.items) && data.lastAudit.items.length > 0 && (
                  <div className="space-y-2">
                    {data.lastAudit.items.slice(0, 10).map((it: any, i: number) => (
                      <div
                        key={i}
                        className="rounded-xl bg-white/80 border border-amber-100/80 p-3 text-sm"
                      >
                        <p className="font-medium">
                          [{it.channel}] {it.title}
                        </p>
                        {it.detail && <p className="text-ink-muted mt-1">{it.detail}</p>}
                        {it.action && (
                          <p className="text-teal-800 mt-1 text-xs font-medium">→ {it.action}</p>
                        )}
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
