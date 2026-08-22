import type { Activity } from "@/lib/activity";
import { explorerTx } from "@/lib/contracts";
import { shortHash } from "@/lib/format";

export function Feed({ items }: { items: Activity[] }) {
  return (
    <section className="rounded-lg border border-[#e2e5ec] bg-white p-4">
      <h2 className="mb-3 text-[11px] font-medium tracking-[0.16em] text-[#5a6170]">ON-CHAIN</h2>
      <ol className="space-y-2 text-sm">
        {items.length === 0 && <li className="text-[#5a6170]">Waiting for a signed deal…</li>}
        {items.map((item) => (
          <li key={item.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-[#e2e5ec] pb-2 last:border-0">
            <span className="mono text-[#5a6170]">{item.at}</span>
            <span>{item.text}</span>
            {item.mon !== undefined && <span className="text-[#c41e3a]">−{item.mon} MON</span>}
            {item.hash && (
              <a className="mono text-[#1f4b99] underline" href={explorerTx(item.hash)} target="_blank" rel="noreferrer">
                {shortHash(item.hash)}
              </a>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
