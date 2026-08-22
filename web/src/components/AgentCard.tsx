import { explorerTx } from "@/lib/contracts";
import { mon, shortHash } from "@/lib/format";
import type { AgentView } from "@/lib/catalog";

export type TileState = {
  status: "idle" | "running" | "done" | "error";
  label?: string;
  hash?: `0x${string}`;
  result?: string;
};

const MARKS: Record<string, { bg: string; fg: string }> = {
  "Web Research": { bg: "#E8F1FF", fg: "#2F6FED" },
  "DeFi Agent": { bg: "#FFF1E4", fg: "#E67A1A" },
  "News Agent": { bg: "#FFF6D6", fg: "#C49212" },
  "Risk Agent": { bg: "#FFE8E6", fg: "#D6453D" },
  "General Research": { bg: "#E8F7F2", fg: "#1F8A6A" },
};

const FALLBACK = [
  { bg: "#EEE9FF", fg: "#5B4BDB" },
  { bg: "#E8F4FF", fg: "#2A7DE1" },
  { bg: "#F1F1EE", fg: "#55554F" },
];

function markFor(name: string) {
  const tone = MARKS[name] ?? FALLBACK[name.length % FALLBACK.length];
  return { ...tone, glyph: name.slice(0, 1).toUpperCase() };
}

function Verified() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0" aria-label="Verified">
      <circle cx="8" cy="8" r="8" fill="#1F8A6A" />
      <path
        d="M4.6 8.15 6.9 10.4 11.4 5.7"
        fill="none"
        stroke="#fff"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function AgentCard({
  agent,
  state,
  disabled,
  onHire,
}: {
  agent: AgentView;
  state?: TileState;
  disabled?: boolean;
  onHire: () => void;
}) {
  const mark = markFor(agent.name);
  const hired = state?.status === "done";
  const running = state?.status === "running";

  return (
    <article className="flex flex-col rounded-xl border border-[#e6e6e2] bg-white p-4 transition-colors hover:border-[#d4d4d0]">
      <div className="flex items-start justify-between gap-3">
        <div
          className="flex size-10 items-center justify-center rounded-lg text-[15px] font-semibold"
          style={{ background: mark.bg, color: mark.fg }}
        >
          {mark.glyph}
        </div>
        <button
          type="button"
          disabled={disabled || running}
          onClick={onHire}
          className={
            hired
              ? "inline-flex h-8 items-center rounded-lg border border-[#e6e6e2] bg-white px-3 text-[13px] font-medium text-[#8a8a82]"
              : "inline-flex h-8 items-center rounded-lg bg-[#1c1c1a] px-3 text-[13px] font-semibold text-white transition-colors hover:bg-[#33332f] disabled:cursor-not-allowed disabled:opacity-50"
          }
        >
          {running ? (state?.label ?? "Hiring…") : hired ? "Hired" : "Hire"}
        </button>
      </div>

      <div className="mt-4 flex items-center gap-1.5">
        <h2 className="text-[14.5px] font-semibold tracking-[-0.01em] text-[#1c1c1a]">{agent.name}</h2>
        <Verified />
      </div>
      <p className="mt-0.5 text-[12px] text-[#a3a39b]">
        {mon(agent.priceWei)} MON per hire
        <span className="mx-1.5">·</span>
        {agent.jobs.toString()} jobs
      </p>
      <p className="mt-2.5 line-clamp-2 text-[13px] leading-5 text-[#8a8a82]">{agent.capabilities}</p>

      {(state?.hash || state?.result) && (
        <div className="mt-3 border-t border-[#eeeeea] pt-3 text-[12px] leading-5">
          {state.hash && (
            <a
              className="mono text-[11px] text-[#8a8a82] underline decoration-[#d4d4d0] hover:text-[#1c1c1a]"
              href={explorerTx(state.hash)}
              target="_blank"
              rel="noreferrer"
            >
              {shortHash(state.hash)}
            </a>
          )}
          {state.result && (
            <p className={`mt-1 line-clamp-3 ${state.status === "error" ? "text-[#c0392b]" : "text-[#55554f]"}`}>
              {state.result}
            </p>
          )}
        </div>
      )}
    </article>
  );
}
