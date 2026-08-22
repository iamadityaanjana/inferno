import type { Activity } from "@/lib/activity";
import { explorerTx } from "@/lib/contracts";
import { shortHash } from "@/lib/format";

export function Feed({ items }: { items: Activity[] }) {
  return (
    <section className="rounded-[22px] bg-white p-6 shadow-[0_8px_28px_rgba(28,36,51,0.06)]">
      <h2 className="mb-3 text-[11px] font-medium tracking-[0.16em] text-[#9AA1AD]">ON-CHAIN</h2>
      <ol className="space-y-2 text-sm">
        {items.length === 0 && <li className="text-[#9AA1AD]">Waiting for a signed deal…</li>}
        {items.map((item) => (
          <li key={item.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-[#f0f1f5] pb-2 last:border-0">
            <span className="mono text-[#9AA1AD]">{item.at}</span>
            <span>{item.text}</span>
            {item.mon !== undefined && <span className="text-[#D6453D]">−{item.mon} MON</span>}
            {item.hash && (
              <a className="mono text-[#2F6FED] underline" href={explorerTx(item.hash)} target="_blank" rel="noreferrer">
                {shortHash(item.hash)}
              </a>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
