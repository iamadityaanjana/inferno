"use client";

import Link from "next/link";
import { useState } from "react";
import { formatEther, parseEther } from "viem";
import { monadTestnet } from "wagmi/chains";
import { useAccount, useBalance, usePublicClient, useWriteContract } from "wagmi";
import { ConnectButton } from "@/components/ConnectButton";
import { Feed } from "@/components/Feed";
import { devilEscrowAbi } from "@/lib/abi";
import { type Activity, pushActivity } from "@/lib/activity";
import { DEVIL_ESCROW, ESCROW_GAS, contractsReady } from "@/lib/contracts";
import { decodeEventLog } from "viem";

type Deal = { id: number; name: string; stake: string; blurb: string };

const CHALLENGES = [
  { name: "Guess", prompt: "Pick 1–5", options: [1, 2, 3, 4, 5] },
  { name: "Higher / Lower", prompt: "Next number vs 5", options: [1, 2], labels: ["Lower", "Higher"] },
  { name: "Risk Door", prompt: "Pick a door", options: [1, 2, 3], labels: ["Left", "Center", "Right"] },
] as const;

export default function DevilPage() {
  const { address, isConnected, chainId } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const { data: bal, refetch } = useBalance({ address, chainId: monadTestnet.id, query: { enabled: Boolean(address) } });

  const [round, setRound] = useState(1);
  const [lives, setLives] = useState(2);
  const [line, setLine] = useState("Connect. Then we'll talk.");
  const [deal, setDeal] = useState<Deal | null>(null);
  const [dealId, setDealId] = useState<bigint | null>(null);
  const [last, setLast] = useState<"accept" | "reject" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feed, setFeed] = useState<Activity[]>([]);
  const challenge = CHALLENGES[(round - 1) % CHALLENGES.length];

  const balanceMon = bal ? Number(formatEther(bal.value)) : 0;

  async function loadLine() {
    const res = await fetch("/api/devil", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ balanceMon, last, round }),
    });
    const data = (await res.json()) as { line: string; deal: Deal };
    setLine(data.line);
    setDeal(data.deal);
  }

  async function accept() {
    if (!deal || !publicClient) return;
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
        args: [deal.id],
        value: parseEther(deal.stake),
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
      setDealId(id);
      setLast("accept");
      setFeed((f) => pushActivity(f, `Accepted ${deal.name}`, { hash, mon: Number(deal.stake) }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "accept failed");
    } finally {
      setBusy(false);
    }
  }

  async function resolve(guess: number) {
    if (dealId == null || !publicClient) return;
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
      if (!won) setLives((n) => Math.max(0, n - 1));
      setDealId(null);
      setRound((r) => Math.min(10, r + 1));
      await refetch();
      await loadLine();
    } catch (e) {
      setError(e instanceof Error ? e.message : "resolve failed");
    } finally {
      setBusy(false);
    }
  }

  function reject() {
    setLast("reject");
    setDealId(null);
    setRound((r) => Math.min(10, r + 1));
    setFeed((f) => pushActivity(f, "Rejected the deal"));
    void loadLine();
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/" className="text-xl font-semibold">
            INFERNO
          </Link>
          <p className="text-xs text-[#c9a36b]">DEVIL MODE</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="text-sm text-[#b08978]">
            Dashboard
          </Link>
          <ConnectButton />
        </div>
      </header>

      <section className="grid grid-cols-3 gap-3 text-sm">
        <div className="rounded-xl border border-[#3a1a14] p-3">
          Round {round} / 10
        </div>
        <div className="rounded-xl border border-[#3a1a14] p-3">
          {balanceMon.toFixed(3)} MON
        </div>
        <div className="rounded-xl border border-[#3a1a14] p-3">Lives {"♥".repeat(lives) || "—"}</div>
      </section>

      <section className="rounded-xl border border-[#ff3b1f]/50 bg-black/50 p-5">
        <p className="text-xs tracking-[0.2em] text-[#ff3b1f]">DEVIL</p>
        <p className="mt-3 whitespace-pre-wrap text-lg leading-7">{line}</p>
        {!deal && isConnected && (
          <button className="mt-4 rounded-md bg-[#ff3b1f] px-4 py-2 text-sm font-semibold" onClick={loadLine}>
            Hear a deal
          </button>
        )}
      </section>

      {deal && dealId == null && (
        <div className="flex gap-3">
          <button
            className="rounded-md bg-[#ff3b1f] px-4 py-2 text-sm font-semibold"
            disabled={!isConnected || busy || !contractsReady()}
            onClick={accept}
          >
            Accept {deal.stake} MON
          </button>
          <button className="rounded-md border border-[#3a1a14] px-4 py-2 text-sm" disabled={busy} onClick={reject}>
            Reject
          </button>
        </div>
      )}

      {dealId != null && (
        <section className="rounded-xl border border-[#ffb020]/40 p-5">
          <h2 className="font-semibold">{challenge.name}</h2>
          <p className="text-sm text-[#b08978]">{challenge.prompt}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {challenge.options.map((opt, i) => (
              <button
                key={opt}
                className="rounded-md border border-[#ffb020] px-3 py-2 text-sm"
                disabled={busy}
                onClick={() => resolve(opt)}
              >
                {"labels" in challenge ? challenge.labels![i] : String(opt)}
              </button>
            ))}
          </div>
        </section>
      )}

      {error && (
        <p className="text-sm text-[#ff3b1f]">
          {error} {error.toLowerCase().includes("user") ? "" : "— check explorer if a hash exists."}
        </p>
      )}

      <Feed items={feed} />
      <p className="text-xs text-[#9a8070]">
        Accepted stakes sit in DevilEscrow until resolve. They do not go to your wallet or the hire sink.
      </p>
    </main>
  );
}
