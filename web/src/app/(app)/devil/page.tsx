"use client";

import { useEffect, useRef, useState } from "react";
import { decodeEventLog, formatEther, parseEther } from "viem";
import { monadTestnet } from "wagmi/chains";
import { useAccount, useBalance, usePublicClient, useWriteContract } from "wagmi";
import { PageHeader } from "@/components/app/PageHeader";
import { Feed } from "@/components/Feed";
import { devilEscrowAbi } from "@/lib/abi";
import { type Activity, pushActivity } from "@/lib/activity";
import { DEVIL_ESCROW, ESCROW_GAS, contractsReady } from "@/lib/contracts";
import { readApiJson } from "@/lib/http";
import type { DevilDeal, DevilHint, DevilPlanRound, DevilSession } from "@/lib/memory";
import { emptyDevil, getSessionId, loadDevil, saveDevil } from "@/lib/session";
import { BTN_PRIMARY, BTN_SECONDARY, CARD, INPUT } from "@/lib/ui";

/** Deal kind ids, matching DevilEscrow.DealType. */
const GUARANTEED = 0;
const RISKY = 1;
const INFO = 2;

export default function DevilPage() {
  const { isConnected, chainId, address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const { data: bal, refetch } = useBalance({
    address,
    chainId: monadTestnet.id,
    query: { enabled: Boolean(address) },
  });

  const [game, setGame] = useState<DevilSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feed, setFeed] = useState<Activity[]>([]);
  const logRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const id = getSessionId();
    setGame(loadDevil() ?? emptyDevil(id));
  }, []);

  useEffect(() => {
    if (game) saveDevil(game);
  }, [game]);

  // The log is a fixed-height scroller, so new lines land below the fold. Pin to
  // the bottom whenever a turn arrives or the Devil starts thinking.
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [game?.turns.length, thinking]);

  const balanceMon = bal ? Number(formatEther(bal.value)) : 0;
  const dealId = game?.dealId ? BigInt(game.dealId) : null;
  const [luckyNumber, setLuckyNumber] = useState("7");

  async function loadLine(snapshot?: DevilSession, opts: { mode?: "deal" | "hint"; round?: number } = {}) {
    const current = snapshot ?? game;
    if (!current) return;
    setThinking(true);
    try {
      const res = await fetch("/api/devil", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: current.id,
          balanceMon,
          last: current.last,
          round: opts.round ?? current.round,
          lives: current.lives,
          mode: opts.mode ?? "deal",
          plan: current.plan,
          turns: current.turns,
          rounds: current.rounds,
        }),
      });
      const data = await readApiJson<{
        line: string;
        deal?: DevilDeal;
        hint?: DevilHint;
        plan?: DevilPlanRound[];
        error?: string;
      }>(res);
      if (!res.ok) throw new Error(data.error ?? "Devil is silent");
      setGame((g) => {
        const base = snapshot ?? g;
        if (!base) return g;
        return {
          ...base,
          line: data.line,
          ...(data.deal ? { deal: data.deal } : {}),
          ...(data.hint ? { hint: data.hint } : {}),
          ...(data.plan ? { plan: data.plan } : {}),
          turns: [...base.turns, { role: "devil", content: data.line, at: Date.now() }],
        };
      });
    } finally {
      setThinking(false);
    }
  }

  /** Fire-and-forget version that surfaces failures instead of dropping them. */
  function say(snapshot?: DevilSession) {
    void loadLine(snapshot).catch((e) => setError(e instanceof Error ? e.message : "Devil is silent"));
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
          turns: [
            ...g.turns,
            { role: "player", content: `Accepted ${g.deal.name} for ${g.deal.stake} MON`, at: Date.now() },
          ],
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
    const kind = game.deal?.id ?? GUARANTEED;
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
          {
            round: game.round,
            dealName: game.deal?.name ?? "deal",
            action: "resolve",
            won,
            hash,
            stake: game.deal?.stake,
          },
        ],
      };
      setGame(next);
      await refetch();
      // An INFO deal's whole product is the leak, so resolving it has to deliver
      // one. Ask about the round just finished, since the API leaks from there.
      if (kind === INFO) await loadLine(next, { mode: "hint", round: game.round });
      else await loadLine(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "resolve failed");
    } finally {
      setBusy(false);
    }
  }

  /** Throws the run away so the next deal comes from a freshly composed one. */
  function newRun() {
    if (!game) return;
    const fresh: DevilSession = {
      ...emptyDevil(game.id),
      turns: [{ role: "player", content: "Deal me a new gauntlet", at: Date.now() }],
    };
    setGame(fresh);
    setFeed([]);
    setError(null);
    say(fresh);
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
    say(next);
  }

  if (!game) return null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 sm:p-5">
      <PageHeader
        title="Devil Mode"
        description="Ten rounds, composed fresh every run. Take the deal or walk — your stake sits in escrow until it resolves."
        action={
          <button
            type="button"
            className={BTN_SECONDARY}
            disabled={busy || thinking || !isConnected}
            onClick={newRun}
          >
            {thinking && !game.deal ? "Dealing…" : "New run"}
          </button>
        }
      />

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Round" value={`${game.round} / 10`} />
        <Stat label="Balance" value={`${balanceMon.toFixed(3)} MON`} />
        <Stat label="Lives" value={String(game.lives)} />
      </div>

      <section className={`${CARD} p-4`}>
        <p className="text-[11px] tracking-[0.16em] text-[#a3a39b]">DEVIL</p>
        <div ref={logRef} className="mt-3 max-h-64 space-y-2.5 overflow-y-auto scroll-smooth">
          {game.turns.slice(-8).map((turn, i) => (
            <p
              key={`${turn.at}-${i}`}
              className={
                turn.role === "player"
                  ? "text-[13px] leading-5 text-[#8a8a82]"
                  : "text-[15px] leading-6 text-[#1c1c1a]"
              }
            >
              <span className="text-[11px] tracking-wide text-[#a3a39b]">
                {turn.role === "devil" ? "DEVIL" : "YOU"} ·{" "}
              </span>
              {turn.content}
            </p>
          ))}
          {game.turns.length === 0 && !thinking && (
            <p className="text-[15px] leading-6 text-[#1c1c1a]">{game.line}</p>
          )}
          {thinking && <Thinking />}
        </div>
        {!game.deal && isConnected && (
          <button className={`${BTN_PRIMARY} mt-4`} disabled={thinking} onClick={() => say()}>
            {thinking ? "The Devil is thinking…" : "Hear a deal"}
          </button>
        )}
        {!isConnected && <p className="mt-4 text-[12.5px] text-[#a3a39b]">Connect a wallet to hear a deal.</p>}
      </section>

      {game.deal && dealId == null && (
        <section className={`${CARD} p-4`}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[13.5px] font-semibold text-[#1c1c1a]">
              Round {game.round} · {game.deal.title ?? game.deal.name}
              {game.deal.title && (
                <span className="ml-2 rounded-md bg-[#f4f4f1] px-1.5 py-0.5 text-[10.5px] font-medium text-[#55554f]">
                  {game.deal.name}
                </span>
              )}
            </h2>
            <span className="mono text-[12px] text-[#8a8a82]">stake {game.deal.stake} MON</span>
          </div>
          <p className="mt-1 text-[12.5px] leading-5 text-[#55554f]">{game.deal.blurb}</p>
          <p className="mt-1.5 text-[12px] leading-5 text-[#a3a39b]">
            {game.deal.id === GUARANTEED &&
              "Accepting locks your stake in escrow, then you claim it back with interest. No guessing involved."}
            {game.deal.id === RISKY &&
              "Accepting locks your stake in escrow, then you pick a number and roll. Losing costs a life."}
            {game.deal.id === INFO &&
              "Accepting locks your stake in escrow and you do not get it back. You get the next three rounds' terms instead."}
          </p>
          <div className="mt-3 flex gap-2">
            <button
              className={BTN_PRIMARY}
              disabled={!isConnected || busy || thinking || !contractsReady()}
              onClick={() => void accept()}
            >
              {busy ? "Signing…" : `Accept · ${game.deal.stake} MON`}
            </button>
            <button className={BTN_SECONDARY} disabled={busy || thinking} onClick={reject}>
              Walk away
            </button>
          </div>
        </section>
      )}

      {dealId != null && game.deal && (
        <section className={`${CARD} p-4`}>
          {game.deal.id === GUARANTEED && (
            <>
              <h2 className="text-[13.5px] font-semibold text-[#1c1c1a]">Collect your winnings</h2>
              <p className="mt-0.5 text-[12.5px] leading-5 text-[#8a8a82]">
                Nothing to guess — a GUARANTEED deal always pays. Your {game.deal.stake} MON is in escrow; claiming
                returns {mon14(game.deal.stake)} MON.
              </p>
              <button className={`${BTN_PRIMARY} mt-3`} disabled={busy || thinking} onClick={() => void resolve(0)}>
                {busy ? "Signing…" : `Claim ${mon14(game.deal.stake)} MON`}
              </button>
            </>
          )}

          {game.deal.id === RISKY && (
            <>
              <h2 className="text-[13.5px] font-semibold text-[#1c1c1a]">Pick your number, then roll</h2>
              <p className="mt-0.5 text-[12.5px] leading-5 text-[#8a8a82]">
                Enter any number from 1 to 99. It is mixed into the on-chain roll, so no two numbers give the same
                result — but every number carries the same odds: <strong className="text-[#55554f]">60% you win</strong>{" "}
                {mon3(game.deal.stake)} MON, 40% the house keeps your {game.deal.stake} MON.
              </p>
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <label className="w-28">
                  <span className="text-[11.5px] text-[#a3a39b]">Your number (1–99)</span>
                  <input
                    type="number"
                    min="1"
                    max="99"
                    className={`${INPUT} mt-1`}
                    value={luckyNumber}
                    onChange={(e) => setLuckyNumber(e.target.value)}
                  />
                </label>
                <button
                  className={BTN_PRIMARY}
                  disabled={busy || thinking || !validNumber(luckyNumber)}
                  onClick={() => void resolve(Number(luckyNumber))}
                >
                  {busy ? "Rolling…" : `Roll with ${validNumber(luckyNumber) ? luckyNumber : "…"}`}
                </button>
              </div>
              {!validNumber(luckyNumber) && (
                <p className="mt-2 text-[12px] text-[#c0392b]">Enter a whole number between 1 and 99.</p>
              )}
            </>
          )}

          {game.deal.id === INFO && (
            <>
              <h2 className="text-[13.5px] font-semibold text-[#1c1c1a]">Collect what you paid for</h2>
              <p className="mt-0.5 text-[12.5px] leading-5 text-[#8a8a82]">
                No guess and no payout — your {game.deal.stake} MON stays with the house. What you get back is the next
                three rounds&apos; terms, so you can decide whether the climb is worth it.
              </p>
              <button className={`${BTN_PRIMARY} mt-3`} disabled={busy || thinking} onClick={() => void resolve(0)}>
                {busy ? "Signing…" : "Collect the leak"}
              </button>
            </>
          )}
        </section>
      )}

      {game.hint && game.hint.rounds.length > 0 && (
        <section className={`${CARD} p-4`}>
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-[13.5px] font-semibold text-[#1c1c1a]">The road ahead</h2>
            <span className="text-[11px] tracking-wide text-[#a3a39b]">BOUGHT WITH AN INFO DEAL</span>
          </div>
          <ul className="mt-2.5 flex flex-col gap-1.5">
            {game.hint.rounds.map((r) => (
              <li
                key={r.round}
                className={`flex flex-wrap items-baseline gap-x-2 rounded-lg px-2.5 py-1.5 text-[12.5px] ${
                  r.round === game.round ? "bg-[#f4f4f1] text-[#1c1c1a]" : "text-[#55554f]"
                }`}
              >
                <span className="mono text-[11.5px] text-[#a3a39b]">R{r.round}</span>
                <span className="font-semibold">{r.name}</span>
                <span className="text-[#8a8a82]">{r.blurb}</span>
                {r.round === game.round && (
                  <span className="rounded-md bg-[#1c1c1a] px-1.5 py-0.5 text-[10.5px] font-medium text-white">
                    now
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {error && <p className="text-[12.5px] text-[#c0392b]">{error}</p>}

      <Feed items={feed} />
    </div>
  );
}

/** Payout previews, mirroring DevilEscrow.resolve so the UI cannot overpromise. */
function mon14(stake: string) {
  return String(Number((Number(stake) * 1.4).toFixed(4)));
}

function mon3(stake: string) {
  return String(Number((Number(stake) * 3).toFixed(4)));
}

/** The contract takes a uint8, so the roll seed has to stay inside one byte. */
function validNumber(raw: string) {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= 99;
}

/** Three pulsing dots under a DEVIL label, so the wait reads as him deciding. */
function Thinking() {
  return (
    <p className="flex items-center gap-2">
      <span className="text-[11px] tracking-wide text-[#a3a39b]">DEVIL ·</span>
      <span className="flex items-center gap-1" aria-label="The Devil is thinking" role="status">
        {[0, 150, 300].map((delay) => (
          <span
            key={delay}
            className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#a3a39b]"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </span>
    </p>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className={`${CARD} px-3 py-2.5`}>
      <p className="text-[11px] tracking-wide text-[#a3a39b]">{label}</p>
      <p className="mt-0.5 text-[14px] font-semibold text-[#1c1c1a]">{value}</p>
    </div>
  );
}
