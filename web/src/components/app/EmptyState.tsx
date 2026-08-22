import type { ReactNode } from "react";
import type { IconComponent } from "@/components/icons";

/** The dashed "nothing here yet" card used across the app. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: IconComponent;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-[200px] flex-col items-center justify-center rounded-xl border border-dashed border-[#d4d4d0] bg-white p-6 text-center">
      <div className="flex size-9 items-center justify-center rounded-md bg-[#f4f4f1] text-[#8a8a82]">
        <Icon className="h-[18px] w-[18px]" />
      </div>
      <p className="mt-3 text-sm font-semibold text-[#1c1c1a]">{title}</p>
      <p className="mt-1 max-w-md text-[13px] leading-5 text-[#8a8a82]">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
