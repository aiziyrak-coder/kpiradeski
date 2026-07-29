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
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const name =
        res.headers
          .get('content-disposition')
          ?.match(/filename\*?=(?:UTF-8'')?\"?([^\";]+)/i)?.[1] || 'dalil';
      const entry: CacheEntry = {
        url,
        mime: blob.type || 'application/octet-stream',
        name: decodeURIComponent(name),
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
