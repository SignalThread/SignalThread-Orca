import type { SVGProps } from "react";
import type { ProductIcon as ProductIconName } from "@/lib/event-overview/product-catalog";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 16, children, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  );
}

export function ProductIcon({ name, size = 15 }: { name: ProductIconName; size?: number }) {
  switch (name) {
    case "grid":
      return (
        <Svg size={size}>
          <rect width="7" height="7" x="3" y="3" rx="1" />
          <rect width="7" height="7" x="14" y="3" rx="1" />
          <rect width="7" height="7" x="14" y="14" rx="1" />
          <rect width="7" height="7" x="3" y="14" rx="1" />
        </Svg>
      );
    case "id-card":
      return (
        <Svg size={size}>
          <rect width="18" height="18" x="3" y="4" rx="2" />
          <circle cx="12" cy="10" r="3" />
          <path d="M7 20.662V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.662" />
        </Svg>
      );
    case "bed":
      return (
        <Svg size={size}>
          <path d="M2 4v16" />
          <path d="M2 8h18a2 2 0 0 1 2 2v10" />
          <path d="M2 17h20" />
          <path d="M6 8v9" />
        </Svg>
      );
    case "scan":
      return (
        <Svg size={size}>
          <path d="M3 7V5a2 2 0 0 1 2-2h2" />
          <path d="M17 3h2a2 2 0 0 1 2 2v2" />
          <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
          <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
          <path d="M7 12h10" />
        </Svg>
      );
    case "waveform":
      return (
        <Svg size={size}>
          <path d="M2 10v3" />
          <path d="M6 6v11" />
          <path d="M10 3v18" />
          <path d="M14 8v7" />
          <path d="M18 5v13" />
          <path d="M22 10v3" />
        </Svg>
      );
    case "cube":
    default:
      return (
        <Svg size={size}>
          <path d="m21 16-9 5-9-5V8l9-5 9 5z" />
          <path d="m3 8 9 5 9-5" />
          <path d="M12 13v8" />
        </Svg>
      );
  }
}

export function CheckIcon({ size = 13, ...props }: IconProps) {
  return (
    <Svg size={size} strokeWidth={2.4} {...props}>
      <path d="M20 6 9 17l-5-5" />
    </Svg>
  );
}

export function ArrowUpRightIcon({ size = 12, ...props }: IconProps) {
  return (
    <Svg size={size} strokeWidth={2.2} {...props}>
      <path d="M7 7h10v10" />
      <path d="M7 17 17 7" />
    </Svg>
  );
}

export function ChevronLeftIcon({ size = 14, ...props }: IconProps) {
  return (
    <Svg size={size} {...props}>
      <path d="m15 18-6-6 6-6" />
    </Svg>
  );
}

export function LinkIcon({ size = 14, ...props }: IconProps) {
  return (
    <Svg size={size} strokeWidth={2.2} {...props}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </Svg>
  );
}

export function SeverityIcon({ severity, size = 13 }: { severity: "critical" | "at-risk" | "review"; size?: number }) {
  if (severity === "critical") {
    return (
      <Svg size={size} strokeWidth={2.2}>
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v4" />
        <path d="M12 16h.01" />
      </Svg>
    );
  }
  if (severity === "at-risk") {
    return (
      <Svg size={size} strokeWidth={2.2}>
        <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
        <path d="M12 9v4" />
        <path d="M12 17h.01" />
      </Svg>
    );
  }
  return (
    <Svg size={size} strokeWidth={2.2}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </Svg>
  );
}
