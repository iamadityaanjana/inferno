type Variant = "primary" | "secondary" | "outline" | "ghost";
type Size = "sm" | "md" | "lg";

/**
 * Buttons for the landing page. Same ink-on-warm-neutral palette as the app
 * shell's BTN_* primitives in lib/ui, only with the larger sizes the marketing
 * page needs — one button language across the product.
 *
 * Every filled variant states both `bg-*` and `text-*`. Never rely on inherited
 * colour here: these classes land on `<Link>` as often as on `<button>`.
 */
const BASE =
  "inline-flex items-center justify-center gap-2 rounded-[10px] font-medium transition-colors disabled:pointer-events-none";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-[#1c1c1a] text-white hover:bg-[#33332f]",
  secondary: "bg-white text-[#1c1c1a] border border-[#e6e6e2] hover:border-[#c9c9c2]",
  outline: "bg-transparent text-[#1c1c1a] border border-[#c9c9c2] hover:bg-[#e9e9e4]",
  ghost: "bg-transparent text-[#5f5f59] hover:bg-[#e9e9e4] hover:text-[#1c1c1a]",
};

const SIZES: Record<Size, string> = {
  sm: "px-3 py-1.5 text-[13px]",
  md: "px-4 py-2 text-[13px]",
  lg: "px-5 py-2.5 text-sm",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra = "") {
  return `${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${extra}`.trim();
}
