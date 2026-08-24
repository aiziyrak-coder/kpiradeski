/**
 * Filialga bogʻliq boʻlmagan umumiy biznes ishlari:
 * SEO, sayt, SMM, marketing/reklama — bitta filialda yopilsa, hammada yopiladi.
 * Klinika, qabulxona, davomat, forma, sharhlar — filialda qoladi.
 */
export function isCompanyWideTaskKey(key: string): boolean {
  const k = String(key || '');
  if (!k) return false;
  return (
    k.startsWith('smm.') ||
    k.startsWith('smm_w.') ||
    k.startsWith('smm_m.') ||
    k === 'smm' ||
    k === 'smm_w' ||
    k === 'smm_m' ||
    k.startsWith('marketing.') ||
    k.startsWith('marketing_w.') ||
    k.startsWith('marketing_m.') ||
    k === 'marketing' ||
    k === 'marketing_w' ||
    k === 'marketing_m' ||
    k.includes('.seo.') ||
    k.endsWith('.seo')
  );
}
