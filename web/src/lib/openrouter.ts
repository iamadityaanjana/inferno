const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

export type LlmMessage = { role: "system" | "user" | "assistant"; content: string };

export type Citation = { url: string; title?: string };

/**
 * Live web search. OpenRouter runs the `openrouter:web_search` server tool on
 * its own side and keeps looping until the model stops searching, so there is
 * no tool-call round trip to handle here. The older `plugins: [{ id: "web" }]`
 * and `:online` forms are deprecated and deliberately unused.
 *
 * Search bills per request on top of tokens, so it is only attached to prose
 * calls (agent runs, synthesis, Devil lines) and never to the JSON planning
 * call, which needs no facts. Set OPENROUTER_WEB_SEARCH=off to disable.
 */
const WEB_SEARCH_ON = process.env.OPENROUTER_WEB_SEARCH !== "off";
const WEB_MAX_RESULTS = Math.max(1, Math.min(10, Number(process.env.OPENROUTER_WEB_MAX_RESULTS ?? 4)));
const WEB_ENGINE = process.env.OPENROUTER_WEB_ENGINE ?? "auto";

function webSearchTool() {
  return {
    type: "openrouter:web_search",
    parameters: {
      engine: WEB_ENGINE,
      max_results: WEB_MAX_RESULTS,
      max_total_results: WEB_MAX_RESULTS * 2,
    },
  };
}

type Choice = {
  message?: {
    content?: string;
    annotations?: { type?: string; url_citation?: { url?: string; title?: string } }[];
  };
};

async function complete(
  messages: LlmMessage[],
  opts?: { json?: boolean; maxTokens?: number; temperature?: number; web?: boolean },
): Promise<{ text: string; citations: Citation[] } | null> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return null;
  const web = Boolean(opts?.web) && WEB_SEARCH_ON;
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      // Searching adds seconds, so prose calls get a longer leash.
      signal: AbortSignal.timeout(web ? 60_000 : 25_000),
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini",
        temperature: opts?.temperature ?? (opts?.json ? 0.4 : 0.7),
        max_tokens: opts?.maxTokens ?? (opts?.json ? 400 : 320),
        ...(opts?.json ? { response_format: { type: "json_object" } } : {}),
        ...(web ? { tools: [webSearchTool()] } : {}),
        messages,
      }),
    });
    const raw = await res.text();
    if (!res.ok || !raw.trim()) return null;
    const data = JSON.parse(raw) as { choices?: Choice[] };
    const message = data.choices?.[0]?.message;
    const text = message?.content?.trim();
    if (!text) return null;

    const seen = new Set<string>();
    const citations: Citation[] = [];
    for (const note of message?.annotations ?? []) {
      const url = note.url_citation?.url;
      if (note.type !== "url_citation" || !url || seen.has(url)) continue;
      seen.add(url);
      citations.push({ url, title: note.url_citation?.title });
    }

    return { text, citations };
  } catch {
    return null;
  }
}

export async function chatJson(system: string, user: string, history: LlmMessage[] = []) {
  const out = await complete([{ role: "system", content: system }, ...history, { role: "user", content: user }], {
    json: true,
    maxTokens: 400,
  });
  return out?.text ?? null;
}

/**
 * Prose completion with live web search on by default. Returns the answer with
 * a short source list appended when the model actually cited pages, so a hire's
 * output carries its own receipts.
 */
export async function chatText(
  system: string,
  user: string,
  history: LlmMessage[] = [],
  maxTokens = 320,
  opts?: { web?: boolean; sources?: boolean },
) {
  const out = await complete([{ role: "system", content: system }, ...history, { role: "user", content: user }], {
    maxTokens,
    web: opts?.web ?? true,
  });
  if (!out) return null;
  if (opts?.sources === false || out.citations.length === 0) return out.text;

  const list = out.citations
    .slice(0, 4)
    .map((c) => `- ${c.title?.trim() || hostOf(c.url)} — ${c.url}`)
    .join("\n");
  return `${out.text}\n\nSources:\n${list}`;
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
