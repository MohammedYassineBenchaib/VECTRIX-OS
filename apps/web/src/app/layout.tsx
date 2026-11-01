import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "@fontsource-variable/archivo";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "VECTRIX OS",
    template: "%s · VECTRIX OS",
  },
  description:
    "Engineering-to-installation workspace for electrical design: plan, circuits, routing, validation and take-off in one model.",
  applicationName: "VECTRIX OS",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#e4e6e0" },
    { media: "(prefers-color-scheme: dark)", color: "#111412" },
  ],
  width: "device-width",
  initialScale: 1,
};

const themeScript = `
(function(){
  try {
    var stored = localStorage.getItem("vx-theme");
    var theme = stored === "dark" || stored === "light" ? stored : "light";
    document.documentElement.dataset.theme = theme;
  } catch (_) {
    document.documentElement.dataset.theme = "light";
  }
})();
`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const headersList = await headers();
  const nonce = headersList.get("x-nonce") ?? "";
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
