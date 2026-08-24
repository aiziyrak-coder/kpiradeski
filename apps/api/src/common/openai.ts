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

const AI_SUPERVISOR = `Siz «Radeski KPI» dalil tekshiruvchisiz — adolatli va yumshoq.

Menejer ishni foto/skrinshot bilan topshiradi. Maqsad: ISHNI TOʻXTATMASLIK.

TASDIQLANG (approved:true) DEYARLI HAR DOIM:
- Klinika xonasi, stol, sochiq, qogʻoz, lavabo, kassa, forma, poyabzal — qorongʻi/qiyshiq boʻlsa ham
- Telefon/kompyuter SKRINSHOTI: Instagram, Telegram, sayt, Gmail, Search Console, PageSpeed, Excel, Notion, Canva, kontent-kalendar, jadval — bu NORMAL dalil
- Oylik/haftalik kontent-reja: jadval, kalendar, reja skrinshoti — TASDIQLANG
- Bir xil xona har kuni bir xil koʻrinadi — bu yangi foto boʻlishi oddiy
- Mavzu 100% aniq boʻlmasa ham — TASDIQLANG

RAD ETING (approved:false) FAQAT:
- Boʻsh, qora, umuman buzilgan fayl
- Ovqat, meme, random oyoq/selfi, porno
- Galereya ilovasi ochiq (thumbnail paneli) — ish emas, galereya UI

HECH QACHON rad qilmang: «eski rasm», «qayta ishlatilgan», «ekrandagi rasm», «vazifaga mos emas», «axlat koʻrinadi», «TV koʻrinmaydi».
Shubha = approved:true.
Javob FAQAT JSON:
{"approved":true|false,"note":"qisqa holat","feedback":"nima koʻrindi","action":"NONE|RESUBMIT|WARN|PENALTY","penalty":0-20,"score":0-100}`;

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
Если proofStatus=APPROVED — approved=true обязательно. Не отклоняй как «старое фото».
approved=false ТОЛЬКО если proofStatus=REJECTED или комментарий пустой.
НЕ отклоняй из-за других незакрытых задач — их пиши в incompleteHint.
По-русски. JSON только:
{"summary":"...","quality":"excellent|good|weak|poor","approved":true|false,"issues":["..."],"nextActions":["..."],"incompleteHint":"...","praise":"..."}`
      : `Siz Radeski klinikasi AI murabbiysisiz — qatʼiy, lekin adolatli.
Menejer HOZIRGI bitta ishni yubordi. Faqat SHU ishni baholang.
proofStatus=APPROVED boʻlsa — approved=true QILISH SHART. «Eski rasm» deb rad qilmang.
approved=false — FAQAT proofStatus=REJECTED yoki izoh boʻsh/soxta boʻlsa.
MUHIM: boshqa bajarilmagan ishlar uchun RAD QILMANG — ularni incompleteHint ga yozing.
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
    let quality = (['excellent', 'good', 'weak', 'poor'].includes(q)
      ? q
      : 'good') as AiCoachResult['quality'];
    let approved =
      typeof p.approved === 'boolean'
        ? p.approved
        : quality === 'excellent' || quality === 'good';
    if (String(opts.proofStatus || '').toUpperCase() === 'APPROVED') {
      approved = true;
      if (quality === 'poor' || quality === 'weak') quality = 'good';
    }
    if (String(opts.proofStatus || '').toUpperCase() === 'REJECTED') {
      approved = false;
    }
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
  opts?: { hasOperationalData?: boolean; hasLinks?: boolean },
): Promise<IntegrationAuditResult | null> {
  const hasLinks = opts?.hasLinks !== false;
  const fresh = !hasLinks;
  const system = fresh
    ? `Siz Radeski Skin Clinic digital audit AI sisiz.
Kanal linklari YOʻQ. score=0. overview da link qoʻshishni soʻrang.
Oʻzbekcha. FAQAT JSON:
{"overview":"...","score":0,"items":[],"priorities":["..."]}`
    : `Siz Radeski Skin Clinic brendi uchun bosh marketing + digital direktor AI sisiz.
Telegram kanallar, Instagram sahifalar va veb-sayt(lar) (masalan radeski.uz) holatini tahlil qiling.
Sayt HTML snapshot (title, description, h1, textSample, status) asosida SEO/CTA/kontent sifatini baholang.
Telegram preview (agar bor) va Instagram URL/username/izohlar asosida kanal holatini yozing.
Follower/like/reach raqamlarini UYDIRMANG. Faqat berilgan maʼlumotdan foydalaning.
Ball 0–100: sayt ochilishi, kontent sifat, kanallar ulanganligi, izchillik.
Oʻzbekcha. FAQAT JSON:
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
            ? 'Integratsiya linklari yoʻq — ball berilmaydi.'
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
  images?: Array<{ mimeType: string; base64: string }>;
  frequency?: string;
  managerNote?: string | null;
  windowLabel?: string | null;
  nowLabel?: string | null;
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
Hozirgi vaqt (Toshkent): ${opts.nowLabel || '—'}
Vazifa vaqt oynasi: ${opts.windowLabel || 'kun boʻyi'}
Menejer izohi: ${opts.managerNote || '—'}
Rasm soni: ${visionImages.length}
Eski/qayta ishlatilgan deb TAXMIN QILMANG va RAD QILMANG.
Hash/EXIF allaqachon tekshirilgan. Mavzu mos boʻlsa TASDIQLANG.
Shubha = approved:true.`,
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
    let approved = parsed.approved !== false;
    let note = parsed.note || (approved ? 'Tasdiqlandi' : 'Rad etildi');
    let feedback =
      parsed.feedback ||
      (approved ? 'Yaxshi' : 'Qayta topshiring — aniqroq dalil kerak');

    const guess = `${note} ${feedback}`.toLowerCase();
    const hardReject =
      /boʻsh rasm|bush rasm|qora ekran|buzilgan fayl|meme|ovqat|porno|galereya ilovasi|thumbnail/.test(
        guess,
      );
    const pickyReject =
      /eski|qayta ishlat|reuse|old photo|galereya|kechagi|yangi emas|mos emas|koʻrsatilmagan|ko'rsatilmagan|koʻrinmay|ko'rinmay|ekranidagi|skrin|screenshot|gmail|search console|axlat|не нов|повторн/.test(
        guess,
      );
    if (!approved && !hardReject) {
      approved = true;
      if (pickyReject) {
        note = 'Dalil qabul qilindi';
        feedback = 'Rasm yuklandi va qabul qilindi.';
      }
    }

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
      note,
      feedback,
      action: approved && action === 'RESUBMIT' ? 'WARN' : action,
      penalty: approved ? Math.min(penalty, 10) : penalty,
      score: approved ? Math.max(score, 60) : score,
    };
  } catch (e) {
    console.warn('OpenAI vision failed', e);
    return null;
  }
}

export async function openaiFaceMatch(opts: {
  name: string;
  reference: { mimeType: string; base64: string };
  live: { mimeType: string; base64: string };
  live2?: { mimeType: string; base64: string } | null;
}): Promise<{ match: boolean; live: boolean; score: number; note: string } | null> {
  const key = apiKey();
  if (!key) return null;

  const extra = opts.live2
    ? [
        {
          type: 'image_url' as const,
          image_url: { url: `data:${opts.live2.mimeType};base64,${opts.live2.base64}` },
        },
      ]
    : [];

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: chatModel(),
        temperature: 0,
        max_tokens: 220,
        messages: [
          {
            role: 'system',
            content:
              'Siz yuz solishtirish va jonlilik tekshiruvchisisiz. 1-rasm: bazadagi hodim fotosi. Keyingilari: kameradan jonli skaner. FAQAT JSON.',
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Hodim: ${opts.name}
1-rasm = bazadagi etalon foto.
Keyingi rasm(lar) = hozirgi kamera kadri.
match=true faqat bir xil odam boʻlsa.
live=true faqat jonli yuz (ekran/qogʻoz/rasm-koʻrsatish emas).
JSON: {"match":true|false,"live":true|false,"score":0-100,"note":"qisqa"}`,
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${opts.reference.mimeType};base64,${opts.reference.base64}`,
                },
              },
              {
                type: 'image_url',
                image_url: { url: `data:${opts.live.mimeType};base64,${opts.live.base64}` },
              },
              ...extra,
            ],
          },
        ],
      }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const text = String(json?.choices?.[0]?.message?.content || '');
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const parsed = JSON.parse(m[0]);
    return {
      match: !!parsed.match,
      live: parsed.live !== false,
      score: Math.max(0, Math.min(100, Number(parsed.score) || 0)),
      note: String(parsed.note || ''),
    };
  } catch (e) {
    console.warn('OpenAI face match failed', e);
    return null;
  }
}
