/**
 * Brauzerda doim same-origin (/api) — Next rewrite orqali API ga ketadi.
 * Shunda localhost, 192.168.x.x, telefon — hammasi ishlaydi.
 */
function getApiOrigin() {
  if (typeof window !== 'undefined') return '';
  return (
    process.env.API_PROXY_TARGET ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://127.0.0.1:4000'
  );
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function getToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('klinikpi_token');
}

function formatError(data: any, fallback: string) {
  const msg = data?.message ?? data?.error;
  if (Array.isArray(msg)) return msg.join(', ');
  if (typeof msg === 'string') return msg;
  return fallback;
}

export async function api<T = any>(
  path: string,
  options: RequestInit & { raw?: boolean } = {},
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${getApiOrigin()}/api${path}`, {
    ...options,
    headers,
  });

  if (options.raw) {
    if (!res.ok) throw new ApiError(res.status, "So'rov xatosi");
    return res as unknown as T;
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = formatError(data, 'Xatolik yuz berdi');
    // Telegram bogʻlanmagan — sessiyani tozalash shart emas
    if (
      res.status === 401 &&
      typeof window !== 'undefined' &&
      message !== 'TELEGRAM_NOT_LINKED' &&
      !path.startsWith('/auth/telegram') &&
      !path.startsWith('/auth/login')
    ) {
      localStorage.removeItem('klinikpi_token');
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }
    throw new ApiError(res.status, message);
  }
  return data as T;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function downloadReport(kind: 'excel' | 'pdf', from: string, to: string) {
  const token = getToken();
  const res = await fetch(`${getApiOrigin()}/api/reports/${kind}?from=${from}&to=${to}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new ApiError(res.status, "Hisobot yuklab bo'lmadi");
  const blob = await res.blob();
  downloadBlob(blob, `klinikpi-${from}-${to}.${kind === 'excel' ? 'xlsx' : 'pdf'}`);
}
