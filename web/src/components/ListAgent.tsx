"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { buttonClass } from "./Button";
import { readApiJson } from "@/lib/http";

export function ListAgent({ onListed }: { onListed: () => void }) {
  const { address, isConnected } = useAccount();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [capabilities, setCapabilities] = useState("");
  const [priceMon, setPriceMon] = useState("0.03");
  const [endpoint, setEndpoint] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!address) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          capabilities,
          priceMon,
          payout: address,
          endpoint,
        }),
      });
      const data = await readApiJson<{ error?: string }>(res);
      if (!res.ok) throw new Error(data.error ?? "Could not list");
      setName("");
      setCapabilities("");
      setEndpoint("");
      setOpen(false);
      onListed();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not list");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button className={buttonClass("secondary")} onClick={() => setOpen((v) => !v)}>
        {open ? "Close" : "List an agent"}
      </button>
      {open && (
        <form onSubmit={submit} className="mt-4 grid gap-3 rounded-[22px] bg-white p-6 shadow-[0_8px_28px_rgba(28,36,51,0.06)] sm:grid-cols-2">
          <label className="block text-xs text-[#5a6170]">
            Name
            <input
              className="mt-1 w-full rounded-md border border-[#e2e5ec] bg-[#f5f6f8] px-3 py-2 text-sm text-[#14161c]"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Yield Scout"
              required
            />
          </label>
          <label className="block text-xs text-[#5a6170]">
            Price (MON)
            <input
              type="number"
              min="0.001"
              max="2"
              step="0.001"
              className="mt-1 w-full rounded-md border border-[#e2e5ec] bg-[#f5f6f8] px-3 py-2 text-sm text-[#14161c]"
              value={priceMon}
              onChange={(e) => setPriceMon(e.target.value)}
              required
            />
          </label>
          <label className="block text-xs text-[#5a6170] sm:col-span-2">
            What it does
            <input
              className="mt-1 w-full rounded-md border border-[#e2e5ec] bg-[#f5f6f8] px-3 py-2 text-sm text-[#14161c]"
              value={capabilities}
              onChange={(e) => setCapabilities(e.target.value)}
              placeholder="Finds Monad lending rates and flags risk"
              required
            />
          </label>
          <label className="block text-xs text-[#5a6170] sm:col-span-2">
            Callback URL
            <input
              className="mt-1 w-full rounded-md border border-[#e2e5ec] bg-[#f5f6f8] px-3 py-2 text-sm text-[#14161c]"
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder="https://your-agent.example/run"
            />
          </label>
          <div className="flex items-center gap-3 sm:col-span-2">
            <button type="submit" className={buttonClass("primary")} disabled={!isConnected || busy}>
              {busy ? "Listing…" : isConnected ? "Publish" : "Connect to publish"}
            </button>
            {error && <p className="text-sm text-[#D6453D]">{error}</p>}
          </div>
        </form>
      )}
    </div>
  );
}
