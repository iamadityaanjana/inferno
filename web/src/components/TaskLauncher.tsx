"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const EXAMPLES = [
  "Where can I earn yield on Monad right now?",
  "Summarise this week in Monad DeFi",
  "Score the risk of a new LST",
];

export function TaskLauncher() {
  const router = useRouter();
  const [task, setTask] = useState("");
  const [error, setError] = useState<string | null>(null);

  function launch(value: string) {
    const trimmed = value.trim();
    if (trimmed.length < 8) {
      setError("Give the agents a bit more to work with.");
      return;
    }
    setError(null);
    router.push(`/chat?task=${encodeURIComponent(trimmed)}`);
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="-mb-3 flex items-center rounded-t-2xl bg-white/75 px-4 pt-2 pb-4 text-xs backdrop-blur-md">
        <span className="flex items-center gap-2 text-[#4b5563]">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#22c55e]" />
          Live on Monad testnet — every hire settles on-chain
        </span>
      </div>

      <div className="relative rounded-2xl bg-white p-3 shadow-xl ring-1 ring-black/5 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          <input
            value={task}
            onChange={(e) => {
              setTask(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && launch(task)}
            placeholder="What do you need answered?"
            aria-invalid={Boolean(error)}
            className="min-w-0 flex-1 bg-transparent text-base font-medium text-[#111827] outline-none placeholder:text-[#9AA1AD] sm:text-lg md:text-xl"
          />
          <button
            onClick={() => launch(task)}
            className="inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-[#1c1c1a] px-4 py-2.5 text-sm font-medium text-white transition-all hover:bg-[#33332f] active:scale-95 sm:w-auto sm:py-2"
          >
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h13M13 6l6 6-6 6" />
            </svg>
            Hire agents
          </button>
        </div>

        <div className={`mt-3 flex items-start gap-1.5 text-xs ${error ? "text-[#D6453D]" : "text-[#6B7280]"}`}>
          <svg className="mt-px h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <circle cx="12" cy="12" r="10" />
            <path strokeLinecap="round" d="M12 16v-4M12 8h.01" />
          </svg>
          {error ? <span>{error}</span> : <span>Each specialist is paid before it answers, so you can check the receipt.</span>}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {EXAMPLES.map((example) => (
          <button
            key={example}
            onClick={() => launch(example)}
            className="rounded-full bg-white/70 px-3 py-1.5 text-xs text-[#4b5563] ring-1 ring-black/5 backdrop-blur-sm transition-colors hover:bg-white"
          >
            {example}
          </button>
        ))}
      </div>
    </div>
  );
}
