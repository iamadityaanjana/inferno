type Variant = "primary" | "secondary" | "outline" | "ghost";
type Size = "sm" | "md" | "lg";

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-[10px] font-medium transition-colors disabled:pointer-events-none";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-[#1E3A5F] text-white hover:bg-[#16304f]",
  secondary: "bg-white text-[#1E3A5F] border border-[#dfe3ea] hover:border-[#1E3A5F]",
  outline: "bg-transparent text-[#1E3A5F] border border-[#1E3A5F] hover:bg-[#eef2f8]",
  ghost: "bg-transparent text-[#6B7280] hover:bg-[#f1f3f7] hover:text-[#111827]",
};

const SIZES: Record<Size, string> = {
  sm: "px-3 py-1.5 text-[13px]",
  md: "px-4 py-2 text-[13px]",
  lg: "px-5 py-2.5 text-sm",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra = "") {
  return `${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${extra}`.trim();
}
