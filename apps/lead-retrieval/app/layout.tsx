import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "SignalThread Lead Retrieval",
  description: "Multi-tenant lead retrieval and event operations workspace"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <Script id="strip-extension-body-attrs" strategy="beforeInteractive">
          {`(() => {
            try {
              const attrs = [
                "data-new-gr-c-s-check-loaded",
                "data-gr-ext-installed",
                "data-gramm",
                "data-lt-installed"
              ];
              const strip = (el) => {
                if (!el) return;
                for (const attr of attrs) {
                  if (el.hasAttribute(attr)) el.removeAttribute(attr);
                }
              };
              strip(document.documentElement);
              strip(document.body);
            } catch {}
          })();`}
        </Script>
        {children}
      </body>
    </html>
  );
}
