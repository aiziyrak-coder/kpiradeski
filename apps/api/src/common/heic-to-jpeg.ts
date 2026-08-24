/**
 * iPhone HEIC/HEIF → JPEG (server).
 * Brauzer aylantira olmasa ham API qabul qiladi.
 */
export function isHeicBuffer(buf: Buffer, mimeOrName?: string): boolean {
  const hint = String(mimeOrName || '').toLowerCase();
  if (/heic|heif/.test(hint)) return true;
  if (!buf || buf.length < 12) return false;
  // ISO BMFF: ....ftypXXXX
  if (buf[4] !== 0x66 || buf[5] !== 0x74 || buf[6] !== 0x79 || buf[7] !== 0x70) {
    return false;
  }
  const brand = buf.slice(8, 12).toString('ascii').toLowerCase();
  return /heic|heif|mif1|msf1|hevx|hevc|heim|heis/.test(brand);
}

export async function ensureJpegBuffer(
  buf: Buffer,
  mimeOrName?: string,
): Promise<{ buffer: Buffer; mime: string; converted: boolean }> {
  if (!isHeicBuffer(buf, mimeOrName)) {
    const isJpeg = buf.length > 2 && buf[0] === 0xff && buf[1] === 0xd8;
    return {
      buffer: buf,
      mime: isJpeg ? 'image/jpeg' : 'application/octet-stream',
      converted: false,
    };
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const convertMod = require('heic-convert');
    const convert =
      typeof convertMod === 'function'
        ? convertMod
        : convertMod.default || convertMod;
    const outRaw = await convert({
      buffer: buf,
      format: 'JPEG',
      quality: 0.88,
    });
    const out = Buffer.isBuffer(outRaw) ? outRaw : Buffer.from(outRaw);
    if (!out?.length) throw new Error('empty jpeg');
    return { buffer: out, mime: 'image/jpeg', converted: true };
  } catch (e) {
    throw new Error(
      `HEIC serverda ochilmadi: ${e instanceof Error ? e.message : e}`,
    );
  }
}
