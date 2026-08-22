"use client";

import { useEffect, useState } from "react";
import { formatEther } from "viem";
import { monadTestnet } from "wagmi/chains";
import { useAccount, useBalance } from "wagmi";
import { PageHeader } from "@/components/app/PageHeader";
import { ConnectButton } from "@/components/ConnectButton";
import { CHAIN_ID, EXPLORER, PAYMENT_ROUTER, REGISTRY, explorerAddress } from "@/lib/contracts";
import { shortAddr } from "@/lib/format";
import { readApiJson } from "@/lib/http";
import { defaultPolicy, loadDailySpend, loadPolicy, savePolicy, type Policy } from "@/lib/policy";
import { BTN_PRIMARY, BTN_SECONDARY, CARD, INPUT, LABEL } from "@/lib/ui";

export default function SettingsPage() {
  const { address, isConnected } = useAccount();
  const { data: bal } = useBalance({
    address,
    chainId: monadTestnet.id,
    query: { enabled: Boolean(address) },
  });

  const [policy, setPolicy] = useState<Policy>(defaultPolicy);
  const [spent, setSpent] = useState(0);
  const [autoPay, setAutoPay] = useState<boolean | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setPolicy(loadPolicy());
    setSpent(loadDailySpend());
    fetch("/api/pay")
      .then((r) => readApiJson<{ enabled?: boolean }>(r))
      .then((d) => setAutoPay(Boolean(d.enabled)))
      .catch(() => setAutoPay(false));
  }, []);

  function update(patch: Partial<Policy>) {
    setPolicy((p) => ({ ...p, ...patch }));
    setSaved(false);
  }

  function save() {
    savePolicy(policy);
    setSaved(true);
  }

  function clearMemory() {
    localStorage.removeItem("inferno.chat");
    localStorage.removeItem("inferno.devil");
    setSaved(false);
  }

  const balanceMon = bal ? Number(formatEther(bal.value)) : 0;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4 sm:p-5">
      <PageHeader title="Settings" description="Spend caps, wallet, and what Inferno remembers." />

      <Section title="Wallet" description="Hires are paid from this address in native MON.">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="mono text-[13px] text-[#1c1c1a]">
              {isConnected && address ? shortAddr(address) : "Not connected"}
            </p>
            <p className="mt-0.5 text-[12px] text-[#a3a39b]">
              {isConnected ? `${balanceMon.toFixed(4)} MON on Monad Testnet` : "Connect to hire agents"}
            </p>
          </div>
          <ConnectButton />
        </div>
      </Section>

      <Section
        title="Spend caps"
        description="Enforced in the browser before any transaction is signed. Anything above the approval line asks you first."
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Max per task (MON)">
            <input
              type="number"
              min="0.001"
              step="0.01"
              className={INPUT}
              value={policy.maxPerTaskMon}
              onChange={(e) => update({ maxPerTaskMon: Number(e.target.value) })}
            />
          </Field>
          <Field label="Max per day (MON)">
            <input
              type="number"
              min="0.001"
              step="0.1"
              className={INPUT}
              value={policy.maxDailyMon}
              onChange={(e) => update({ maxDailyMon: Number(e.target.value) })}
            />
          </Field>
          <Field label="Ask me above (MON)">
            <input
              type="number"
              min="0"
              step="0.01"
              className={INPUT}
              value={policy.requireApprovalAboveMon}
              onChange={(e) => update({ requireApprovalAboveMon: Number(e.target.value) })}
            />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className={BTN_PRIMARY} onClick={save}>
            Save caps
          </button>
          <button type="button" className={BTN_SECONDARY} onClick={() => update(defaultPolicy)}>
            Reset to defaults
          </button>
          {saved && <span className="text-[12.5px] text-[#1f8a6a]">Saved.</span>}
        </div>
        <p className="text-[12px] text-[#a3a39b]">
          Spent today: {spent.toFixed(3)} of {policy.maxDailyMon} MON.
        </p>
      </Section>

      <Section title="Signing" description="How each hire gets settled.">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[13px] text-[#55554f]">
            {autoPay === null
              ? "Checking…"
              : autoPay
                ? "Small hires under your approval line settle automatically. Larger ones prompt your wallet."
                : "Every hire prompts your wallet to sign."}
          </p>
          <span
            className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium ${
              autoPay ? "bg-[#e8f7f2] text-[#1f8a6a]" : "bg-[#f4f4f1] text-[#8a8a82]"
            }`}
          >
            {autoPay ? "Auto-pay on" : "Manual"}
          </span>
        </div>
      </Section>

      <Section title="Memory" description="Chat and Devil Mode history live in this browser and shape follow-up answers.">
        <button type="button" className={BTN_SECONDARY} onClick={clearMemory}>
          Clear chat and game history
        </button>
      </Section>

      <Section title="Network" description="Where Inferno is pointed.">
        <dl className="space-y-1.5 text-[12.5px]">
          <Row label="Chain" value={`Monad Testnet · ${CHAIN_ID}`} />
          <Row label="Explorer" value={EXPLORER.replace(/^https?:\/\//, "")} />
          <Row
            label="Registry"
            value={
              REGISTRY ? (
                <a
                  className="mono underline decoration-[#d4d4d0] hover:text-[#1c1c1a]"
                  href={explorerAddress(REGISTRY)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {shortAddr(REGISTRY)}
                </a>
              ) : (
                "Not configured"
              )
            }
          />
          <Row
            label="Payment router"
            value={
              PAYMENT_ROUTER ? (
                <a
                  className="mono underline decoration-[#d4d4d0] hover:text-[#1c1c1a]"
                  href={explorerAddress(PAYMENT_ROUTER)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {shortAddr(PAYMENT_ROUTER)}
                </a>
              ) : (
                "Not configured"
              )
            }
          />
        </dl>
      </Section>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`${CARD} flex flex-col gap-3 p-4`}>
      <div>
        <h2 className="text-[13.5px] font-semibold text-[#1c1c1a]">{title}</h2>
        <p className="mt-0.5 text-[12.5px] leading-5 text-[#8a8a82]">{description}</p>
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className={LABEL}>{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[#a3a39b]">{label}</dt>
      <dd className="text-right text-[#55554f]">{value}</dd>
    </div>
  );
}
