import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Babata Lens | Autonomous Crypto & Blockchain Market Analytics",
  description:
    "Institutional-grade autonomous cryptocurrency and blockchain intelligence agent powered by Babata. Real-time multi-provider market telemetry, on-chain wallet diagnostics, and predictive analytics.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`dark ${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="bg-canvas text-gray-100 min-h-screen antialiased selection:bg-cyan-neon/20 selection:text-cyan-neon font-sans">
        {children}
      </body>
    </html>
  );
}