"use client";

import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { buttonClass } from "./Button";

gsap.registerPlugin(ScrollTrigger);

export type Feature = { icon: ReactNode; label: string };

type Props = {
  title: string;
  description: string;
  features: Feature[];
  visual: ReactNode;
  cta: { label: string; href: string };
  reverse?: boolean;
};

export function FeatureSection({ title, description, features, visual, cta, reverse = false }: Props) {
  const root = useRef<HTMLElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = gsap.context(() => {
      if (cardRef.current) {
        gsap.fromTo(
          cardRef.current,
          { opacity: 0.35, y: 48, scale: 0.97 },
          {
            opacity: 1,
            y: 0,
            scale: 1,
            ease: "none",
            scrollTrigger: { trigger: cardRef.current, start: "top 90%", end: "top 45%", scrub: true },
          },
        );
      }

      gsap.from("[data-reveal]", {
        y: 24,
        opacity: 0,
        duration: 0.7,
        ease: "power3.out",
        stagger: 0.12,
        scrollTrigger: { trigger: root.current, start: "top 75%" },
      });
    }, root);

    return () => ctx.revert();
  }, []);

  return (
    <section ref={root} className="mx-auto w-[85%] max-w-6xl py-16 md:py-24">
      <div
        className={`grid grid-cols-1 items-center gap-10 md:grid-cols-2 md:gap-16 ${
          reverse ? "md:[&>*:first-child]:order-2" : ""
        }`}
      >
        <div
          ref={cardRef}
          className="relative aspect-[4/3] overflow-hidden rounded-3xl bg-[#f7f8fa] shadow-xl ring-1 ring-black/5 will-change-transform"
        >
          {visual}
        </div>

        <div className="flex flex-col">
          <h2 data-reveal className="heading text-3xl text-[#14100e] md:text-4xl">
            {title}
          </h2>
          <p data-reveal className="mt-4 max-w-md text-[15px] leading-relaxed text-[#6B7280] md:text-base">
            {description}
          </p>

          <ul className="mt-8 flex flex-col">
            {features.map((feature) => (
              <li
                key={feature.label}
                data-reveal
                className="flex items-center gap-3 border-t border-[#e5e7eb] py-3.5 text-sm text-[#374151]"
              >
                <span className="text-[#9AA1AD]">{feature.icon}</span>
                {feature.label}
              </li>
            ))}
          </ul>

          <div data-reveal className="mt-8">
            <Link href={cta.href} className={buttonClass("primary", "lg")}>
              {cta.label}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
