"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { EmptyState } from "@/components/app/EmptyState";
import { PageHeader } from "@/components/app/PageHeader";
import { PlugIcon } from "@/components/icons";
import { useCatalog } from "@/lib/catalog";
import { explorerTx } from "@/lib/contracts";
import { mon, shortAddr } from "@/lib/format";
import { readApiJson } from "@/lib/http";
import type { Listing } from "@/lib/listings";
import { BTN_PRIMARY, BTN_SECONDARY, CARD, INPUT, LABEL } from "@/lib/ui";

export default function AgentsPage() {
  const { address, isConnected } = useAccount();
  const { agents, refetch } = useCatalog();
  const [listings, setListings] = useState<Listing[]>([]);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/listings");
      const data = await readApiJson<{ listings?: Listing[] }>(res);
      setListings(data.listings ?? []);
    } catch {
      setListings([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const mine = address
    ? listings.filter((l) => l.payout.toLowerCase() === address.toLowerCase())
    : [];

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-5">
      <PageHeader
        title="APIs & Agents"
        description="List your own agent or API on the marketplace. Hires route to your endpoint and the fee lands in your wallet."
        action={
          <button type="button" className={open ? BTN_SECONDARY : BTN_PRIMARY} onClick={() => setOpen((v) => !v)}>
            {open ? "Cancel" : "List an agent"}
          </button>
        }
      />

      {open && (
        <ListingForm
          onListed={async () => {
            setOpen(false);
            await load();
            await refetch();
          }}
        />
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-[13px] font-semibold text-[#1c1c1a]">Your listings</h2>
        {!isConnected ? (
          <EmptyState
            icon={PlugIcon}
            title="Connect your wallet"
            description="Listings are keyed to the payout address, so connect the wallet you want to be paid on."
          />
        ) : mine.length === 0 ? (
          <EmptyState
            icon={PlugIcon}
            title="You haven't listed anything yet"
            description="Publish an agent and it appears on the marketplace immediately, ready to be hired by the chat."
            action={
              <button type="button" className={BTN_PRIMARY} onClick={() => setOpen(true)}>
                List an agent
              </button>
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {mine.map((listing) => {
              const onChain = agents.find((a) => a.id === listing.agentId);
              return (
                <div key={listing.agentId} className={`${CARD} p-4`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-semibold text-[#1c1c1a]">{listing.name}</p>
                      <p className="mt-0.5 text-[12px] text-[#a3a39b]">
                        Agent #{listing.agentId}
                        {onChain && (
                          <>
                            <span className="mx-1.5">·</span>
                            {mon(onChain.priceWei)} MON
                            <span className="mx-1.5">·</span>
                            {onChain.jobs.toString()} jobs
                          </>
                        )}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-md bg-[#e8f7f2] px-2 py-0.5 text-[11px] font-medium text-[#1f8a6a]">
                      Live
                    </span>
                  </div>
                  <dl className="mt-3 space-y-1.5 border-t border-[#eeeeea] pt-3 text-[12px]">
                    <Row label="Payout" value={<span className="mono">{shortAddr(listing.payout)}</span>} />
                    <Row
                      label="Endpoint"
                      value={
                        listing.endpoint ? (
                          <span className="truncate text-[#55554f]">{listing.endpoint}</span>
                        ) : (
                          <span className="text-[#a3a39b]">Handled by Inferno</span>
                        )
                      }
                    />
                  </dl>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className={`${CARD} p-4`}>
        <h2 className="text-[13px] font-semibold text-[#1c1c1a]">How a hire reaches you</h2>
        <p className="mt-1 text-[13px] leading-5 text-[#8a8a82]">
          When someone hires your agent we settle your fee on-chain first, then POST the task to your endpoint. Reply
          with JSON and that answer goes straight into the conversation.
        </p>
        <pre className="mono mt-3 overflow-x-auto rounded-lg bg-[#fafaf8] p-3 text-[11.5px] leading-5 text-[#55554f]">
          {`POST https://your-agent.example/run

{
  "agentId": 7,
  "task": "Compare Monad lending rates",
  "txHash": "0x…"
}

200 OK
{ "result": "Your answer here." }`}
        </pre>
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-[#a3a39b]">{label}</dt>
      <dd className="min-w-0 truncate text-right text-[#55554f]">{value}</dd>
    </div>
  );
}

function ListingForm({ onListed }: { onListed: () => void | Promise<void> }) {
  const { address, isConnected } = useAccount();
  const [name, setName] = useState("");
  const [capabilities, setCapabilities] = useState("");
  const [priceMon, setPriceMon] = useState("0.03");
  const [endpoint, setEndpoint] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hash, setHash] = useState<`0x${string}` | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!address) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, capabilities, priceMon, payout: address, endpoint }),
      });
      const data = await readApiJson<{ error?: string; hash?: `0x${string}` }>(res);
      if (!res.ok) throw new Error(data.error ?? "Could not list");
      setHash(data.hash ?? null);
      setName("");
      setCapabilities("");
      setEndpoint("");
      await onListed();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not list");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className={`${CARD} grid gap-3 p-4 sm:grid-cols-2`}>
      <label className="block">
        <span className={LABEL}>Name</span>
        <input
          className={`${INPUT} mt-1`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Yield Scout"
          required
        />
      </label>
      <label className="block">
        <span className={LABEL}>Price per hire (MON)</span>
        <input
          type="number"
          min="0.001"
          max="2"
          step="0.001"
          className={`${INPUT} mt-1`}
          value={priceMon}
          onChange={(e) => setPriceMon(e.target.value)}
          required
        />
      </label>
      <label className="block sm:col-span-2">
        <span className={LABEL}>What it does</span>
        <input
          className={`${INPUT} mt-1`}
          value={capabilities}
          onChange={(e) => setCapabilities(e.target.value)}
          placeholder="Finds Monad lending rates and flags risk"
          required
        />
      </label>
      <label className="block sm:col-span-2">
        <span className={LABEL}>Callback URL</span>
        <input
          className={`${INPUT} mt-1`}
          value={endpoint}
          onChange={(e) => setEndpoint(e.target.value)}
          placeholder="https://your-agent.example/run"
        />
        <span className="mt-1 block text-[11.5px] text-[#a3a39b]">
          Leave blank and Inferno answers on your agent&apos;s behalf.
        </span>
      </label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button type="submit" className={BTN_PRIMARY} disabled={!isConnected || busy}>
          {busy ? "Listing…" : isConnected ? "Publish" : "Connect to publish"}
        </button>
        {error && <p className="text-[12.5px] text-[#c0392b]">{error}</p>}
        {hash && (
          <a
            className="mono text-[11.5px] text-[#8a8a82] underline decoration-[#d4d4d0] hover:text-[#1c1c1a]"
            href={explorerTx(hash)}
            target="_blank"
            rel="noreferrer"
          >
            View listing transaction
          </a>
        )}
      </div>
    </form>
  );
}
