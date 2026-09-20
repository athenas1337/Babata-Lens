"use client";

import React, { useState } from "react";
import { Navbar, NavTab } from "@/components/layout/Navbar";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { MarketOverview } from "@/components/dashboard/MarketOverview";
import { WalletInspector } from "@/components/dashboard/WalletInspector";
import { ProviderStatusMatrix } from "@/components/dashboard/ProviderStatusMatrix";

export default function Home() {
  const [activeTab, setActiveTab] = useState<NavTab>("chat");

  return (
    <div className="relative min-h-screen flex flex-col bg-canvas text-gray-100 overflow-x-hidden">
      {/* Background Ambient Glow Orbs */}
      <div className="fixed -top-40 -left-40 w-96 h-96 bg-cyan-neon/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="fixed top-1/3 -right-40 w-96 h-96 bg-violet-electric/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="fixed -bottom-40 left-1/3 w-96 h-96 bg-cyan-glow/10 rounded-full blur-[100px] pointer-events-none" />

      {/* Navigation */}
      <Navbar activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Main Content Area */}
      <main className="flex-1 w-full flex flex-col justify-start items-center relative z-10">
        {activeTab === "chat" && <ChatPanel />}
        {activeTab === "market" && <MarketOverview />}
        {activeTab === "wallet" && <WalletInspector />}
        {activeTab === "providers" && <ProviderStatusMatrix />}
      </main>

      {/* Footer */}
      <footer className="w-full border-t border-surface-border/60 py-4 px-4 bg-canvas/60 text-center text-xs font-mono text-gray-500 relative z-10">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>
            BABATA LENS v0.1.0 // MULTI-PROVIDER INTELLIGENCE
          </span>
          <span>
            COINGECKO • CMC • ETHERSCAN • ALCHEMY • SOLSCAN • DUNE • BINGX
          </span>
        </div>
      </footer>
    </div>
  );
}