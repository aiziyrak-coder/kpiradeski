/** Shared proof blob cache — prevents N×remount fetch storms on /today */

import { getToken } from './api';

type CacheEntry = { url: string; mime: string; name: string };

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<CacheEntry | null>>();
let active = 0;
const queue: Array<() => void> = [];
const MAX_CONCURRENT = 3;

function pump() {
  while (active < MAX_CONCURRENT && queue.length) {
    const next = queue.shift();
    if (next) next();
  }
}

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const run = () => {
      active += 1;
      fn()
        .then(resolve, reject)
        .finally(() => {
          active -= 1;
          pump();
        });
    };
    queue.push(run);
    pump();
  });
}

function guessMimeFromName(name: string): string | null {
  const n = name.toLowerCase();
  if (/\.jpe?g$/i.test(n)) return 'image/jpeg';
  if (/\.png$/i.test(n)) return 'image/png';
  if (/\.webp$/i.test(n)) return 'image/webp';
  if (/\.gif$/i.test(n)) return 'image/gif';
  if (/\.pdf$/i.test(n)) return 'application/pdf';
  return null;
}

function sniffImageMime(buf: ArrayBuffer): string | null {
  const u = new Uint8Array(buf.slice(0, 16));
  if (u.length >= 3 && u[0] === 0xff && u[1] === 0xd8 && u[2] === 0xff) return 'image/jpeg';
  if (u.length >= 4 && u[0] === 0x89 && u[1] === 0x50 && u[2] === 0x4e && u[3] === 0x47)
    return 'image/png';
  if (u.length >= 4 && u[0] === 0x47 && u[1] === 0x49 && u[2] === 0x46) return 'image/gif';
  if (
    u.length >= 12 &&
    u[0] === 0x52 &&
    u[1] === 0x49 &&
    u[2] === 0x46 &&
    u[3] === 0x46 &&
    u[8] === 0x57 &&
    u[9] === 0x45 &&
    u[10] === 0x42 &&
    u[11] === 0x50
  )
    return 'image/webp';
  if (u.length >= 4 && u[0] === 0x25 && u[1] === 0x50 && u[2] === 0x44 && u[3] === 0x46)
    return 'application/pdf';
  return null;
}

export function getCachedProofUrl(id: string): string | null {
  return cache.get(id)?.url || null;
}

export function getCachedProof(id: string): CacheEntry | null {
  return cache.get(id) || null;
}

/** Auth fetch → object URL, cached + concurrency-limited */
export async function fetchProofUrl(id: string): Promise<string | null> {
  const entry = await fetchProof(id);
  return entry?.url || null;
}

export async function fetchProof(id: string): Promise<CacheEntry | null> {
  const hit = cache.get(id);
  if (hit) return hit;
  const pending = inflight.get(id);
  if (pending) return pending;

  const job = enqueue(async () => {
    try {
      const token = getToken();
      const res = await fetch(`/api/manager-kpi/proofs/${id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) return null;
      const buf = await res.arrayBuffer();
      const name =
        res.headers
          .get('content-disposition')
          ?.match(/filename\*?=(?:UTF-8'')?\"?([^\";]+)/i)?.[1] || 'dalil';
      const decodedName = decodeURIComponent(name);
      const headerMime = (res.headers.get('content-type') || '').split(';')[0].trim();
      const sniffed = sniffImageMime(buf);
      const fromName = guessMimeFromName(decodedName);
      const mime =
        (headerMime && headerMime !== 'application/octet-stream' ? headerMime : null) ||
        sniffed ||
        fromName ||
        'application/octet-stream';

      const blob = new Blob([buf], { type: mime });
      const url = URL.createObjectURL(blob);
      const entry: CacheEntry = {
        url,
        mime,
        name: decodedName,
      };
      cache.set(id, entry);
      return entry;
    } catch {
      return null;
    } finally {
      inflight.delete(id);
    }
  });

  inflight.set(id, job);
  return job;
}
