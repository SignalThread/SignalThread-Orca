import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function HelpLayout({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-[1280px]">{children}</div>;
}
