import { buttonClass } from "./Button";
import { explorerTx } from "@/lib/contracts";
import { mon, shortHash } from "@/lib/format";
import type { AgentView } from "@/lib/catalog";

export type TileState = {
  status: "idle" | "running" | "done" | "error";
  label?: string;
  hash?: `0x${string}`;
  result?: string;
};

const MARKS: Record<string, { bg: string; fg: string; glyph: string }> = {
  "Web Research": { bg: "#E8F1FF", fg: "#2F6FED", glyph: "W" },
  "DeFi Agent": { bg: "#FFF1E4", fg: "#E67A1A", glyph: "D" },
  "News Agent": { bg: "#FFF6D6", fg: "#C49212", glyph: "N" },
  "Risk Agent": { bg: "#FFE8E6", fg: "#D6453D", glyph: "R" },
  "General Research": { bg: "#E8F7F2", fg: "#1F8A6A", glyph: "G" },
};

function markFor(name: string) {
  if (MARKS[name]) return MARKS[name];
  const palette = [
    { bg: "#EEE9FF", fg: "#5B4BDB", glyph: name.slice(0, 1).toUpperCase() },
    { bg: "#E8F4FF", fg: "#2A7DE1", glyph: name.slice(0, 1).toUpperCase() },
    { bg: "#F3F4F6", fg: "#374151", glyph: name.slice(0, 1).toUpperCase() },
  ];
  return palette[name.length % palette.length];
}

function Verified() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0" aria-label="Verified">
      <circle cx="8" cy="8" r="8" fill="#22C55E" />
      <path d="M4.6 8.15 6.9 10.4 11.4 5.7" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
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
    <article className="flex min-h-[220px] flex-col rounded-[22px] bg-white p-6 shadow-[0_8px_28px_rgba(28,36,51,0.06)]">
      <div className="flex items-start justify-between gap-3">
        <div
          className="flex h-12 w-12 items-center justify-center rounded-[14px] text-lg font-medium"
          style={{ background: mark.bg, color: mark.fg }}
        >
          {mark.glyph}
        </div>
        <button
          type="button"
          disabled={disabled || running}
          onClick={onHire}
          className={hired ? buttonClass("outline", "sm") : buttonClass("ghost", "sm")}
        >
          {running ? (state?.label ?? "Hiring…") : hired ? "Hired" : "Hire"}
        </button>
      </div>

      <div className="mt-5 flex items-center gap-1.5">
        <h2 className="text-[17px] font-semibold tracking-tight text-[#111827]">{agent.name}</h2>
        <Verified />
      </div>
      <p className="mt-1 text-[13px] text-[#9AA1AD]">
        by Inferno
        <span className="mx-1.5 text-[#D1D5DB]">·</span>
        {mon(agent.priceWei)} MON
      </p>
      <p className="mt-3 line-clamp-2 text-[13.5px] leading-6 text-[#6B7280]">{agent.capabilities}</p>

      {(state?.hash || state?.result) && (
        <div className="mt-auto pt-4 text-[12px] leading-5">
          {state.hash && (
            <a className="text-[#2F6FED] underline" href={explorerTx(state.hash)} target="_blank" rel="noreferrer">
              {shortHash(state.hash)}
            </a>
          )}
          {state.result && (
            <p className={`mt-1 line-clamp-3 ${state.status === "error" ? "text-[#D6453D]" : "text-[#374151]"}`}>
              {state.result}
            </p>
          )}
        </div>
      )}
    </article>
  );
}
