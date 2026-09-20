"use client";

import React from "react";

export type NavTab = "chat" | "market" | "wallet" | "providers";

interface NavbarProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ activeTab, onTabChange }) => {
  const tabs: { id: NavTab; label: string; icon: string }[] = [
    { id: "chat", label: "Babata Analyst", icon: "🧠" },
    { id: "market", label: "Market Terminal", icon: "📈" },
    { id: "wallet", label: "Wallet Inspector", icon: "🔍" },
    { id: "providers", label: "System Status", icon: "⚡" },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-surface-border bg-canvas/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        {/* Brand / Logo */}
        <div className="flex items-center space-x-3 cursor-pointer" onClick={() => onTabChange("chat")}>
          <div className="relative w-8 h-8 rounded-lg bg-surface-1 border border-cyan-neon flex items-center justify-center shadow-hud-cyan">
            <div className="w-3.5 h-3.5 rounded-full bg-cyan-neon/80 animate-pulse" />
          </div>
          <div>
            <span className="text-base font-bold font-mono tracking-wider text-gray-100">
              BABATA <span className="text-cyan-neon">LENS</span>
            </span>
            <span className="hidden sm:inline-block ml-2 text-[10px] font-mono text-gray-400 border-l border-surface-border pl-2">
              Autonomous Intelligence
            </span>
          </div>
        </div>

        {/* Tab Switcher */}
        <nav className="flex items-center space-x-1 sm:space-x-2 bg-surface-1 p-1 rounded-xl border border-surface-border">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onTabChange(tab.id)}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-mono transition-all ${
                  isActive
                    ? "bg-cyan-neon/20 text-cyan-neon font-bold border border-cyan-neon/40 shadow-sm"
                    : "text-gray-400 hover:text-gray-200 hover:bg-surface-2/60"
                }`}
              >
                <span>{tab.icon}</span>
                <span className="hidden md:inline">{tab.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Live Status Pill */}
        <div className="hidden lg:flex items-center space-x-2 px-3 py-1 rounded-full bg-surface-1 border border-surface-border text-[11px] font-mono text-gray-300">
          <span className="w-2 h-2 rounded-full bg-emerald-cyber animate-pulse" />
          <span>SYSTEM ACTIVE</span>
        </div>
      </div>
    </header>
  );
};