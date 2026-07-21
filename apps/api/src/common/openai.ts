/**
 * OpenAI helpers — Radeski KPI AI Supervisor (full authority)
 */
export type AiProofVerdict = {
  approved: boolean;
  note: string;
  feedback: string;
  action: 'NONE' | 'RESUBMIT' | 'WARN' | 'PENALTY';
  /** 0–100 ball jarimasi */
  penalty: number;
  score: number;
};

export async function openaiChat(
  prompt: string,
  opts?: { system?: string; maxTokens?: number },
): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  const model = process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini';

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.4,
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

const AI_SUPERVISOR = `Siz «Radeski KPI manager system» AI nazoratchisisiz.
Toʻliq vakolat: dalilni tasdiqlash/rad etish, feedback, qayta topshirish, ogohlantirish, jarima (0-40 ball).
Admin qoʻlda tasdiqlamaydi — faqat siz qaror qilasiz.
Javob FAQAT JSON:
{"approved":true|false,"note":"qisqa holat","feedback":"nima qilish kerak","action":"NONE|RESUBMIT|WARN|PENALTY","penalty":0-40,"score":0-100}`;

/** Vision: rasm/fayl dalilini toʻliq AI nazorat */
export async function openaiVisionProof(opts: {
  title: string;
  description?: string | null;
  mimeType: string;
  base64: string;
  frequency?: string;
}): Promise<AiProofVerdict | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;

  if (!opts.mimeType.startsWith('image/')) {
    return {
      approved: true,
      note: 'Fayl qabul qilindi',
      feedback: 'Keyingi safar rasm yuklang — aniqroq baholanadi',
      action: 'NONE',
      penalty: 0,
      score: 85,
    };
  }

  const model = process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini';
  const dataUrl = `data:${opts.mimeType};base64,${opts.base64}`;

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.15,
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
Dalil shu vazifaga mosmi? Qatʼiy baholang.`,
              },
              { type: 'image_url', image_url: { url: dataUrl } },
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
      return {
        approved: false,
        note: 'AI javobini oʻqib boʻlmadi',
        feedback: 'Qayta yuklang',
        action: 'RESUBMIT',
        penalty: 10,
        score: 0,
      };
    }
    const parsed = JSON.parse(match[0]) as Partial<AiProofVerdict> & {
      approved?: boolean;
    };
    const approved = !!parsed.approved;
    const action = (['NONE', 'RESUBMIT', 'WARN', 'PENALTY'].includes(String(parsed.action))
      ? parsed.action
      : approved
        ? 'NONE'
        : 'RESUBMIT') as AiProofVerdict['action'];
    const penalty = Math.max(0, Math.min(40, Number(parsed.penalty) || (approved ? 0 : 15)));
    const score = Math.max(
      0,
      Math.min(100, Number(parsed.score) ?? (approved ? 100 - penalty : 0)),
    );
    return {
      approved,
      note: parsed.note || (approved ? 'Tasdiqlandi' : 'Rad etildi'),
      feedback:
        parsed.feedback ||
        (approved ? 'Yaxshi' : 'Qayta topshiring — aniqroq dalil kerak'),
      action: approved && action === 'RESUBMIT' ? 'NONE' : action,
      penalty: approved ? Math.min(penalty, 20) : penalty,
      score,
    };
  } catch (e) {
    console.warn('OpenAI vision failed', e);
    return null;
  }
}
