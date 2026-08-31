import type { Metadata } from "next";
import "./globals.css";
import { appUrl, PRIMARY_HOST, ALIAS_HOST } from "@/lib/site";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl()),
  title: "DeepRomeo",
  description: "A helpful assistant for chat and work.",
  applicationName: "DeepRomeo",
  alternates: {
    canonical: "/",
    languages: {
      "x-default": `https://${PRIMARY_HOST}`,
    },
  },
  icons: { icon: "/icon.svg" },
  other: {
    "application-alias": `https://${ALIAS_HOST}`,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-theme="dark" className="h-full antialiased">
      <body
        className="h-full overflow-hidden"
        style={{
          fontFamily:
            'ui-sans-serif, -apple-system, system-ui, "Segoe UI", Helvetica, sans-serif',
        }}
      >
        {children}
      </body>
    </html>
  );
}
