"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { buttonClass } from "./Button";

const LINKS = [
  { label: "How it works", href: "#how" },
  { label: "Marketplace", href: "/dashboard" },
  { label: "Devil Mode", href: "/devil" },
];

export function SiteNav() {
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      const past = window.scrollY > window.innerHeight * 0.7;
      setHidden(past);
      if (past) setOpen(false);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-transform duration-500 ease-out ${
        hidden ? "-translate-y-full" : "translate-y-0"
      }`}
    >
      <nav className="mx-auto w-full px-5 sm:px-8 md:px-12">
        <div className="flex h-16 items-center justify-between">
          <Link href="/" className="display text-[26px] leading-none text-[#14100e]">
            Inferno
          </Link>

          <ul className="mr-auto ml-[5vw] hidden items-center gap-1 text-sm font-medium text-[#44403c] md:flex">
            {LINKS.map((link) => (
              <li key={link.label}>
                <Link href={link.href} className="block rounded-md px-3 py-1.5 transition-colors hover:bg-black/5">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-2">
            <Link href="/chat" className={buttonClass("secondary")}>
              Open chat
            </Link>
            <Link href="/dashboard" className={`hidden md:inline-flex ${buttonClass("primary")}`}>
              Browse agents
            </Link>

            <button
              onClick={() => setOpen((v) => !v)}
              aria-label="Toggle menu"
              aria-expanded={open}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-black/5 md:hidden"
            >
              <svg className="h-5 w-5 text-[#44403c]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                {open ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M6 18L18 6" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h16M4 17h16" />
                )}
              </svg>
            </button>
          </div>
        </div>

        {open && (
          <div className="mt-1 flex flex-col rounded-2xl bg-white/90 p-2 text-sm font-medium text-[#44403c] shadow-lg backdrop-blur-md md:hidden">
            {LINKS.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2.5 transition-colors hover:bg-black/5"
              >
                {link.label}
              </Link>
            ))}
          </div>
        )}
      </nav>
    </header>
  );
}
