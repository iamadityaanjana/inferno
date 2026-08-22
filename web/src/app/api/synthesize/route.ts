import { NextResponse } from "next/server";
import { fail, readBody } from "@/lib/http";
import { formatChatHistory, rememberChat, type ChatTurn } from "@/lib/memory";
import { chatText } from "@/lib/openrouter";

export async function POST(req: Request) {
  try {
    const body = await readBody<{
      task?: string;
      sessionId?: string;
      history?: ChatTurn[];
      results?: { agentId: number; result: string; txHash: string }[];
    }>(req);
    if (!body.task || !body.results?.length) {
      return NextResponse.json({ error: "task and results required" }, { status: 400 });
    }

    const history = rememberChat(body.sessionId || "anon", body.history ?? []);
    const packed = body.results.map((r) => `Agent ${r.agentId} (tx ${r.txHash}):\n${r.result}`).join("\n\n");

    // The hired agents already searched; this call only reconciles their notes,
    // so it runs without web search and just carries their links through.
    const llm = await chatText(
      "Synthesize a final answer from hired-agent notes and the prior conversation. Stay consistent with what you already told the user. Write plain prose for a chat window: no JSON, no field names, no tables, no code blocks. Weave the agents' numbers into sentences and say what they mean. Where two agents disagree, say so rather than averaging them. Keep any source links the notes carry, listed once at the end. Mention this is not financial advice. Max 220 words.",
      `Conversation so far:\n${formatChatHistory(history)}\n\nCurrent task: ${body.task}\n\n${packed}`,
      [],
      420,
      { web: false },
    );

    const answer =
      llm ??
      `Hired ${body.results.length} agents on-chain.\n\n${packed}\n\nAdd OPENROUTER_API_KEY for a tighter synthesis. Not financial advice.`;

    rememberChat(body.sessionId || "anon", [...history, { role: "user", content: body.task }, { role: "assistant", content: answer }]);

    return NextResponse.json({ answer });
  } catch (e) {
    return fail(e, "Could not synthesize");
  }
}
