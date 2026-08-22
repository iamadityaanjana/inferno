"use client";

import { useEffect, useState } from "react";
import { formatEther, parseEther } from "viem";
import { monadTestnet } from "wagmi/chains";
import { useAccount, useBalance, usePublicClient, useWriteContract } from "wagmi";
import { AppNav } from "@/components/AppNav";
import { buttonClass } from "@/components/Button";
import { Feed } from "@/components/Feed";
import { devilEscrowAbi } from "@/lib/abi";
import { type Activity, pushActivity } from "@/lib/activity";
import { DEVIL_ESCROW, ESCROW_GAS, contractsReady } from "@/lib/contracts";
import { readApiJson } from "@/lib/http";
import type { DevilDeal, DevilSession } from "@/lib/memory";
import { emptyDevil, getSessionId, loadDevil, saveDevil } from "@/lib/session";
import { decodeEventLog } from "viem";

const CHALLENGES = [
  { name: "Guess", prompt: "Pick 1–5", options: [1, 2, 3, 4, 5] },
  { name: "Higher / Lower", prompt: "Next number vs 5", options: [1, 2], labels: ["Lower", "Higher"] },
  { name: "Risk Door", prompt: "Pick a door", options: [1, 2, 3], labels: ["Left", "Center", "Right"] },
] as const;

export default function DevilPage() {
  const { isConnected, chainId } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const { address } = useAccount();
  const { data: bal, refetch } = useBalance({ address, chainId: monadTestnet.id, query: { enabled: Boolean(address) } });

  const [game, setGame] = useState<DevilSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feed, setFeed] = useState<Activity[]>([]);

  useEffect(() => {
    const id = getSessionId();
    setGame(loadDevil() ?? emptyDevil(id));
  }, []);

  useEffect(() => {
    if (game) saveDevil(game);
  }, [game]);

  const challenge = CHALLENGES[((game?.round ?? 1) - 1) % CHALLENGES.length];
  const balanceMon = bal ? Number(formatEther(bal.value)) : 0;
  const dealId = game?.dealId ? BigInt(game.dealId) : null;

  async function loadLine(snapshot?: DevilSession) {
    const current = snapshot ?? game;
    if (!current) return;
    const res = await fetch("/api/devil", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: current.id,
        balanceMon,
        last: current.last,
        round: current.round,
        lives: current.lives,
        turns: current.turns,
        rounds: current.rounds,
      }),
    });
    const data = await readApiJson<{ line: string; deal: DevilDeal; error?: string }>(res);
    if (!res.ok) throw new Error(data.error ?? "Devil is silent");
    setGame((g) => {
      const base = snapshot ?? g;
      if (!base) return g;
      return {
        ...base,
        line: data.line,
        deal: data.deal,
        turns: [...base.turns, { role: "devil", content: data.line, at: Date.now() }],
      };
    });
  }

  async function accept() {
    if (!game?.deal || !publicClient) return;
    const accepted = game.deal;
    if (chainId !== monadTestnet.id) {
      setError("Switch to Monad Testnet");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const hash = await writeContractAsync({
        address: DEVIL_ESCROW,
        abi: devilEscrowAbi,
        functionName: "acceptDeal",
        args: [accepted.id],
        value: parseEther(accepted.stake),
        gas: ESCROW_GAS,
        chainId: monadTestnet.id,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("acceptDeal reverted");
      let id: bigint | null = null;
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== DEVIL_ESCROW.toLowerCase()) continue;
        try {
          const decoded = decodeEventLog({
            abi: devilEscrowAbi,
            eventName: "DealAccepted",
            data: log.data,
            topics: log.topics,
          });
          id = decoded.args.dealId;
        } catch {
          // skip
        }
      }
      if (id == null) throw new Error("DealAccepted event missing");
      setGame((g) => {
        if (!g || !g.deal) return g;
        return {
          ...g,
          last: "accept",
          dealId: id.toString(),
          turns: [...g.turns, { role: "player", content: `Accepted ${g.deal.name} for ${g.deal.stake} MON`, at: Date.now() }],
          rounds: [
            ...g.rounds,
            { round: g.round, dealName: g.deal.name, action: "accept", hash, stake: g.deal.stake },
          ],
        };
      });
      setFeed((f) => pushActivity(f, `Accepted ${accepted.name}`, { hash, mon: Number(accepted.stake) }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "accept failed");
    } finally {
      setBusy(false);
    }
  }

  async function resolve(guess: number) {
    if (dealId == null || !publicClient || !game) return;
    setBusy(true);
    setError(null);
    try {
      const hash = await writeContractAsync({
        address: DEVIL_ESCROW,
        abi: devilEscrowAbi,
        functionName: "resolve",
        args: [dealId, guess],
        gas: ESCROW_GAS,
        chainId: monadTestnet.id,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("resolve reverted");
      let won = false;
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== DEVIL_ESCROW.toLowerCase()) continue;
        try {
          const decoded = decodeEventLog({
            abi: devilEscrowAbi,
            eventName: "DealResolved",
            data: log.data,
            topics: log.topics,
          });
          won = Boolean(decoded.args.won);
        } catch {
          // skip
        }
      }
      setFeed((f) =>
        pushActivity(f, won ? "Deal resolved — you took the pot" : "Deal resolved — house kept the stake", { hash }),
      );
      const next: DevilSession = {
        ...game,
        lives: won ? game.lives : Math.max(0, game.lives - 1),
        dealId: null,
        last: "accept",
        round: Math.min(10, game.round + 1),
        turns: [...game.turns, { role: "player", content: `Guess ${guess} — ${won ? "won" : "lost"}`, at: Date.now() }],
        rounds: [
          ...game.rounds,
          { round: game.round, dealName: game.deal?.name ?? "deal", action: "resolve", won, hash, stake: game.deal?.stake },
        ],
      };
      setGame(next);
      await refetch();
      await loadLine(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "resolve failed");
    } finally {
      setBusy(false);
    }
  }

  function reject() {
    if (!game) return;
    const next: DevilSession = {
      ...game,
      last: "reject",
      dealId: null,
      round: Math.min(10, game.round + 1),
      turns: [...game.turns, { role: "player", content: `Rejected ${game.deal?.name ?? "the deal"}`, at: Date.now() }],
      rounds: [
        ...game.rounds,
        { round: game.round, dealName: game.deal?.name ?? "deal", action: "reject", stake: game.deal?.stake },
      ],
    };
    setGame(next);
    setFeed((f) => pushActivity(f, "Rejected the deal"));
    void loadLine(next);
  }

  if (!game) return null;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-8">
      <AppNav current="devil" />

      <section className="grid grid-cols-3 gap-4 text-sm">
        <div className="rounded-[18px] bg-white p-4 shadow-[0_8px_28px_rgba(28,36,51,0.06)]">Round {game.round} / 10</div>
        <div className="rounded-[18px] bg-white p-4 shadow-[0_8px_28px_rgba(28,36,51,0.06)]">{balanceMon.toFixed(3)} MON</div>
        <div className="rounded-[18px] bg-white p-4 shadow-[0_8px_28px_rgba(28,36,51,0.06)]">Lives {game.lives}</div>
      </section>

      <section className="rounded-[22px] bg-white p-6 shadow-[0_8px_28px_rgba(28,36,51,0.06)]">
        <p className="text-[11px] tracking-[0.16em] text-[#9AA1AD]">DEVIL</p>
        <div className="mt-3 max-h-64 space-y-3 overflow-y-auto">
          {game.turns.slice(-8).map((turn, i) => (
            <p key={`${turn.at}-${i}`} className={`text-sm leading-6 ${turn.role === "player" ? "text-[#6B7280]" : "text-[17px] leading-7"}`}>
              <span className="text-[11px] tracking-wide text-[#9AA1AD]">{turn.role === "devil" ? "DEVIL" : "YOU"} · </span>
              {turn.content}
            </p>
          ))}
          {game.turns.length === 0 && <p className="text-lg leading-7">{game.line}</p>}
        </div>
        {!game.deal && isConnected && (
          <button className={buttonClass("primary", "md", "mt-4")} onClick={() => void loadLine()}>
            Hear a deal
          </button>
        )}
      </section>

      {game.deal && dealId == null && (
        <div className="flex gap-3">
          <button
            className={buttonClass("primary", "md")}
            disabled={!isConnected || busy || !contractsReady()}
            onClick={() => void accept()}
          >
            Accept {game.deal.stake} MON
          </button>
          <button className={buttonClass("secondary", "md")} disabled={busy} onClick={reject}>
            Reject
          </button>
        </div>
      )}

      {dealId != null && (
        <section className="rounded-[22px] bg-white p-6 shadow-[0_8px_28px_rgba(28,36,51,0.06)]">
          <h2 className="text-[15px] font-semibold text-[#111827]">{challenge.name}</h2>
          <p className="text-sm text-[#6B7280]">{challenge.prompt}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {challenge.options.map((opt, i) => (
              <button
                key={opt}
                className={buttonClass("outline", "md")}
                disabled={busy}
                onClick={() => void resolve(opt)}
              >
                {"labels" in challenge ? challenge.labels[i] : String(opt)}
              </button>
            ))}
          </div>
        </section>
      )}

      {error && <p className="text-sm text-[#D6453D]">{error}</p>}

      <Feed items={feed} />
    </main>
  );
}
