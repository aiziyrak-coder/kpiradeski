/** Telefon screenshot / katta rasmlarni JPEG ga siqish (upload oldidan) */

const MAX_EDGE = 1600;
const MAX_BYTES = 1_200_000;
const QUALITY = 0.82;

function looksLikeImage(file: File): boolean {
  if (file.type.startsWith('image/')) return true;
  return /\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i.test(file.name);
}

export async function compressImageFile(file: File): Promise<File> {
  if (!looksLikeImage(file)) return file;
  // GIF animatsiyasini buzmaslik
  if (file.type === 'image/gif' || /\.gif$/i.test(file.name)) return file;
  // Allaqachon kichik JPEG
  if (
    (file.type === 'image/jpeg' || file.type === 'image/jpg' || /\.jpe?g$/i.test(file.name)) &&
    file.size <= MAX_BYTES
  ) {
    return file;
  }

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return file;
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

    if (!blob || blob.size >= file.size * 0.98) return file;

    const base = file.name.replace(/\.[^.]+$/, '') || 'screenshot';
    return new File([blob], `${base}.jpg`, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
  } catch {
    // HEIC yoki decode boʻlmagan — original qaytaramiz (server xabar beradi)
    return file;
  }
}

/** Bir nechta faylni ketma-ket siqish */
export async function compressImageFiles(files: File[]): Promise<File[]> {
  const out: File[] = [];
  for (const f of files) {
    out.push(await compressImageFile(f));
  }
  return out;
}
