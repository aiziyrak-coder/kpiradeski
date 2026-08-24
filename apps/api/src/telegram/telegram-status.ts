/**
 * Bot pollingining tiriklik holati.
 *
 * DI orqali emas — HealthController TelegramModule ni import qilmasin
 * (aylanma bogʻlanish xavfi). Oddiy modul-darajali holat yetarli.
 */
export const telegramStatus = {
  /** Oxirgi muvaffaqiyatli getUpdates vaqti (ms). 0 = hali hech qachon */
  lastPollOkAt: 0,
  /** Oxirgi xato tavsifi — nega polling ishlamayotgani koʻrinsin */
  lastError: null as string | null,
  /** Polling umuman yoqilganmi (token/chatId bor) */
  enabled: false,
  /** getMe orqali aniqlangan bot username — Mini App deep-link uchun */
  botUsername: null as string | null,
};

/** Polling tirikmi — 5 daqiqadan beri muvaffaqiyatli javob boʻlmasa oʻlik.
 * 5 daqiqa: Telegram tomonidagi qisqa uzilishlar bekorga signal bermasin,
 * lekin haqiqiy qotib qolish (webhook 409 kabi) darhol koʻrinadi. */
export function telegramPollingHealthy(now = Date.now()): boolean {
  if (!telegramStatus.enabled) return true; // oʻchirilgan — muammo emas
  if (telegramStatus.lastPollOkAt === 0) {
    // Ishga tushish paytida birinchi long-poll ~25s ketadi — health 503 boʻlib
    // konteyner healthcheck'ini yiqitmasin
    return process.uptime() < 120;
  }
  return now - telegramStatus.lastPollOkAt < 300_000;
}
