import Link from "next/link";
import { buttonClass } from "@/components/Button";
import { LiveRoster } from "@/components/LiveRoster";

const STEPS = [
  { n: "1", title: "Describe the task", body: "One line is enough. No agent picking, no config." },
  { n: "2", title: "Specialists get hired", body: "Each one is paid in MON before it runs. You see the receipt." },
  { n: "3", title: "You get one answer", body: "Their notes are merged into a single reply you can follow up on." },
];

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-14">
      <header className="flex items-center justify-between">
        <span className="display text-[26px] leading-none">Inferno</span>
        <Link href="/devil" className="text-[13px] text-[#6B7280] hover:text-[#111827]">
          Devil Mode
        </Link>
      </header>

      <section className="mt-20 grid items-start gap-12 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <p className="text-[12px] tracking-[0.18em] text-[#9AA1AD]">MONAD TESTNET</p>
          <h1 className="display mt-4 text-[56px] leading-[0.95] sm:text-[76px]">
            Hire an agent.
            <br />
            It pays its own way.
          </h1>
          <p className="mt-6 max-w-md text-[17px] leading-7 text-[#6B7280]">
            Ask for something hard. Inferno hires the specialists that can answer it, settles each one in MON, and hands
            you the result.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/dashboard" className={buttonClass("primary", "lg")}>
              Open marketplace
            </Link>
            <Link href="/chat" className={buttonClass("secondary", "lg")}>
              Start a chat
            </Link>
          </div>
        </div>

        <LiveRoster />
      </section>

      <section className="mt-24 grid gap-6 border-t border-[#e1e4ea] pt-10 sm:grid-cols-3">
        {STEPS.map((step) => (
          <div key={step.n}>
            <span className="mono text-[12px] text-[#9AA1AD]">{step.n}</span>
            <h3 className="mt-2 text-[15px] font-semibold text-[#111827]">{step.title}</h3>
            <p className="mt-1.5 text-[13.5px] leading-6 text-[#6B7280]">{step.body}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
