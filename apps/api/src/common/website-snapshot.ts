/**
 * Sayt sahifalarini oʻqish — AI audit va AI assistant uchun.
 * Faqat admin Integratsiyalar sahifasida qoʻshgan saytlar oʻqiladi.
 */

export function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function metaContent(html: string, name: string) {
  const re = new RegExp(
    `<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']+)["']`,
    'i',
  );
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${name}["']`,
    'i',
  );
  return html.match(re)?.[1] || html.match(re2)?.[1] || '';
}

async function fetchHtml(url: string) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(10000),
    headers: {
      'user-agent': 'RadeskiKPI-AI-Monitor/1.0',
      accept: 'text/html,application/xhtml+xml',
    },
    redirect: 'follow',
  });
  const html = (await res.text()).slice(0, 300_000);
  return { res, html };
}

export async function snapshotWebsite(url: string, opts?: { textLimit?: number }) {
  try {
    const u = new URL(url);
    if (!['http:', 'https:'].includes(u.protocol)) {
      return { url, error: 'Faqat http/https' };
    }
    const { res, html } = await fetchHtml(url);
    const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || '';
    const h1s = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)]
      .map((m) => stripHtml(m[1]).slice(0, 120))
      .filter(Boolean)
      .slice(0, 5);
    return {
      url,
      status: res.status,
      ok: res.ok,
      title: stripHtml(title).slice(0, 200),
      description: metaContent(html, 'description').slice(0, 300),
      ogTitle: metaContent(html, 'og:title').slice(0, 200),
      ogDescription: metaContent(html, 'og:description').slice(0, 300),
      canonical:
        html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1] || '',
      h1s,
      textSample: stripHtml(html).slice(0, opts?.textLimit ?? 2500),
    };
  } catch (e: any) {
    return { url, error: String(e?.message || e).slice(0, 200) };
  }
}

/** Bosh sahifadan keyin oʻqishga arziydigan ichki sahifalar */
const USEFUL_PATH =
  /xizmat|uslug|услуг|service|narx|price|цен|prays|about|haqida|o-nas|о-нас|kontakt|контакт|contact|doctor|shifokor|vrach|врач|team|jamoa|aksiya|акци|promo|faq/i;

function internalLinks(html: string, base: URL, limit: number) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of html.matchAll(/<a[^>]+href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let u: URL;
    try {
      u = new URL(m[1], base);
    } catch {
      continue;
    }
    if (u.hostname !== base.hostname || !['http:', 'https:'].includes(u.protocol)) continue;
    if (/\.(jpg|jpeg|png|webp|gif|svg|pdf|zip|mp4)$/i.test(u.pathname)) continue;
    u.hash = '';
    const key = u.toString().replace(/\/$/, '');
    if (key === base.toString().replace(/\/$/, '') || seen.has(key)) continue;
    const label = stripHtml(m[2]);
    if (!USEFUL_PATH.test(u.pathname) && !USEFUL_PATH.test(label)) continue;
    seen.add(key);
    out.push(u.toString());
    if (out.length >= limit) break;
  }
  return out;
}

export type SitePage = { url: string; title: string; text: string };
export type SiteRead = {
  name: string;
  url: string;
  ok: boolean;
  error?: string;
  description?: string;
  pages: SitePage[];
};

const CACHE_MS = 30 * 60 * 1000;
const cache = new Map<string, { at: number; data: SiteRead }>();

/**
 * Sayt bosh sahifasi + 4 tagacha foydali ichki sahifa (xizmatlar, narxlar, kontaktlar…).
 * 30 daqiqa keshlanadi — assistant har savolda saytni qayta yuklamaydi.
 */
export async function readSite(name: string, url: string): Promise<SiteRead> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;

  let data: SiteRead;
  try {
    const base = new URL(url);
    if (!['http:', 'https:'].includes(base.protocol)) throw new Error('Faqat http/https');
    const { res, html } = await fetchHtml(url);
    const pages: SitePage[] = [
      {
        url: res.url || url,
        title: stripHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').slice(0, 200),
        text: stripHtml(html).slice(0, 4000),
      },
    ];
    const subs = await Promise.all(
      internalLinks(html, new URL(res.url || url), 4).map(async (link) => {
        try {
          const sub = await fetchHtml(link);
          if (!sub.res.ok) return null;
          return {
            url: link,
            title: stripHtml(sub.html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').slice(0, 200),
            text: stripHtml(sub.html).slice(0, 2500),
          };
        } catch {
          return null; // bitta sahifa ochilmasa — qolganlari yetadi
        }
      }),
    );
    for (const p of subs) if (p) pages.push(p);
    data = {
      name,
      url,
      ok: res.ok,
      description: metaContent(html, 'description').slice(0, 300),
      pages,
    };
  } catch (e: any) {
    data = { name, url, ok: false, error: String(e?.message || e).slice(0, 200), pages: [] };
  }
  cache.set(url, { at: Date.now(), data });
  return data;
}

/** AI matnidan markdown belgilarini olib tashlash (**, ##, `…`) — oddiy matn qoladi */
export function stripMarkdown(text: string) {
  return String(text || '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/(^|\s)\*(\S[^*\n]*?)\*(?=\s|$|[.,;:!?])/g, '$1$2')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^\s*[*•]\s+/gm, '- ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*{2,}/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
