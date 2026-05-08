import type { Metadata } from "next";
import { SentryInitializer } from "@/components/SentryInitializer";
import "./wallet-adapter-local.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "SolSoul.fun",
  description: "On-chain dynamic SVG souls for Solana meme launches.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <SentryInitializer />
        {children}
      </body>
    </html>
  );
}
