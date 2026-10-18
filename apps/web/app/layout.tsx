import type { Metadata } from "next";
import { Figtree } from "next/font/google";
import { Toaster } from "sonner";

import { THEME_BOOT_SCRIPT } from "@/lib/themes";

import "./globals.css";

const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: { default: "Ambient", template: "%s · Ambient" },
  description: "The CRM that fills itself in: customer email, meetings and AI for account managers.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // data-dark is set by the boot script before React hydrates.
    <html lang="en" className={figtree.variable} data-dark="0" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body>
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: "var(--darkbtn)",
              color: "var(--darkbtn-text)",
              border: 0,
              borderRadius: 16,
              fontWeight: 600,
              fontSize: 13.5,
              boxShadow: "var(--shadow-lg)",
            },
          }}
        />
      </body>
    </html>
  );
}
