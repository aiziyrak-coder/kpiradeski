import * as crypto from 'crypto';

export function sha256Hex(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/** Hamming distance for equal-length hex strings */
export function hammingHex(a: string, b: string): number {
  if (!a || !b || a.length !== b.length) return 64;
  let dist = 0;
  for (let i = 0; i < a.length; i += 2) {
    let x = parseInt(a.slice(i, i + 2), 16) ^ parseInt(b.slice(i, i + 2), 16);
    while (x) {
      dist += x & 1;
      x >>= 1;
    }
  }
  return dist;
}

/**
 * JPEG EXIF DateTimeOriginal / DateTime (agar bor).
 * Skrinshotlarda odatda yoʻq.
 * EXIF odatda mahalliy vaqt (TZ yoʻq) — UTC ga aylantirmaymiz.
 */
export function readJpegExifLocal(buf: Buffer): { dateISO: string; minutes: number } | null {
  if (buf.length < 12 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 4 < buf.length && buf[offset] === 0xff) {
    const marker = buf[offset + 1];
    if (marker === 0xda || marker === 0xd9) break;
    const size = buf.readUInt16BE(offset + 2);
    if (size < 2) break;
    if (marker === 0xe1 && offset + 4 + 6 < buf.length) {
      const head = buf.slice(offset + 4, offset + 10).toString('ascii');
      if (head.startsWith('Exif')) {
        const tiff = offset + 4 + 6;
        const parsed = parseExifDateFromTiff(buf, tiff);
        if (parsed) return parsed;
      }
    }
    offset += 2 + size;
  }
  return null;
}

/** @deprecated use readJpegExifLocal */
export function readJpegExifDate(buf: Buffer): Date | null {
  const loc = readJpegExifLocal(buf);
  if (!loc) return null;
  const [y, m, d] = loc.dateISO.split('-').map(Number);
  const h = Math.floor(loc.minutes / 60);
  const min = loc.minutes % 60;
  const dt = new Date(Date.UTC(y, m - 1, d, h - 5, min, 0));
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function parseExifDateFromTiff(buf: Buffer, tiff: number): { dateISO: string; minutes: number } | null {
  if (tiff + 8 > buf.length) return null;
  const le = buf.toString('ascii', tiff, tiff + 2) === 'II';
  const u16 = (o: number) => (le ? buf.readUInt16LE(o) : buf.readUInt16BE(o));
  const u32 = (o: number) => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
  const ifd0 = tiff + u32(tiff + 4);
  const fromIfd = (ifd: number): { dateISO: string; minutes: number } | null => {
    if (ifd < 0 || ifd + 2 > buf.length) return null;
    const count = u16(ifd);
    let exifOff: number | null = null;
    let dateStr: string | null = null;
    for (let i = 0; i < count; i++) {
      const e = ifd + 2 + i * 12;
      if (e + 12 > buf.length) break;
      const tag = u16(e);
      const type = u16(e + 2);
      const num = u32(e + 4);
      const valOff = type === 2 && num <= 4 ? e + 8 : tiff + u32(e + 8);
      if (tag === 0x8769) exifOff = tiff + u32(e + 8);
      if ((tag === 0x9003 || tag === 0x0132) && type === 2 && num >= 19 && valOff + 19 <= buf.length) {
        dateStr = buf.slice(valOff, valOff + 19).toString('ascii');
        if (tag === 0x9003) break;
      }
    }
    if (dateStr) return parseExifLocalString(dateStr);
    if (exifOff) return fromIfd(exifOff);
    return null;
  };
  return fromIfd(ifd0);
}

function parseExifLocalString(s: string): { dateISO: string; minutes: number } | null {
  const m = s.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const y = +m[1];
  const mo = +m[2];
  const d = +m[3];
  const hh = +m[4];
  const mm = +m[5];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || hh > 23 || mm > 59) return null;
  return {
    dateISO: `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
    minutes: hh * 60 + mm,
  };
}

/**
 * Juda sodda 8×8 average-hash JPEG dan (SOF0 o‘qib, to‘liq decode yo‘q).
 * Asosiy himoya — SHA-256 + EXIF; phash faqat JPEG scan-ishonchli bo‘lmasa skip.
 * Bu yerda faylning birinchi/oxirgi blokidan barqaror 16 hex “near” fingerprint.
 */
export function cheapFingerprint(buf: Buffer): string {
  const head = buf.subarray(0, Math.min(4096, buf.length));
  const tail = buf.subarray(Math.max(0, buf.length - 4096));
  const midOff = Math.floor(buf.length / 2);
  const mid = buf.subarray(midOff, Math.min(buf.length, midOff + 4096));
  return crypto
    .createHash('sha256')
    .update(head)
    .update(mid)
    .update(tail)
    .update(Buffer.from(String(buf.length)))
    .digest('hex')
    .slice(0, 16);
}
