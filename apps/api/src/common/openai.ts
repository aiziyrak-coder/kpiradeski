/**
 * OpenAI helpers — Radeski KPI AI Supervisor + AI assistant
 */
export type AiProofVerdict = {
  approved: boolean;
  note: string;
  feedback: string;
  action: 'NONE' | 'RESUBMIT' | 'WARN' | 'PENALTY';
  penalty: number;
  score: number;
};

function apiKey() {
  return process.env.OPENAI_API_KEY?.trim() || '';
}

function chatModel() {
  return process.env.OPENAI_MODEL?.trim() || 'gpt-4o';
}

export async function openaiChat(
  prompt: string,
  opts?: { system?: string; maxTokens?: number; temperature?: number },
): Promise<string | null> {
  const key = apiKey();
  if (!key) return null;

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: chatModel(),
        temperature: opts?.temperature ?? 0.4,
        max_tokens: opts?.maxTokens ?? 1800,
        messages: [
          ...(opts?.system
            ? [{ role: 'system' as const, content: opts.system }]
            : [
                {
                  role: 'system' as const,
                  content:
                    'Siz Radeski KPI manager system AI nazoratchisisiz. Javoblarni o‘zbek tilida, qisqa va amaliy yozing.',
                },
              ]),
          { role: 'user' as const, content: prompt },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.warn('OpenAI error', res.status, errText.slice(0, 200));
      return null;
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return json?.choices?.[0]?.message?.content?.trim() || null;
  } catch (e) {
    console.warn('OpenAI request failed', e);
    return null;
  }
}

export async function openaiChatMessages(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  opts?: { maxTokens?: number; temperature?: number; json?: boolean },
): Promise<string | null> {
  const key = apiKey();
  if (!key) return null;
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: chatModel(),
        temperature: opts?.temperature ?? 0.35,
        max_tokens: opts?.maxTokens ?? 2200,
        ...(opts?.json ? { response_format: { type: 'json_object' } } : {}),
        messages,
      }),
    });
    if (!res.ok) {
      console.warn('OpenAI chat error', res.status, (await res.text()).slice(0, 200));
      return null;
    }
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return json?.choices?.[0]?.message?.content?.trim() || null;
  } catch (e) {
    console.warn('OpenAI chat failed', e);
    return null;
  }
}

/** Whisper STT */
export async function openaiTranscribe(
  buffer: Buffer,
  filename = 'audio.webm',
): Promise<{ text: string; language?: string } | null> {
  const key = apiKey();
  if (!key) return null;
  try {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(buffer)]), filename);
    form.append('model', 'whisper-1');
    form.append('response_format', 'verbose_json');
    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}` },
      body: form,
    });
    if (!res.ok) {
      console.warn('Whisper error', res.status, (await res.text()).slice(0, 200));
      return null;
    }
    const json = (await res.json()) as { text?: string; language?: string };
    return { text: (json.text || '').trim(), language: json.language };
  } catch (e) {
    console.warn('Whisper failed', e);
    return null;
  }
}

/** High-quality TTS — tts-1-hd */
export async function openaiSpeak(
  text: string,
  opts?: { voice?: string; languageHint?: 'ru' | 'uz' | 'auto' },
): Promise<Buffer | null> {
  const key = apiKey();
  if (!key || !text.trim()) return null;
  const voice =
    opts?.voice ||
    (opts?.languageHint === 'ru' ? 'onyx' : process.env.OPENAI_TTS_VOICE?.trim() || 'nova');
  try {
    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_TTS_MODEL?.trim() || 'tts-1-hd',
        voice,
        input: text.slice(0, 4096),
        response_format: 'mp3',
      }),
    });
    if (!res.ok) {
      console.warn('TTS error', res.status, (await res.text()).slice(0, 200));
      return null;
    }
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  } catch (e) {
    console.warn('TTS failed', e);
    return null;
  }
}

const AI_SUPERVISOR = `Siz «Radeski KPI» dalil tekshiruvchisiz — adolatli, amaliy.
Menejer klinikada ish bajarganini foto/dalil bilan koʻrsatadi.

TASDIQLANG (approved:true) agar:
- Rasm(lar) vazifa mavzusiga mos yoki mantiqan bogʻliq boʻlsa (eshik/deraza, xona, stol, hujjat, ekran, odam ish joyida va h.k.)
- Bir nechta rasm boʻlsa — ularning birortasi yetarli dalil bersa
- Sifat oʻrtacha boʻlsa ham (biroz qorongʻi/burchak) — ish bajarilgani koʻrinsa TASDIQ
- Shubha boʻlsa HAM — TASDIQ (approved:true), feedback da yumshoq maslahat; action=WARN yoki NONE

RAD ETING (approved:false) FAQAT aniq holatda:
- Boʻsh/qora/buzilgan rasm
- Mutlaqo boshqa mavzu (meme, oziq-ovqat, random screenshot vazifaga aloqasiz)
- Aniq soxta yoki vazifani inkor qiluvchi kontent

Muhim: «aniqroq dalil kerak» deb RAD QILMANG — klinikada telefon rasmi yetarli.
Javob FAQAT JSON:
{"approved":true|false,"note":"qisqa holat","feedback":"nima yaxshi / nima yaxshilash","action":"NONE|RESUBMIT|WARN|PENALTY","penalty":0-20,"score":0-100}`;

export type AiCoachResult = {
  summary: string;
  quality: 'excellent' | 'good' | 'weak' | 'poor';
  /** true = ishni tasdiqlash, false = managerga qaytarish */
  approved: boolean;
  issues: string[];
  nextActions: string[];
  incompleteHint: string;
  praise: string;
};

/** Manager ish yuborganida darhol coach fikri */
export async function openaiCoachManagerSubmit(opts: {
  taskTitle: string;
  taskDescription?: string | null;
  note?: string | null;
  proofStatus?: string | null;
  proofNote?: string | null;
  proofFeedback?: string | null;
  incompleteTasks: string[];
  doneToday: number;
  assignedToday: number;
  branchName?: string | null;
  managerName?: string | null;
  language?: 'uz' | 'ru';
}): Promise<AiCoachResult | null> {
  const lang = opts.language || 'uz';
  const system =
    lang === 'ru'
      ? `Ты — AI-наставник клиники Radeski.
Менеджер только что сдал ОДНУ задачу. Оцени ТОЛЬКО её.
approved=true если по этой задаче есть нормальный комментарий/доказательство.
approved=false ТОЛЬКО если эта задача явно не сделана или комментарий пустой/фиктивный.
НЕ отклоняй из-за других незакрытых задач — их пиши в incompleteHint.
По-русски. JSON только:
{"summary":"...","quality":"excellent|good|weak|poor","approved":true|false,"issues":["..."],"nextActions":["..."],"incompleteHint":"...","praise":"..."}`
      : `Siz Radeski klinikasi AI murabbiysisiz — qatʼiy, lekin adolatli.
Menejer HOZIRGI bitta ishni yubordi. Faqat SHU ishni baholang.
approved=true — izoh/dalil shu ish uchun yetarli (formal emas).
approved=false — FAQAT shu ishning o‘zi bajarilmagan yoki izoh bo‘sh/soxta.
MUHIM: boshqa bajarilmagan ishlar roʻyxati borligi uchun RAD QILMANG — ularni incompleteHint ga yozing.
Oʻzbekcha. FAQAT JSON:
{"summary":"...","quality":"excellent|good|weak|poor","approved":true|false,"issues":["..."],"nextActions":["..."],"incompleteHint":"...","praise":"..."}`;

  const raw = await openaiChatMessages(
    [
      { role: 'system', content: system },
      {
        role: 'user',
        content: JSON.stringify({
          branch: opts.branchName,
          manager: opts.managerName,
          task: opts.taskTitle,
          description: opts.taskDescription,
          note: opts.note,
          proofStatus: opts.proofStatus,
          proofNote: opts.proofNote,
          proofFeedback: opts.proofFeedback,
          progress: { doneToday: opts.doneToday, assignedToday: opts.assignedToday },
          stillIncomplete: opts.incompleteTasks.slice(0, 25),
        }),
      },
    ],
    { json: true, maxTokens: 900, temperature: 0.35 },
  );
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Partial<AiCoachResult>;
    const q = String(p.quality || 'good');
    const quality = (['excellent', 'good', 'weak', 'poor'].includes(q)
      ? q
      : 'good') as AiCoachResult['quality'];
    const approved =
      typeof p.approved === 'boolean'
        ? p.approved
        : quality === 'excellent' || quality === 'good';
    return {
      summary: String(p.summary || ''),
      quality,
      approved,
      issues: Array.isArray(p.issues) ? p.issues.map(String).slice(0, 6) : [],
      nextActions: Array.isArray(p.nextActions) ? p.nextActions.map(String).slice(0, 6) : [],
      incompleteHint: String(p.incompleteHint || ''),
      praise: String(p.praise || ''),
    };
  } catch {
    return null;
  }
}

export type IntegrationAuditItem = {
  channel: 'telegram' | 'instagram' | 'website' | 'general';
  severity: 'critical' | 'high' | 'mid' | 'low';
  title: string;
  detail: string;
  action: string;
};

export type IntegrationAuditResult = {
  overview: string;
  score: number;
  items: IntegrationAuditItem[];
  priorities: string[];
};

/** Telegram / Instagram / sayt kontentini AI audit */
export async function openaiIntegrationsAudit(
  payload: unknown,
  opts?: { hasOperationalData?: boolean },
): Promise<IntegrationAuditResult | null> {
  const fresh = opts?.hasOperationalData === false;
  const system = fresh
    ? `Siz Radeski Skin Clinic digital audit AI sisiz.
Operatsion maʼlumot YOʻQ (KPI ishlari, SEO check, social stats hali yoʻq — ish boshlanmagan).
Uydirma ball BERMANG. score majburan 0. overview da aniq yozing: ish hali boshlanmagan, ball berilmaydi.
Faqat sozlama/ulanish boʻyicha past priority maslahat (severity=low|mid). critical/high YOʻQ.
Oʻzbekcha. FAQAT JSON:
{"overview":"...","score":0,"items":[{"channel":"telegram|instagram|website|general","severity":"low|mid","title":"...","detail":"...","action":"..."}],"priorities":["..."]}`
    : `Siz Radeski Skin Clinic brendi uchun bosh marketing + digital direktor AI sisiz.
Telegram kanal, Instagram va veb-sayt(lar) holatini tahlil qiling.
Ballni FAQAT berilgan operatsion metrikalar (social stats, SEO check, KPI) asosida qoʻying.
Agar metrikalar boʻsh/zaif boʻlsa — past ball; veb HTML dan taxminiy 60–70 uydirma ball BERMANG.
Oʻzbekcha yozing. FAQAT JSON:
{"overview":"...","score":0-100,"items":[{"channel":"telegram|instagram|website|general","severity":"critical|high|mid|low","title":"...","detail":"...","action":"..."}],"priorities":["..."]}`;

  const raw = await openaiChatMessages(
    [
      { role: 'system', content: system },
      { role: 'user', content: JSON.stringify(payload) },
    ],
    { json: true, maxTokens: 2200, temperature: 0.3 },
  );
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Partial<IntegrationAuditResult>;
    let score = Math.max(0, Math.min(100, Number(p.score) || 0));
    if (fresh) score = 0;
    return {
      overview: String(
        p.overview ||
          (fresh
            ? 'Ish hali boshlanmagan — integratsiya balli berilmaydi (0/100).'
            : ''),
      ),
      score,
      items: Array.isArray(p.items)
        ? p.items.slice(0, 20).map((it: any) => ({
            channel: (['telegram', 'instagram', 'website', 'general'].includes(it?.channel)
              ? it.channel
              : 'general') as IntegrationAuditItem['channel'],
            severity: (['critical', 'high', 'mid', 'low'].includes(it?.severity)
              ? it.severity
              : 'mid') as IntegrationAuditItem['severity'],
            title: String(it?.title || ''),
            detail: String(it?.detail || ''),
            action: String(it?.action || ''),
          }))
        : [],
      priorities: Array.isArray(p.priorities) ? p.priorities.map(String).slice(0, 8) : [],
    };
  } catch {
    return null;
  }
}

export async function openaiVisionProof(opts: {
  title: string;
  description?: string | null;
  mimeType?: string;
  base64?: string;
  /** Bir nechta rasm — birgalikda baholanadi */
  images?: Array<{ mimeType: string; base64: string }>;
  frequency?: string;
  managerNote?: string | null;
}): Promise<AiProofVerdict | null> {
  const key = apiKey();
  if (!key) return null;

  const images =
    opts.images?.filter((i) => i.mimeType.startsWith('image/') && i.base64) ||
    (opts.mimeType?.startsWith('image/') && opts.base64
      ? [{ mimeType: opts.mimeType, base64: opts.base64 }]
      : []);

  if (!images.length) {
    return {
      approved: true,
      note: 'Hujjat qabul qilindi',
      feedback: 'Rasm emas — admin tekshirishi mumkin, lekin yuborish qabul qilindi',
      action: 'NONE',
      penalty: 0,
      score: 85,
    };
  }

  // Katta screenshot base64 OpenAI ni qotirish / timeout → 429 zanjiri
  const MAX_B64 = 2_800_000; // ~2MB binary
  const visionImages = images
    .filter((i) => i.base64.length <= MAX_B64)
    .slice(0, 4);

  if (!visionImages.length) {
    return {
      approved: true,
      note: 'Rasm qabul qilindi (hajmi katta — AI qisqa tekshiruv)',
      feedback:
        'Screenshot/rasm juda katta edi. Yuklash muvaffaqiyatli; sifatni admin koʻrib chiqishi mumkin.',
      action: 'NONE',
      penalty: 0,
      score: 80,
    };
  }

  const model = chatModel();
  const imageParts = visionImages.map((img) => ({
    type: 'image_url' as const,
    image_url: { url: `data:${img.mimeType};base64,${img.base64}` },
  }));

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        max_tokens: 500,
        messages: [
          { role: 'system', content: AI_SUPERVISOR },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Vazifa: ${opts.title}
Tavsif: ${opts.description || '—'}
Chastota: ${opts.frequency || 'DAILY'}
Menejer izohi: ${opts.managerNote || '—'}
Rasm soni: ${visionImages.length}
Dalil(lar)ni baholang. Shubhada — TASDIQLANG.`,
              },
              ...imageParts,
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      console.warn('OpenAI vision error', res.status);
      return null;
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = json?.choices?.[0]?.message?.content?.trim() || '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      // Parse xato — rad emas, kutish
      return {
        approved: true,
        note: 'Dalil qabul qilindi',
        feedback: 'AI javobi noaniq — ish qabul qilindi',
        action: 'NONE',
        penalty: 0,
        score: 80,
      };
    }
    const parsed = JSON.parse(match[0]) as Partial<AiProofVerdict> & {
      approved?: boolean;
    };
    const approved = parsed.approved !== false; // default true if missing
    const action = (['NONE', 'RESUBMIT', 'WARN', 'PENALTY'].includes(String(parsed.action))
      ? parsed.action
      : approved
        ? 'NONE'
        : 'RESUBMIT') as AiProofVerdict['action'];
    const penalty = Math.max(0, Math.min(20, Number(parsed.penalty) || (approved ? 0 : 10)));
    const score = Math.max(
      0,
      Math.min(100, Number(parsed.score) ?? (approved ? Math.max(70, 100 - penalty) : 0)),
    );
    return {
      approved,
      note: parsed.note || (approved ? 'Tasdiqlandi' : 'Rad etildi'),
      feedback:
        parsed.feedback ||
        (approved ? 'Yaxshi' : 'Qayta topshiring — aniqroq dalil kerak'),
      action: approved && action === 'RESUBMIT' ? 'WARN' : action,
      penalty: approved ? Math.min(penalty, 10) : penalty,
      score: approved ? Math.max(score, 60) : score,
    };
  } catch (e) {
    console.warn('OpenAI vision failed', e);
    return null;
  }
}
