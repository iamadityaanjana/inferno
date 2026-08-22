import { NextResponse } from "next/server";
import { getSource, getSourceByName, readSource } from "@/lib/datasources";
import { fail, readBody } from "@/lib/http";
import { getListing } from "@/lib/listings";
import { formatChatHistory, rememberChat, type ChatTurn } from "@/lib/memory";
import { chatText } from "@/lib/openrouter";
import { assertPaid, readAgentName } from "@/lib/server-chain";

const SEARCH_RULE =
  "You have live web search. Search before answering anything time-sensitive and prefer what you find over memory. Say plainly when something could not be verified.";

/** The reply lands in a chat bubble, so it has to read like a person talking. */
const VOICE_RULE =
  "Write two or three short paragraphs of plain prose for a chat window. Never output JSON, key-value lists, tables, code blocks or field names. Quote concrete numbers inside sentences and say what they mean.";

const PROMPTS: Record<number, string> = {
  1: `You are a web research agent. ${SEARCH_RULE} Give 5 tight bullets of current, useful facts for the task. Use prior conversation so you do not repeat yourself. Max 140 words.`,
  2: `You are a Monad DeFi analyst. ${SEARCH_RULE} Name 2-3 realistic opportunity types on Monad (DEX, lending, LST) and what to check, with current numbers where you can find them. Stay consistent with earlier answers. No financial advice. Max 140 words.`,
  3: `You are a news agent. ${SEARCH_RULE} Summarize the most relevant recent themes for the task, given the conversation, and date each one. Max 120 words.`,
  4: `You are a risk agent. ${SEARCH_RULE} Score 1-10 and list 3 concrete risks. Reference earlier context if the user is following up. Max 100 words.`,
  5: `You are a general researcher. ${SEARCH_RULE} Give a concise brief that builds on the prior conversation. Max 120 words.`,
};

async function callEndpoint(endpoint: string, payload: unknown) {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(12_000),
  });
  const data = (await res.json().catch(() => null)) as { result?: string } | null;
  if (!res.ok || !data?.result) throw new Error("Partner agent did not return a result");
  return data.result;
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const agentId = Number(id);
    const body = await readBody<{
      txHash?: string;
      task?: string;
      sessionId?: string;
      history?: ChatTurn[];
      capabilities?: string;
    }>(req);
    if (!body.txHash?.startsWith("0x") || body.txHash.length !== 66) {
      return NextResponse.json({ error: "real txHash required" }, { status: 400 });
    }
    if (!agentId || agentId < 1) {
      return NextResponse.json({ error: "bad agent" }, { status: 400 });
    }

    try {
      await assertPaid(body.txHash as `0x${string}`, agentId);
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "unpaid" }, { status: 402 });
    }

    const task = body.task ?? "Research Monad";
    const history = rememberChat(body.sessionId || "anon", body.history ?? []);
    const listing = await getListing(agentId);

    if (listing?.endpoint) {
      try {
        const result = await callEndpoint(listing.endpoint, {
          agentId,
          task,
          txHash: body.txHash,
          history,
        });
        return NextResponse.json({ agentId, txHash: body.txHash, result });
      } catch {
        // fall through to local run so the paid hire still answers
      }
    }

    // Data agents read a public API instead of searching the open web. The raw
    // readings never leave this function; only the model's prose does.
    // Falling back to the registry name means this still resolves on hosts where
    // the listings file does not persist between requests.
    const source =
      (listing?.sourceId ? getSource(listing.sourceId) : null) ??
      getSourceByName((await readAgentName(agentId)) ?? "");
    const readings = source ? await readSource(source.id, task) : [];

    const system = source
      ? `You are ${source.name}, reporting live readings from ${source.provider}. ${VOICE_RULE} Work only from the readings given to you. If they are empty, say the ${source.provider} feed did not answer and give no numbers of your own. Max 160 words.`
      : (PROMPTS[agentId] ??
        `You are ${listing?.name ?? `agent ${agentId}`}. ${body.capabilities || listing?.name || "Help with the task."} ${SEARCH_RULE} ${VOICE_RULE} Max 140 words.`);

    const prompt = source
      ? `Conversation so far:\n${formatChatHistory(history)}\n\nCurrent task: ${task}\n\nLive readings from ${source.provider}${
          readings.length ? ":" : " (none — the feed did not respond):"
        }\n${readings.join("\n")}`
      : `Conversation so far:\n${formatChatHistory(history)}\n\nCurrent task: ${task}`;

    const llm = await chatText(system, prompt, [], 320, {
      // A data agent already holds fresh numbers; searching again would only
      // add cost and invite the model to contradict its own feed.
      web: !source,
      sources: !source,
    });

    const result =
      llm ??
      (readings.length
        ? `${source?.provider ?? "The feed"} responded, but no model is configured to write it up.\n\n${readings.join("\n")}`
        : `Hire confirmed. Agent ${agentId} has no live model right now.`);

    return NextResponse.json({ agentId, txHash: body.txHash, result });
  } catch (e) {
    return fail(e, "Agent run failed");
  }
}
