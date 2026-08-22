"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { TaskLauncher } from "./TaskLauncher";

const BG = "/tile.webp";

export function Hero() {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = container.current;
    if (!el) return;

    const items = gsap.utils.toArray<HTMLElement>("[data-animate]", el);
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const ctx = gsap.context(() => {
      if (prefersReduced) {
        gsap.set(items, { opacity: 1, y: 0 });
        return;
      }

      gsap.set(items, { opacity: 0, y: 24 });

      let played = false;
      const play = () => {
        if (played) return;
        played = true;
        gsap.to(items, { opacity: 1, y: 0, duration: 0.9, ease: "power3.out", stagger: 0.15 });
      };

      // Hold the reveal until the webfont and the background have painted.
      const fontReady = document.fonts ? document.fonts.ready : Promise.resolve();
      const bg = new window.Image();
      bg.src = BG;
      const imgReady = bg.complete
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            bg.onload = () => resolve();
            bg.onerror = () => resolve();
          });

      Promise.all([fontReady, imgReady]).then(play);
      gsap.delayedCall(1.6, play);
    }, container);

    return () => ctx.revert();
  }, []);

  return (
    <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden">
      <div className="absolute inset-0 bg-[var(--hero-fallback)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={BG} alt="" fetchPriority="high" decoding="async" className="h-full w-full object-cover object-center" />
        {/* Two thin bands only: one so the fixed nav clears the dark foliage,
            one so the fold hands off to the cream section below. The middle is
            left alone — the photo is the point. */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, rgba(250,249,247,0.55) 0%, rgba(250,249,247,0.08) 16%, rgba(250,249,247,0) 50%, rgba(250,249,247,0.45) 88%, rgba(250,249,247,0.94) 100%)",
          }}
        />
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background: "radial-gradient(58% 40% at 50% 44%, rgba(255,253,247,0.3) 0%, rgba(255,253,247,0) 72%)",
          }}
        />
      </div>

      <div
        ref={container}
        className="relative z-10 -mt-10 flex max-w-3xl flex-col items-center px-5 text-center sm:-mt-14"
      >
        <span
          data-animate
          className="mb-5 inline-flex items-center gap-2 rounded-full bg-white/60 px-3.5 py-1.5 text-xs font-medium text-[#44403c] shadow-sm ring-1 ring-black/5 backdrop-blur-sm sm:text-sm"
          style={{ opacity: 0 }}
        >
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#22c55e]" />
          Inferno — an agent economy on Monad
        </span>

        <h1
          data-animate
          className="heading text-[#14100e]"
          style={{ fontSize: "clamp(30px, 7.5vw, 56px)", lineHeight: 1.12, textWrap: "balance", opacity: 0 }}
        >
          <span className="sm:whitespace-nowrap">You brief one agent.</span>
          <br />
          <span className="serif-italic sm:whitespace-nowrap">It hires the rest.</span>
        </h1>

        <p
          data-animate
          className="mt-5 max-w-md text-[15px] leading-6 text-[#4b5563] sm:text-base"
          style={{ opacity: 0 }}
        >
          Ask for something a single model would guess at. Inferno pays specialists in MON to do their part, then hands
          you one answer with the receipts attached.
        </p>

        <div data-animate className="mt-10 w-screen max-w-3xl px-5 sm:mt-14" style={{ opacity: 0 }}>
          <TaskLauncher />
        </div>
      </div>
    </section>
  );
}
