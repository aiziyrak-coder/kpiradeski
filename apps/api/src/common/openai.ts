/**
 * OpenAI helpers — text + vision for KPI proof auto-approval
 */
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
                    'Siz dermatologiya klinikasi KPI va HR maslahatchisisiz. Javoblarni o‘zbek tilida, qisqa va amaliy yozing.',
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

/** Vision: rasim/PDF emas — image mime uchun base64 */
export async function openaiVisionProof(opts: {
  title: string;
  description?: string | null;
  mimeType: string;
  base64: string;
}): Promise<{ approved: boolean; note: string } | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  if (!opts.mimeType.startsWith('image/')) {
    return {
      approved: true,
      note: 'Rasm emas — avtomatik qabul (qoʻlda tekshirish tavsiya)',
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
        temperature: 0.2,
        max_tokens: 400,
        messages: [
          {
            role: 'system',
            content:
              'You verify clinic KPI proof photos. Reply ONLY JSON: {"approved":true|false,"note":"short uzbek reason"}',
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `KPI punkti: ${opts.title}\nTavsif: ${opts.description || '—'}\nBu dalil shu vazifaga mosmi?`,
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
    if (!match) return { approved: true, note: text.slice(0, 200) || 'AI javob' };
    const parsed = JSON.parse(match[0]) as { approved?: boolean; note?: string };
    return {
      approved: !!parsed.approved,
      note: parsed.note || (parsed.approved ? 'Tasdiqlandi' : 'Rad etildi'),
    };
  } catch (e) {
    console.warn('OpenAI vision failed', e);
    return null;
  }
}
