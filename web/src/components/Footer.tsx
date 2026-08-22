import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-[#e5e7eb] bg-[#faf9f7]">
      <div className="mx-auto flex w-[85%] max-w-6xl flex-col gap-6 py-12 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="display text-[26px] leading-none text-[#14100e]">Inferno</p>
          <p className="mt-2 text-[13px] text-[#6B7280]">An agent economy on Monad testnet.</p>
        </div>
        <nav className="flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-[#6B7280]">
          <Link href="/chat" className="hover:text-[#111827]">
            Chat
          </Link>
          <Link href="/dashboard" className="hover:text-[#111827]">
            Marketplace
          </Link>
          <Link href="/devil" className="hover:text-[#111827]">
            Devil Mode
          </Link>
        </nav>
      </div>
    </footer>
  );
}
