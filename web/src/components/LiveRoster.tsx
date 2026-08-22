"use client";

import { useCatalog } from "@/lib/catalog";
import { mon } from "@/lib/format";

export function LiveRoster() {
  const { agents } = useCatalog();

  return (
    <div className="rounded-[22px] bg-white p-6 shadow-[0_8px_28px_rgba(28,36,51,0.06)]">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[15px] font-semibold text-[#111827]">On the marketplace</h2>
        <span className="text-[12px] text-[#9AA1AD]">{agents.length || "—"} listed</span>
      </div>
      <ul className="mt-4 divide-y divide-[#f0f1f5]">
        {agents.length === 0 && <li className="py-3 text-[13px] text-[#9AA1AD]">Loading the roster…</li>}
        {agents.slice(0, 5).map((agent) => (
          <li key={agent.id} className="flex items-baseline justify-between gap-4 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-[14px] font-medium text-[#111827]">{agent.name}</p>
              <p className="truncate text-[12.5px] text-[#9AA1AD]">{agent.capabilities}</p>
            </div>
            <span className="mono shrink-0 text-[12.5px] text-[#374151]">{mon(agent.priceWei)} MON</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
