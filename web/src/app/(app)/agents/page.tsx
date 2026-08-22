"use client";

import { useCallback, useEffect, useState } from "react";
import { decodeEventLog, formatEther, isAddress, parseEther } from "viem";
import { monadTestnet } from "wagmi/chains";
import { useAccount, usePublicClient, useReadContract, useWriteContract } from "wagmi";
import { EmptyState } from "@/components/app/EmptyState";
import { PageHeader } from "@/components/app/PageHeader";
import { PlugIcon } from "@/components/icons";
import { registryAbi } from "@/lib/abi";
import { useCatalog } from "@/lib/catalog";
import { REGISTRY, explorerTx, withGasBuffer } from "@/lib/contracts";
import { mon, shortAddr } from "@/lib/format";
import { readApiJson } from "@/lib/http";
import type { Listing } from "@/lib/listings";
import { BTN_PRIMARY, BTN_SECONDARY, CARD, INPUT, LABEL } from "@/lib/ui";

export default function AgentsPage() {
  const { address, isConnected } = useAccount();
  // Unfiltered: a lister must still see a listing they have delisted.
  const { allAgents, refetch } = useCatalog();
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

  // Matched on the creating wallet, since payout can point somewhere else.
  const mine = address
    ? listings.filter((l) => (l.owner ?? l.payout).toLowerCase() === address.toLowerCase())
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
              const onChain = allAgents.find((a) => a.id === listing.agentId);
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
                    <span
                      className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium ${
                        onChain && !onChain.active
                          ? "bg-[#f4f4f1] text-[#5f5f59]"
                          : "bg-[#e8f7f2] text-[#1f8a6a]"
                      }`}
                    >
                      {onChain && !onChain.active ? "Delisted" : "Live"}
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

      <PublicSources
        onPublished={async () => {
          await load();
          await refetch();
        }}
      />

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

type PublicSource = {
  id: string;
  name: string;
  blurb: string;
  priceMon: string;
  provider: string;
  docs: string;
  agentId: number | null;
};

/**
 * Free, keyless public APIs that can be published to the registry as cheap
 * agents. Publishing is idempotent, so the button is safe to press twice.
 */
function PublicSources({ onPublished }: { onPublished: () => void | Promise<void> }) {
  const [sources, setSources] = useState<PublicSource[]>([]);
  const [canPublish, setCanPublish] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/datasources");
      const data = await readApiJson<{ sources?: PublicSource[]; canPublish?: boolean }>(res);
      setSources(data.sources ?? []);
      setCanPublish(Boolean(data.canPublish));
    } catch {
      setSources([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function publish() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/datasources", { method: "POST" });
      const data = await readApiJson<{ error?: string }>(res);
      if (!res.ok) throw new Error(data.error ?? "Could not publish");
      await load();
      await onPublished();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not publish");
    } finally {
      setBusy(false);
    }
  }

  if (sources.length === 0) return null;
  const unlisted = sources.filter((s) => s.agentId == null).length;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[13px] font-semibold text-[#1c1c1a]">Public data feeds</h2>
          <p className="mt-0.5 text-[12.5px] leading-5 text-[#8a8a82]">
            Free APIs that need no key. Publish one and it becomes a cheap agent the chat can hire for live numbers.
          </p>
        </div>
        {canPublish && unlisted > 0 && (
          <button type="button" className={BTN_SECONDARY} onClick={() => void publish()} disabled={busy}>
            {busy ? "Publishing…" : `Publish ${unlisted} to marketplace`}
          </button>
        )}
      </div>

      {error && <p className="text-[12.5px] text-[#c0392b]">{error}</p>}

      <div className="grid gap-3 sm:grid-cols-2">
        {sources.map((source) => (
          <div key={source.id} className={`${CARD} p-4`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[14px] font-semibold text-[#1c1c1a]">{source.name}</p>
                <p className="mt-0.5 text-[12px] text-[#a3a39b]">
                  {source.provider}
                  <span className="mx-1.5">·</span>
                  {source.priceMon} MON per hire
                </p>
              </div>
              <span
                className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium ${
                  source.agentId != null ? "bg-[#e8f7f2] text-[#1f8a6a]" : "bg-[#f4f4f1] text-[#5f5f59]"
                }`}
              >
                {source.agentId != null ? `Agent #${source.agentId}` : "Not listed"}
              </span>
            </div>
            <p className="mt-2.5 text-[13px] leading-5 text-[#8a8a82]">{source.blurb}</p>
            <a
              href={source.docs}
              target="_blank"
              rel="noreferrer"
              className="mt-2.5 inline-block text-[12px] text-[#5f5f59] underline decoration-[#d4d4d0] hover:text-[#1c1c1a]"
            >
              API docs
            </a>
          </div>
        ))}
      </div>
    </section>
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
  const { address, isConnected, chainId } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [name, setName] = useState("");
  const [capabilities, setCapabilities] = useState("");
  const [priceMon, setPriceMon] = useState("0.03");
  const [endpoint, setEndpoint] = useState("");
  const [payout, setPayout] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hash, setHash] = useState<`0x${string}` | null>(null);

  const { data: fee } = useReadContract({
    address: REGISTRY,
    abi: registryAbi,
    functionName: "listingFee",
    chainId: monadTestnet.id,
    query: { enabled: Boolean(REGISTRY) },
  });

  // Default to the connected wallet, but leave it editable so a lister can be
  // paid into a treasury or multisig rather than the key they happen to sign with.
  useEffect(() => {
    if (address && !payout) setPayout(address);
  }, [address, payout]);

  const payoutValid = isAddress(payout.trim());

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!payoutValid) {
      setError("Enter a valid payout address");
      return;
    }
    if (!publicClient || !address) return;
    if (chainId !== monadTestnet.id) {
      setError("Switch to Monad Testnet");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const args = [name, capabilities, parseEther(priceMon), payout.trim() as `0x${string}`] as const;
      const value = fee ?? 0n;

      // Estimated per call, never a fixed constant: gas scales with the length
      // of the description, and on Monad the signer pays the whole limit.
      setStep("Estimating gas…");
      const estimate = await publicClient.estimateContractGas({
        address: REGISTRY,
        abi: registryAbi,
        functionName: "register",
        args,
        value,
        account: address,
      });

      setStep("Confirm in your wallet…");
      const txHash = await writeContractAsync({
        address: REGISTRY,
        abi: registryAbi,
        functionName: "register",
        args,
        value,
        gas: withGasBuffer(estimate),
        chainId: monadTestnet.id,
      });
      setHash(txHash);

      setStep("Waiting for confirmation…");
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      if (receipt.status !== "success") throw new Error("Listing transaction reverted");

      let agentId = 0;
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== REGISTRY.toLowerCase()) continue;
        try {
          const decoded = decodeEventLog({
            abi: registryAbi,
            eventName: "AgentRegistered",
            data: log.data,
            topics: log.topics,
          });
          agentId = Number(decoded.args.id);
        } catch {
          // not the event we want
        }
      }
      if (!agentId) throw new Error("Listed, but we could not read the new id");

      // The listing already exists on-chain at this point, so a failure to save
      // the callback URL must not read as a failed listing.
      if (endpoint.trim()) {
        setStep("Saving your callback URL…");
        try {
          const res = await fetch("/api/listings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ agentId, txHash, endpoint: endpoint.trim() }),
          });
          const data = await readApiJson<{ error?: string }>(res);
          if (!res.ok) throw new Error(data.error ?? "Could not save the callback URL");
        } catch (err) {
          setError(
            `Agent #${agentId} is listed, but the callback URL did not save: ${
              err instanceof Error ? err.message : "unknown error"
            }`,
          );
        }
      }

      setName("");
      setCapabilities("");
      setEndpoint("");
      await onListed();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not list");
    } finally {
      setBusy(false);
      setStep(null);
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
      <label className="block sm:col-span-2">
        <span className={LABEL}>Payout wallet</span>
        <input
          className={`${INPUT} mono mt-1`}
          value={payout}
          onChange={(e) => setPayout(e.target.value)}
          placeholder="0x…"
          spellCheck={false}
          required
        />
        <span className="mt-1 block text-[11.5px] text-[#a3a39b]">
          {payout && !payoutValid
            ? "That is not a valid address."
            : "Every hire fee is forwarded here on-chain. Defaults to your connected wallet; change it to be paid elsewhere."}
        </span>
      </label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button type="submit" className={BTN_PRIMARY} disabled={!isConnected || busy || !payoutValid}>
          {busy
            ? (step ?? "Listing…")
            : isConnected
              ? fee
                ? `Publish for ${formatEther(fee)} MON`
                : "Publish"
              : "Connect to publish"}
        </button>
        {fee != null && !busy && (
          <p className="text-[11.5px] text-[#a3a39b]">
            One-off listing fee of {formatEther(fee)} MON, plus gas. Paid from your wallet.
          </p>
        )}
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
