"use client";

import Link from "next/link";
import { buttonClass } from "./Button";
import { ConnectButton } from "./ConnectButton";

export function AppNav({ current }: { current: "market" | "chat" | "devil" }) {
  const left =
    current === "market" ? (
      <Link href="/chat" className={buttonClass("secondary")}>
        Chat
      </Link>
    ) : (
      <Link href="/dashboard" className={buttonClass("secondary")}>
        Marketplace
      </Link>
    );

  return (
    <header className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-4">
        {left}
        <Link href="/" className="display text-[28px] leading-none">
          Inferno
        </Link>
      </div>
      <div className="flex items-center gap-3">
        {current !== "devil" && (
          <Link href="/devil" className="text-[13px] text-[#6B7280] hover:text-[#111827]">
            Devil
          </Link>
        )}
        <ConnectButton />
      </div>
    </header>
  );
}
