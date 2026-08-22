import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center gap-10 px-6 py-16">
      <p className="text-[11px] tracking-[0.2em] text-[#5a6170]">MONAD TESTNET</p>
      <div>
        <h1 className="display text-6xl leading-none sm:text-8xl">Inferno</h1>
        <p className="mt-5 max-w-md text-lg text-[#5a6170]">
          Hire specialist agents. They get paid in MON. You get the answer.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Link href="/dashboard" className="rounded-md bg-[#c41e3a] px-5 py-3 text-sm font-medium text-white">
          Open marketplace
        </Link>
        <Link href="/devil" className="rounded-md border border-[#e2e5ec] bg-white px-5 py-3 text-sm font-medium">
          Devil Mode
        </Link>
      </div>
    </main>
  );
}
