'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { RoleGate } from '@/components/RoleGate';
import { Button, Input, SectionHeader, Textarea } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { useI18n } from '@/lib/i18n';
import { api } from '@/lib/api';
import { todayISO, weekStartISO } from '@/types';
import { cn } from '@/lib/utils';

const emptySeo = {
  newArticle: false,
  newVideo: false,
  newReviews: false,
  pageUpdated: false,
  seoOk: false,
  pagespeedScore: 75,
};
const emptyAds = { aired: false, channel: '', timeSlot: '', note: '' };

export default function MarketingPage() {
  const toast = useToast();
  const { t } = useI18n();
  const [date, setDate] = useState(todayISO());
  const [day, setDay] = useState<any>(null);
  const [seo, setSeo] = useState(emptySeo);
  const [social, setSocial] = useState({
    platform: 'instagram',
    posts: 0,
    stories: 0,
    reels: 0,
    comments: 0,
    likes: 0,
    newFollowers: 0,
    views: 0,
  });
  const [ads, setAds] = useState(emptyAds);
  const [flyer, setFlyer] = useState({ count: 50, location: '' });
  const [blogger, setBlogger] = useState({
    weekStart: weekStartISO(),
    name: '',
    followers: 0,
    niche: '',
    contact: '',
  });
  const [bloggers, setBloggers] = useState<any[]>([]);

  async function load() {
    try {
      const [d, b] = await Promise.all([
        api(`/kpi/day?date=${date}`),
        api('/kpi/bloggers').catch(() => []),
      ]);
      setDay(d);
      setBloggers(b);
      if (d.seo) {
        setSeo({
          newArticle: d.seo.newArticle,
          newVideo: d.seo.newVideo,
          newReviews: d.seo.newReviews,
          pageUpdated: d.seo.pageUpdated,
          seoOk: d.seo.seoOk,
          pagespeedScore: d.seo.pagespeedScore ?? 75,
        });
      } else {
        setSeo(emptySeo);
      }
      if (d.ads) {
        setAds({
          aired: d.ads.aired,
          channel: d.ads.channel || '',
          timeSlot: d.ads.timeSlot || '',
          note: d.ads.note || '',
        });
      } else {
        setAds(emptyAds);
      }
      setSocial((prev) => {
        const existing = (d.social || []).find((s: any) => s.platform === prev.platform);
        if (!existing) {
          return {
            ...prev,
            posts: 0,
            stories: 0,
            reels: 0,
            comments: 0,
            likes: 0,
            newFollowers: 0,
            views: 0,
          };
        }
        return {
          platform: existing.platform,
          posts: existing.posts ?? 0,
          stories: existing.stories ?? 0,
          reels: existing.reels ?? 0,
          comments: existing.comments ?? 0,
          likes: existing.likes ?? 0,
          newFollowers: existing.newFollowers ?? 0,
          views: existing.views ?? 0,
        };
      });
    } catch (e: any) {
      toast.error(t('common.error'), e.message);
    }
  }

  useEffect(() => {
    load();
  }, [date]);

  async function saveSeo(e: FormEvent) {
    e.preventDefault();
    try {
      await api('/kpi/seo', { method: 'POST', body: JSON.stringify({ date, ...seo }) });
      toast.success(t('common.saved'));
      await load();
    } catch (err: any) {
      toast.error(t('marketing.saveFail'), err.message);
    }
  }

  async function saveSocial(e: FormEvent) {
    e.preventDefault();
    try {
      const { platform, ...rest } = social;
      await api(`/kpi/social/${platform}`, { method: 'POST', body: JSON.stringify({ date, ...rest }) });
      toast.success(t('common.saved'));
      await load();
    } catch (err: any) {
      toast.error(t('marketing.saveFail'), err.message);
    }
  }

  async function saveAds(e: FormEvent) {
    e.preventDefault();
    try {
      await api('/kpi/ads', { method: 'POST', body: JSON.stringify({ date, ...ads }) });
      toast.success(t('common.saved'));
      await load();
    } catch (err: any) {
      toast.error(t('marketing.saveFail'), err.message);
    }
  }

  async function saveFlyer(e: FormEvent) {
    e.preventDefault();
    try {
      await api('/kpi/flyers', { method: 'POST', body: JSON.stringify({ date, ...flyer }) });
      toast.success(t('common.saved'));
      setFlyer({ count: 50, location: '' });
      await load();
    } catch (err: any) {
      toast.error(t('marketing.saveFail'), err.message);
    }
  }

  async function saveBlogger(e: FormEvent) {
    e.preventDefault();
    try {
      await api('/kpi/bloggers', { method: 'POST', body: JSON.stringify(blogger) });
      toast.success(t('marketing.bloggerAdded'));
      setBlogger((b) => ({ ...b, name: '', followers: 0, niche: '', contact: '' }));
      await load();
    } catch (err: any) {
      toast.error(t('marketing.saveFail'), err.message);
    }
  }

  const seoFlags: Array<{ key: keyof typeof seo; label: string }> = [
    { key: 'newArticle', label: t('marketing.newArticle') },
    { key: 'newVideo', label: t('marketing.newVideo') },
    { key: 'newReviews', label: t('marketing.newReviews') },
    { key: 'pageUpdated', label: t('marketing.pageUpdated') },
    { key: 'seoOk', label: t('marketing.seoOk') },
  ];

  return (
    <AppShell>
      <RoleGate allow={['MANAGER', 'SUPER_ADMIN']}>
      <SectionHeader
        title={t('marketing.title')}
        action={
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-11 px-3 rounded-xl border border-teal-200 bg-white/90 text-sm"
          />
        }
      />

      <div className="grid lg:grid-cols-2 gap-5">
        <form onSubmit={saveSeo} className="rounded-3xl border border-teal-100 bg-white/80 p-5 shadow-soft space-y-3">
          <h3 className="font-display text-2xl">{t('marketing.seoTitle')}</h3>
          {seoFlags.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setSeo((s) => ({ ...s, [f.key]: !s[f.key] }))}
              className={cn(
                'w-full text-left px-3 py-2.5 rounded-xl border text-sm transition',
                seo[f.key] ? 'bg-teal-50 border-teal-200 font-medium' : 'border-teal-50 hover:bg-sand-50',
              )}
            >
              {seo[f.key] ? '✓ ' : '○ '}
              {f.label}
            </button>
          ))}
          <Input
            label={t('marketing.pagespeed')}
            type="number"
            min={0}
            max={100}
            value={seo.pagespeedScore}
            onChange={(e) => setSeo({ ...seo, pagespeedScore: Number(e.target.value) })}
          />
          <Button type="submit">{t('marketing.saveSeo')}</Button>
        </form>

        <form onSubmit={saveSocial} className="rounded-3xl border border-teal-100 bg-white/80 p-5 shadow-soft space-y-3">
          <h3 className="font-display text-2xl">{t('marketing.socialTitle')}</h3>
          <div className="flex gap-2">
            {['instagram', 'telegram', 'youtube'].map((p) => (
              <button
                key={p}
                type="button"
                onClick={() =>
                  setSocial((s) => {
                    const existing = (day?.social || []).find((x: any) => x.platform === p);
                    if (!existing) {
                      return {
                        platform: p,
                        posts: 0,
                        stories: 0,
                        reels: 0,
                        comments: 0,
                        likes: 0,
                        newFollowers: 0,
                        views: 0,
                      };
                    }
                    return {
                      platform: p,
                      posts: existing.posts ?? 0,
                      stories: existing.stories ?? 0,
                      reels: existing.reels ?? 0,
                      comments: existing.comments ?? 0,
                      likes: existing.likes ?? 0,
                      newFollowers: existing.newFollowers ?? 0,
                      views: existing.views ?? 0,
                    };
                  })
                }
                className={cn(
                  'px-3 py-1.5 rounded-lg text-sm capitalize border',
                  social.platform === p ? 'bg-teal-700 text-white border-teal-700' : 'border-teal-100',
                )}
              >
                {p}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {(
              [
                ['posts', t('marketing.posts')],
                ['stories', t('marketing.stories')],
                ['reels', t('marketing.reels')],
                ['comments', t('marketing.comments')],
                ['likes', t('marketing.likes')],
                ['newFollowers', t('marketing.newFollowers')],
                ['views', t('marketing.views')],
              ] as const
            ).map(([key, label]) => (
              <Input
                key={key}
                label={label}
                type="number"
                min={0}
                value={(social as any)[key]}
                onChange={(e) => setSocial({ ...social, [key]: Number(e.target.value) })}
              />
            ))}
          </div>
          <Button type="submit">{t('marketing.saveStats')}</Button>

          <div className="pt-3 border-t border-teal-50">
            <p className="text-xs text-ink-muted mb-2">{t('marketing.todayLogs')}</p>
            <div className="space-y-1">
              {(day?.social || []).map((s: any) => (
                <p key={s.id} className="text-sm">
                  <span className="capitalize font-medium">{s.platform}</span>: post {s.posts}, stories{' '}
                  {s.stories}, +{s.newFollowers} obunachi
                </p>
              ))}
            </div>
          </div>
        </form>

        <form onSubmit={saveAds} className="rounded-3xl border border-teal-100 bg-white/80 p-5 shadow-soft space-y-3">
          <h3 className="font-display text-2xl">{t('marketing.adsTitle')}</h3>
          <button
            type="button"
            onClick={() => setAds((a) => ({ ...a, aired: !a.aired }))}
            className={cn(
              'w-full text-left px-3 py-3 rounded-xl border text-sm',
              ads.aired ? 'bg-teal-50 border-teal-200' : 'border-teal-50',
            )}
          >
            {ads.aired ? `✓ ${t('marketing.aired')}` : `○ ${t('marketing.notAired')}`}
          </button>
          <Input label={t('marketing.channel')} value={ads.channel} onChange={(e) => setAds({ ...ads, channel: e.target.value })} />
          <Input label={t('marketing.time')} value={ads.timeSlot} onChange={(e) => setAds({ ...ads, timeSlot: e.target.value })} />
          <Textarea label={t('marketing.note')} value={ads.note} onChange={(e) => setAds({ ...ads, note: e.target.value })} />
          <Button type="submit">{t('common.save')}</Button>
        </form>

        <div className="space-y-5">
          <form onSubmit={saveFlyer} className="rounded-3xl border border-teal-100 bg-white/80 p-5 shadow-soft space-y-3">
            <h3 className="font-display text-2xl">{t('marketing.flyerTitle')}</h3>
            <Input
              label={t('marketing.copies')}
              type="number"
              min={1}
              value={flyer.count}
              onChange={(e) => setFlyer({ ...flyer, count: Number(e.target.value) })}
            />
            <Input
              label={t('marketing.location')}
              value={flyer.location}
              onChange={(e) => setFlyer({ ...flyer, location: e.target.value })}
              required
            />
            <Button type="submit">{t('common.add')}</Button>
          </form>

          <form onSubmit={saveBlogger} className="rounded-3xl border border-teal-100 bg-white/80 p-5 shadow-soft space-y-3">
            <h3 className="font-display text-2xl">{t('marketing.bloggerTitle')}</h3>
            <Input label={t('marketing.name')} value={blogger.name} onChange={(e) => setBlogger({ ...blogger, name: e.target.value })} required />
            <Input
              label={t('marketing.followers')}
              type="number"
              value={blogger.followers}
              onChange={(e) => setBlogger({ ...blogger, followers: Number(e.target.value) })}
            />
            <Input label={t('marketing.niche')} value={blogger.niche} onChange={(e) => setBlogger({ ...blogger, niche: e.target.value })} />
            <Input label={t('marketing.contact')} value={blogger.contact} onChange={(e) => setBlogger({ ...blogger, contact: e.target.value })} />
            <Button type="submit">{t('common.add')}</Button>
            <div className="pt-2 space-y-1 max-h-40 overflow-y-auto">
              {bloggers.slice(0, 8).map((b) => (
                <p key={b.id} className="text-sm">
                  {b.name} · {b.followers.toLocaleString()} · {b.niche || '—'}
                </p>
              ))}
            </div>
          </form>
        </div>
      </div>
      </RoleGate>
    </AppShell>
  );
}
