const URL = "https://openrouter.ai/api/v1/chat/completions";

export type LlmMessage = { role: "system" | "user" | "assistant"; content: string };

async function complete(
  messages: LlmMessage[],
  opts?: { json?: boolean; maxTokens?: number; temperature?: number },
): Promise<string | null> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini",
        temperature: opts?.temperature ?? (opts?.json ? 0.4 : 0.7),
        max_tokens: opts?.maxTokens ?? (opts?.json ? 400 : 320),
        ...(opts?.json ? { response_format: { type: "json_object" } } : {}),
        messages,
      }),
    });
    const text = await res.text();
    if (!res.ok || !text.trim()) return null;
    const data = JSON.parse(text) as { choices?: { message?: { content?: string } }[] };
    return data.choices?.[0]?.message?.content ?? null;
  } catch {
    return null;
  }
}

export async function chatJson(system: string, user: string, history: LlmMessage[] = []) {
  return complete([{ role: "system", content: system }, ...history, { role: "user", content: user }], {
    json: true,
    maxTokens: 400,
  });
}

export async function chatText(system: string, user: string, history: LlmMessage[] = [], maxTokens = 320) {
  return complete([{ role: "system", content: system }, ...history, { role: "user", content: user }], {
    maxTokens,
  });
}
