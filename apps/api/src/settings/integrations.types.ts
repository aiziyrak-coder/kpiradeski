export type WebsiteIntegration = {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
};

export type TelegramChannel = {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  notes?: string;
};

export type InstagramProfile = {
  id: string;
  name: string;
  username: string;
  profileUrl: string;
  enabled: boolean;
  notes?: string;
};

export type IntegrationsConfig = {
  /** @deprecated single channel — kept for backward compat, mirrored from telegramChannels[0] */
  telegram: {
    enabled: boolean;
    channelUrl: string;
    botUsername: string;
    notes: string;
  };
  /** @deprecated single profile */
  instagram: {
    enabled: boolean;
    username: string;
    profileUrl: string;
    notes: string;
  };
  telegramChannels: TelegramChannel[];
  instagramProfiles: InstagramProfile[];
  websites: WebsiteIntegration[];
};

export function defaultIntegrations(): IntegrationsConfig {
  return {
    telegram: { enabled: false, channelUrl: '', botUsername: '', notes: '' },
    instagram: { enabled: false, username: '', profileUrl: '', notes: '' },
    telegramChannels: [],
    instagramProfiles: [],
    websites: [
      {
        id: 'web_radeski',
        name: 'radeski.uz',
        url: 'https://radeski.uz',
        enabled: true,
      },
    ],
  };
}

function uid(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/** Legacy single fields + arrays → bitta toza config */
export function normalizeIntegrations(
  saved: Partial<IntegrationsConfig> | null | undefined,
): IntegrationsConfig {
  const base = defaultIntegrations();
  const s = saved || {};

  let telegramChannels: TelegramChannel[] = Array.isArray(s.telegramChannels)
    ? s.telegramChannels
        .filter((c) => c?.url)
        .map((c, i) => ({
          id: c.id || uid(`tg${i}`),
          name: String(c.name || 'Telegram').trim() || 'Telegram',
          url: String(c.url).trim(),
          enabled: c.enabled !== false,
          notes: String(c.notes || '').trim(),
        }))
    : [];

  if (!telegramChannels.length && s.telegram?.channelUrl) {
    telegramChannels = [
      {
        id: 'tg_legacy',
        name: 'Asosiy kanal',
        url: String(s.telegram.channelUrl).trim(),
        enabled: s.telegram.enabled !== false,
        notes: String(s.telegram.notes || '').trim(),
      },
    ];
  }

  let instagramProfiles: InstagramProfile[] = Array.isArray(s.instagramProfiles)
    ? s.instagramProfiles
        .filter((p) => p?.profileUrl || p?.username)
        .map((p, i) => {
          const username = String(p.username || '')
            .trim()
            .replace(/^@/, '');
          const profileUrl =
            String(p.profileUrl || '').trim() ||
            (username ? `https://instagram.com/${username}` : '');
          return {
            id: p.id || uid(`ig${i}`),
            name: String(p.name || username || 'Instagram').trim() || 'Instagram',
            username,
            profileUrl,
            enabled: p.enabled !== false,
            notes: String(p.notes || '').trim(),
          };
        })
    : [];

  if (!instagramProfiles.length && (s.instagram?.profileUrl || s.instagram?.username)) {
    const username = String(s.instagram?.username || '')
      .trim()
      .replace(/^@/, '');
    const profileUrl =
      String(s.instagram?.profileUrl || '').trim() ||
      (username ? `https://instagram.com/${username}` : '');
    if (profileUrl) {
      instagramProfiles = [
        {
          id: 'ig_legacy',
          name: username || 'Instagram',
          username,
          profileUrl,
          enabled: s.instagram?.enabled !== false,
          notes: String(s.instagram?.notes || '').trim(),
        },
      ];
    }
  }

  const websites: WebsiteIntegration[] = Array.isArray(s.websites)
    ? s.websites
        .filter((w) => w?.url)
        .map((w, i) => ({
          id: w.id || uid(`web${i}`),
          name: String(w.name || 'Sayt').trim() || 'Sayt',
          url: String(w.url).trim(),
          enabled: w.enabled !== false,
        }))
    : [];

  // Birinchi marta saqlanmagan / boʻsh — radeski.uz default
  const finalWebsites = websites.length ? websites : base.websites;

  const primaryTg = telegramChannels.find((c) => c.enabled) || telegramChannels[0];
  const primaryIg = instagramProfiles.find((p) => p.enabled) || instagramProfiles[0];

  return {
    telegram: {
      enabled: !!primaryTg?.enabled && !!primaryTg?.url,
      channelUrl: primaryTg?.url || '',
      botUsername: String(s.telegram?.botUsername || '').trim(),
      notes: primaryTg?.notes || String(s.telegram?.notes || '').trim(),
    },
    instagram: {
      enabled: !!primaryIg?.enabled && !!(primaryIg?.profileUrl || primaryIg?.username),
      username: primaryIg?.username || '',
      profileUrl: primaryIg?.profileUrl || '',
      notes: primaryIg?.notes || String(s.instagram?.notes || '').trim(),
    },
    telegramChannels,
    instagramProfiles,
    websites: finalWebsites,
  };
}
