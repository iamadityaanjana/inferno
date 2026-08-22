"use client";

import { useCatalog } from "@/lib/catalog";
import { mon } from "@/lib/format";

const STEPS = [
  { label: "Web Research hired", note: "paid" },
  { label: "Risk Agent hired", note: "paid" },
  { label: "Answer written", note: "done" },
];

export function ChatFlowVisual() {
  return (
    <div className="flex h-full flex-col justify-center gap-3 p-6">
      <div className="ml-auto max-w-[75%] rounded-2xl bg-[#1c1c1a] px-4 py-2.5 text-[13px] text-white">
        Where can I earn yield on Monad right now?
      </div>
      <ol className="mt-1 space-y-2 border-l-2 border-[#c9c9c2] pl-3">
        {STEPS.map((step) => (
          <li key={step.label} className="flex items-baseline gap-2 text-[12.5px] text-[#374151]">
            <span className="text-[#1f8a6a]">✓</span>
            {step.label}
            <span className="mono text-[11px] text-[#9AA1AD]">{step.note}</span>
          </li>
        ))}
      </ol>
      <div className="mt-1 max-w-[85%] rounded-2xl bg-white px-4 py-3 text-[12.5px] leading-5 text-[#4b5563] shadow-sm ring-1 ring-black/5">
        Three specialists agreed on two venues worth checking, with the risk notes folded in.
      </div>
    </div>
  );
}

export function ReceiptsVisual() {
  return (
    <div className="flex h-full flex-col justify-center gap-3 p-6">
      <p className="text-[11px] tracking-[0.16em] text-[#9AA1AD]">SETTLEMENT</p>
      {["Web Research", "DeFi Agent", "Risk Agent"].map((name, i) => (
        <div
          key={name}
          className="flex items-center justify-between rounded-xl bg-white px-4 py-3 shadow-sm ring-1 ring-black/5"
        >
          <div>
            <p className="text-[13px] font-medium text-[#111827]">{name}</p>
            <p className="mono text-[11px] text-[#2F6FED]">0x{"ab3f91c4".slice(i)}…</p>
          </div>
          <span className="mono text-[12px] text-[#374151]">paid</span>
        </div>
      ))}
      <p className="text-[11px] text-[#9AA1AD]">An agent only runs once its payment is confirmed on-chain.</p>
    </div>
  );
}

export function RosterVisual() {
  const { agents } = useCatalog();

  return (
    <div className="flex h-full flex-col justify-center gap-2.5 p-6">
      <div className="flex items-baseline justify-between">
        <p className="text-[11px] tracking-[0.16em] text-[#9AA1AD]">LISTED NOW</p>
        <span className="text-[11px] text-[#9AA1AD]">{agents.length || "—"}</span>
      </div>
      {agents.length === 0 && <p className="text-[12.5px] text-[#9AA1AD]">Reading the registry…</p>}
      {agents.slice(0, 4).map((agent) => (
        <div
          key={agent.id}
          className="flex items-center justify-between gap-3 rounded-xl bg-white px-4 py-2.5 shadow-sm ring-1 ring-black/5"
        >
          <p className="truncate text-[13px] font-medium text-[#111827]">{agent.name}</p>
          <span className="mono shrink-0 text-[12px] text-[#374151]">{mon(agent.priceWei)} MON</span>
        </div>
      ))}
    </div>
  );
}
