/**
 * Class primitives for the signed-in app. Warm-gray neutrals, black primary
 * actions, one control height, rounded-lg controls and rounded-xl cards.
 * Compose these instead of hand-rolling per-page styles so the UI cannot drift.
 */

export const INK = "#1c1c1a";
export const MUTED = "#8a8a82";

/** Text inputs and textareas. */
export const INPUT =
  "w-full rounded-lg border border-[#e6e6e2] bg-white px-3 py-1.5 text-[13px] text-[#1c1c1a] outline-none transition placeholder:text-[#a3a39b] hover:border-[#d4d4d0] focus:border-[#c9c9c2]";

/** Primary action. One per view. */
export const BTN_PRIMARY =
  "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-[#1c1c1a] px-3 text-[13px] font-semibold text-white transition-colors hover:bg-[#33332f] disabled:cursor-not-allowed disabled:opacity-50";

/** Neutral action. */
export const BTN_SECONDARY =
  "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-[#e6e6e2] bg-white px-3 text-[13px] font-medium text-[#55554f] transition-colors hover:bg-[#fafaf8] disabled:cursor-not-allowed disabled:opacity-50";

/** Borderless tertiary action. */
export const BTN_GHOST =
  "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-[#8a8a82] transition-colors hover:bg-[#f4f4f1] hover:text-[#1c1c1a] disabled:cursor-not-allowed disabled:opacity-50";

/** Card surface inside the page panel. */
export const CARD = "rounded-xl border border-[#e6e6e2] bg-white";

/** Section label above a group of fields. */
export const LABEL = "text-[12px] font-medium text-[#55554f]";
