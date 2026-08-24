/** Telefon screenshot / HEIC / katta rasmlarni JPEG ga aylantirish */

const MAX_EDGE = 1600;
const MAX_BYTES = 1_200_000;
const QUALITY = 0.82;

function looksLikeImage(file: File): boolean {
  if (file.type.startsWith('image/')) return true;
  return /\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i.test(file.name);
}

function isGif(file: File): boolean {
  return file.type === 'image/gif' || /\.gif$/i.test(file.name);
}

function isHeic(file: File): boolean {
  return /heic|heif/i.test(file.type) || /\.heic$|\.heif$/i.test(file.name);
}

async function heicToJpegFile(file: File): Promise<File> {
  const heic2any = (await import('heic2any')).default;
  const converted = await heic2any({
    blob: file,
    toType: 'image/jpeg',
    quality: 0.88,
  });
  const blob = Array.isArray(converted) ? converted[0] : converted;
  if (!blob) throw new Error('HEIC aylantirilmadi');
  const base = file.name.replace(/\.[^.]+$/, '') || 'photo';
  return new File([blob], `${base}.jpg`, {
    type: 'image/jpeg',
    lastModified: Date.now(),
  });
}

/**
 * HEIC boʻlsa — brauzerda JPEG ga aylantiradi.
 * Ochilmasa — asl faylni qaytaradi (server HEIC ni JPEG qiladi).
 * Qoʻlda JPG qilish shart emas.
 */
export async function compressImageFile(file: File): Promise<File> {
  if (!looksLikeImage(file) || isGif(file)) return file;

  let source = file;
  if (isHeic(file)) {
    try {
      source = await heicToJpegFile(file);
    } catch {
      // Server aylantiradi — xato chiqarmaymiz
      return file;
    }
  }

  try {
    const bitmap = await createImageBitmap(source);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return source;
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    let quality = QUALITY;
    let blob: Blob | null = null;
    for (let i = 0; i < 4; i++) {
      blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/jpeg', quality),
      );
      if (!blob) break;
      if (blob.size <= MAX_BYTES) break;
      quality = Math.max(0.55, quality - 0.1);
    }

    if (!blob) return source;

    const base = source.name.replace(/\.[^.]+$/, '') || 'photo';
    return new File([blob], `${base}.jpg`, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
  } catch {
    // HEIC yoki boshqa — serverga yuboramiz
    return source;
  }
}

export async function compressImageFiles(files: File[]): Promise<File[]> {
  const out: File[] = [];
  for (const f of files) {
    out.push(await compressImageFile(f));
  }
  return out;
}
