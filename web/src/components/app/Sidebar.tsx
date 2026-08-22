"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ConnectButton } from "@/components/ConnectButton";
import {
  ChatIcon,
  CloseIcon,
  FlameIcon,
  GearIcon,
  GridIcon,
  MenuIcon,
  PlugIcon,
  ShieldIcon,
  type IconComponent,
} from "@/components/icons";

type NavItem = { href: string; label: string; icon: IconComponent };

const NAV: NavItem[] = [
  { href: "/chat", label: "Chat", icon: ChatIcon },
  { href: "/marketplace", label: "Explore marketplace", icon: GridIcon },
  { href: "/agents", label: "APIs & Agents", icon: PlugIcon },
  { href: "/devil", label: "Devil Mode", icon: FlameIcon },
];

const FOOTER_NAV: NavItem[] = [
  { href: "/transparency", label: "Transparency", icon: ShieldIcon },
  { href: "/settings", label: "Settings", icon: GearIcon },
];

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2">
      <span className="flex size-6 items-center justify-center rounded-md bg-[#1c1c1a] text-[13px] font-semibold text-white">
        I
      </span>
      <span className="heading text-[17px] text-[#1c1c1a]">Inferno</span>
    </Link>
  );
}

function NavLinks({
  items,
  pathname,
  onNavigate,
}: {
  items: NavItem[];
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <ul className="flex flex-col gap-1">
      {items.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <li key={href}>
            <Link
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={[
                "flex min-h-9 items-center gap-2.5 rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-colors duration-150",
                active
                  ? "border-[#dcdcd6] bg-[#e9e9e4] text-[#1c1c1a]"
                  : "border-transparent text-[#55554f] hover:bg-[#e9e9e4]/60 hover:text-[#1c1c1a]",
              ].join(" ")}
            >
              <Icon className={active ? "h-4 w-4 shrink-0 text-[#1c1c1a]" : "h-4 w-4 shrink-0 text-[#8a8a82]"} />
              <span className="truncate">{label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  const rail = (onNavigate?: () => void) => (
    <>
      <nav className="flex-1 overflow-y-auto">
        <NavLinks items={NAV} pathname={pathname} onNavigate={onNavigate} />
      </nav>
      <div className="flex flex-col gap-2 pt-2">
        <NavLinks items={FOOTER_NAV} pathname={pathname} onNavigate={onNavigate} />
        <div className="px-1">
          <ConnectButton layout="rail" />
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop rail — sits directly on the canvas, no panel chrome. */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[212px] flex-col px-4 pt-5 pb-4 md:flex">
        <div className="px-2 pb-6">
          <Logo />
        </div>
        {rail()}
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between bg-[#f1f1ef]/95 px-4 backdrop-blur md:hidden">
        <Logo />
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
          className="flex size-9 items-center justify-center rounded-lg text-[#55554f] transition-colors hover:bg-[#e9e9e4]"
        >
          <MenuIcon className="h-5 w-5" />
        </button>
      </header>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-zinc-950/35"
          />
          <aside className="absolute inset-y-0 left-0 flex w-[260px] max-w-[88%] flex-col bg-[#f1f1ef] px-4 pt-3 pb-4 shadow-2xl">
            <div className="flex h-12 items-center justify-between px-2">
              <Logo />
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
                className="flex size-9 items-center justify-center rounded-lg text-[#55554f] transition-colors hover:bg-[#e9e9e4]"
              >
                <CloseIcon className="h-5 w-5" />
              </button>
            </div>
            <div className="flex flex-1 flex-col pt-3">{rail(() => setMobileOpen(false))}</div>
          </aside>
        </div>
      )}
    </>
  );
}
