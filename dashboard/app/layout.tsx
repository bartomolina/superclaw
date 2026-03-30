import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

const LOBSTER_EMOJI_FAVICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E%F0%9F%A6%9E%3C/text%3E%3C/svg%3E";

export const metadata: Metadata = {
  title: "Dashboard - Agents",
  description: "OpenClaw operations dashboard",
  applicationName: "Dashboard",
  icons: {
    icon: LOBSTER_EMOJI_FAVICON,
    shortcut: LOBSTER_EMOJI_FAVICON,
    apple: "/apple-icon",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
