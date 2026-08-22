import type { Activity } from "@/lib/activity";
import { explorerTx } from "@/lib/contracts";
import { shortHash } from "@/lib/format";

export function Feed({ items }: { items: Activity[] }) {
  return (
    <section className="rounded-xl border border-[#3a1a14] bg-black/40 p-4">
      <h2 className="mb-3 text-xs font-semibold tracking-[0.2em] text-[#ffb020]">LIVE AGENT ACTIVITY</h2>
      <ol className="space-y-2 text-sm">
        {items.length === 0 && <li className="text-[#b08978]">Waiting for a task or a hire…</li>}
        {items.map((item) => (
          <li key={item.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-[#3a1a14] pb-2 last:border-0">
            <span className="mono text-[#b08978]">{item.at}</span>
            <span>{item.text}</span>
            {item.mon !== undefined && <span className="text-[#ff3b1f]">−{item.mon} MON</span>}
            {item.hash && (
              <a className="mono text-[#ffb020] underline" href={explorerTx(item.hash)} target="_blank" rel="noreferrer">
                {shortHash(item.hash)}
              </a>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
