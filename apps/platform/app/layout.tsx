import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SignalThread",
  description: "The SignalThread platform front door.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
