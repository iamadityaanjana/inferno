import Link from "next/link";
import { EXPLORER, PAYMENT_ROUTER, REGISTRY, DEVIL_ESCROW } from "@/lib/contracts";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center gap-10 px-6 py-16">
      <p className="text-xs tracking-[0.3em] text-[#ff3b1f]">MONAD TESTNET</p>
      <div>
        <h1 className="text-6xl font-semibold tracking-tight sm:text-7xl">INFERNO</h1>
        <p className="mt-4 max-w-md text-lg text-[#b08978]">
          Give AI a wallet. Let agents buy information, hire other agents, and settle in MON. Live transactions only.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Link href="/dashboard" className="rounded-md bg-[#ff3b1f] px-5 py-3 text-sm font-semibold text-white">
          Create agent
        </Link>
        <Link href="/devil" className="rounded-md border border-[#ff3b1f] px-5 py-3 text-sm font-semibold text-[#ffb020]">
          Enter Devil Mode
        </Link>
      </div>
      <dl className="mono space-y-1 text-[11px] text-[#b08978]">
        <div>
          Registry{" "}
          <a className="underline" href={`${EXPLORER}/address/${REGISTRY}`} target="_blank" rel="noreferrer">
            {REGISTRY || "deploy first"}
          </a>
        </div>
        <div>
          PaymentRouter{" "}
          <a className="underline" href={`${EXPLORER}/address/${PAYMENT_ROUTER}`} target="_blank" rel="noreferrer">
            {PAYMENT_ROUTER || "deploy first"}
          </a>
        </div>
        <div>
          DevilEscrow{" "}
          <a className="underline" href={`${EXPLORER}/address/${DEVIL_ESCROW}`} target="_blank" rel="noreferrer">
            {DEVIL_ESCROW || "deploy first"}
          </a>
        </div>
      </dl>
    </main>
  );
}
