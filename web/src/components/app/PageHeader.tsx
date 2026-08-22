import type { ReactNode } from "react";

/**
 * Shared page header: title and optional description on the left, the page's
 * single primary action on the right, separated from content by a hairline.
 * Every app page uses this so headings never drift.
 */
export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-[#eeeeea] pb-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="max-w-2xl">
        <h1 className="heading text-[22px] leading-tight text-[#1c1c1a]">{title}</h1>
        {description && <p className="mt-0.5 text-[13px] leading-5 text-[#8a8a82]">{description}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}
