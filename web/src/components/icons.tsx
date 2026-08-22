/**
 * Line icons for the app rail and page headers. Hand-rolled so the bundle stays
 * free of an icon package; all share a 24px box and inherit currentColor.
 */

type Props = { className?: string };

const box = "h-4 w-4 shrink-0";

function Svg({ className, children }: Props & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? box}
      aria-hidden
    >
      {children}
    </svg>
  );
}

export function ChatIcon(p: Props) {
  return (
    <Svg {...p}>
      <path d="M20.5 12a8.5 8.5 0 1 1-4.2-7.3" />
      <path d="M20.5 4.5v4h-4" />
      <path d="M8.5 11h7M8.5 14.5h4" />
    </Svg>
  );
}

export function ShieldIcon(p: Props) {
  return (
    <Svg {...p}>
      <path d="M12 3.2 5 6v5.4c0 4 2.9 7.6 7 9.4 4.1-1.8 7-5.4 7-9.4V6l-7-2.8Z" />
      <path d="m9.2 12.2 2 2 3.6-3.9" />
    </Svg>
  );
}

export function GridIcon(p: Props) {
  return (
    <Svg {...p}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="2" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="2" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="2" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="2" />
    </Svg>
  );
}

export function PlugIcon(p: Props) {
  return (
    <Svg {...p}>
      <path d="M9 3v5M15 3v5" />
      <path d="M6.5 8h11v3.5a5.5 5.5 0 0 1-11 0V8Z" />
      <path d="M12 17v4" />
    </Svg>
  );
}

export function GearIcon(p: Props) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.8v2.4M12 18.8v2.4M4.5 7.5l2 1.2M17.5 15.3l2 1.2M4.5 16.5l2-1.2M17.5 8.7l2-1.2" />
    </Svg>
  );
}

export function FlameIcon(p: Props) {
  return (
    <Svg {...p}>
      <path d="M12 21c3.6 0 6-2.4 6-5.6 0-4-3-5.6-4-9.4-2 1.4-3 3.2-3 5 0 1.2-.8 2-1.8 2S8 12.2 8 11c-1.3 1.4-2 3-2 4.8C6 18.7 8.4 21 12 21Z" />
    </Svg>
  );
}

export function MenuIcon(p: Props) {
  return (
    <Svg {...p}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Svg>
  );
}

export function CloseIcon(p: Props) {
  return (
    <Svg {...p}>
      <path d="M6 6l12 12M6 18L18 6" />
    </Svg>
  );
}

export function ArrowUpIcon(p: Props) {
  return (
    <Svg {...p}>
      <path d="M12 19V5M6 11l6-6 6 6" />
    </Svg>
  );
}

export type IconComponent = (p: Props) => React.ReactElement;
