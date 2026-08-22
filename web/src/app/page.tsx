import Link from "next/link";
import { DEVIL_ESCROW, EXPLORER, PAYMENT_ROUTER, PAY_TO, REGISTRY } from "@/lib/contracts";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center gap-10 px-6 py-16">
      <p className="text-xs tracking-[0.28em] text-[#c9a36b]">MONAD TESTNET</p>
      <div>
        <h1 className="text-6xl leading-none sm:text-8xl">Inferno</h1>
        <p className="mt-5 max-w-md text-lg text-[#9a8070]">
          Give an agent a wallet. It hires specialists, pays them in MON, and shows you every step.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Link href="/dashboard" className="rounded-sm bg-[#c23b22] px-5 py-3 text-sm font-medium text-[#f2e6d4]">
          Open chat
        </Link>
        <Link href="/devil" className="rounded-sm border border-[#c23b22] px-5 py-3 text-sm font-medium text-[#c9a36b]">
          Devil Mode
        </Link>
      </div>
      <p className="max-w-lg text-sm leading-6 text-[#9a8070]">
        Hire fees do not stay in the router. They land in the marketplace sink{" "}
        <a className="underline decoration-[#c9a36b]/40" href={`${EXPLORER}/address/${PAY_TO}`} target="_blank" rel="noreferrer">
          {PAY_TO || "PAY_TO"}
        </a>
        . Devil stakes sit in escrow until the deal resolves.
      </p>
      <dl className="mono space-y-1 text-[11px] text-[#9a8070]">
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
