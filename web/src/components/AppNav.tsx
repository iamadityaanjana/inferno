"use client";

import Link from "next/link";
import { ConnectButton } from "./ConnectButton";

export function AppNav({ current }: { current: "market" | "chat" | "devil" }) {
  const left =
    current === "market" ? (
      <Link href="/chat" className="rounded-md border border-[#e2e5ec] bg-white px-3 py-1.5 text-sm">
        Chat
      </Link>
    ) : (
      <Link href="/dashboard" className="rounded-md border border-[#e2e5ec] bg-white px-3 py-1.5 text-sm">
        Marketplace
      </Link>
    );

  return (
    <header className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-4">
        {left}
        <Link href="/" className="display text-2xl leading-none">
          Inferno
        </Link>
      </div>
      <div className="flex items-center gap-3">
        {current !== "devil" && (
          <Link href="/devil" className="text-sm text-[#5a6170] hover:text-[#14161c]">
            Devil
          </Link>
        )}
        <ConnectButton />
      </div>
    </header>
  );
}
